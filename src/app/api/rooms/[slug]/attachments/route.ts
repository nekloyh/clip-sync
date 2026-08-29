import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { guardRoom } from '@/lib/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { ATTACHMENTS_BUCKET, attachmentUrl } from '@/lib/rooms';
import { POLICIES, enforceAll, clientIdentity } from '@/lib/limiter';
import { roomRef } from '@/lib/pseudonym';
import { track, trackOnce, EVENTS, sizeBucket, mimeCategory } from '@/lib/analytics';
import { log, requestIdFrom } from '@/lib/log';
import { ErrorCode } from '@/lib/errors';
import { fail, rateLimitResponse, ERR_INTERNAL } from '@/lib/http';
import {
  isAllowedImageType,
  sniffImageType,
  extensionFor,
  sanitizeFilename,
} from '@/lib/images';
import type { Attachment } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'POST /api/rooms/[slug]/attachments';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ROOM = 20;

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const requestId = requestIdFrom(req.headers);
  const guarded = await guardRoom(params.slug, ROUTE);
  if (!guarded.ok) return guarded.response;

  const ref = roomRef(guarded.room.id);
  const actor = guarded.capabilities.canManage ? 'owner' : 'recipient';

  const limit = await enforceAll([
    { policy: POLICIES.upload, identity: `${clientIdentity(req.headers)}:${ref}` },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);

  const supabase = createAdminClient();

  try {
    const { count, error: countErr } = await supabase
      .from('attachments')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', guarded.room.id);

    if (countErr) {
      return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
        requestId,
        route: ROUTE,
        roomRef: ref,
        cause: countErr,
      });
    }
    if ((count ?? 0) >= MAX_ATTACHMENTS_PER_ROOM) {
      return reject(
        ErrorCode.ROOM_FULL,
        `Phòng đã đạt giới hạn tối đa ${MAX_ATTACHMENTS_PER_ROOM} ảnh.`
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return reject(ErrorCode.INVALID_REQUEST, 'Không tìm thấy file tải lên');
    }
    if (file.size === 0) {
      return reject(ErrorCode.INVALID_REQUEST, 'Tập tin rỗng');
    }
    if (file.size > MAX_FILE_SIZE) {
      return reject(ErrorCode.PAYLOAD_TOO_LARGE, 'Kích thước file vượt quá giới hạn tối đa 5MB.');
    }
    if (!isAllowedImageType(file.type)) {
      return reject(
        ErrorCode.UNSUPPORTED_MEDIA,
        'Chỉ chấp nhận ảnh PNG, JPEG, GIF, WebP, AVIF hoặc BMP.'
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffImageType(buffer.subarray(0, 32));
    if (!sniffed || sniffed !== file.type) {
      return reject(
        ErrorCode.UNSUPPORTED_MEDIA,
        'Nội dung tập tin không khớp với định dạng ảnh đã khai báo.'
      );
    }

    // Random object name: the user-supplied filename never reaches the storage
    // path, so there is nothing to traverse or collide with.
    const filename = sanitizeFilename(file.name);
    const storagePath = `${guarded.room.id}/${randomUUID()}.${extensionFor(sniffed)}`;

    const { error: uploadErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, buffer, { contentType: sniffed, upsert: false });

    if (uploadErr) {
      await track({
        name: EVENTS.ATTACHMENT_UPLOADED,
        roomRef: ref,
        actor,
        sizeBucket: sizeBucket(file.size),
        mimeCategory: mimeCategory(sniffed),
        outcome: 'failure',
        errorCode: ErrorCode.UPLOAD_FAILED,
      });
      return fail(500, ErrorCode.UPLOAD_FAILED, 'Tải ảnh lên thất bại', {
        requestId,
        route: ROUTE,
        roomRef: ref,
        cause: uploadErr,
      });
    }

    const { data: row, error: insertErr } = await supabase
      .from('attachments')
      .insert([
        {
          room_id: guarded.room.id,
          storage_path: storagePath,
          filename,
          mime: sniffed,
          size: file.size,
        },
      ])
      .select('id, room_id, filename, mime, size, created_at')
      .single();

    if (insertErr) {
      // Do not leave the object behind if the row could not be written.
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
      return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
        requestId,
        route: ROUTE,
        roomRef: ref,
        cause: insertErr,
      });
    }

    const attachment: Attachment = {
      id: row.id,
      room_id: row.room_id,
      filename: row.filename,
      mime: row.mime,
      size: row.size,
      created_at: row.created_at,
      url: attachmentUrl(guarded.slug, row.id),
    };

    // Bucketed size and a top-level MIME category. Not the byte count, which
    // together with a timestamp fingerprints a specific file, and never the
    // filename, which is frequently the most revealing thing about a support
    // screenshot ("acme-prod-db-credentials.png").
    await track({
      name: EVENTS.ATTACHMENT_UPLOADED,
      roomRef: ref,
      actor,
      sizeBucket: sizeBucket(file.size),
      mimeCategory: mimeCategory(sniffed),
    });
    // An attachment is content too: a room where the whole handoff was one
    // screenshot has transferred content, and counting only text saves would
    // score it as an abandoned room.
    await trackOnce({ name: EVENTS.FIRST_CONTENT_TRANSFERRED, roomRef: ref, actor });

    log.info({
      event: 'attachment.uploaded',
      requestId,
      route: ROUTE,
      roomRef: ref,
      actor,
      outcome: 'success',
      degraded: limit.degraded || undefined,
    });

    return NextResponse.json({ attachment });
  } catch (err) {
    return fail(500, ErrorCode.INTERNAL, ERR_INTERNAL, {
      requestId,
      route: ROUTE,
      roomRef: ref,
      cause: err,
    });
  }

  /**
   * A rejected upload, recorded as a failed funnel event.
   *
   * Rejections are counted because "people keep trying to send us PDFs" and
   * "people keep hitting the 5MB cap" are product findings this pilot needs,
   * and they are invisible if only successes are recorded. The event carries
   * the reason code and the size bucket - never the filename or the declared
   * content type, both of which are attacker-supplied strings.
   */
  function reject(code: (typeof ErrorCode)[keyof typeof ErrorCode], message: string) {
    void track({
      name: EVENTS.ATTACHMENT_UPLOADED,
      roomRef: ref,
      actor,
      outcome: 'failure',
      errorCode: code,
    });
    return fail(400, code, message, { requestId, route: ROUTE, roomRef: ref });
  }
}
