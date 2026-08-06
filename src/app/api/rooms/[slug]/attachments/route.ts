import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { guardRoom } from '@/lib/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { ATTACHMENTS_BUCKET, attachmentUrl } from '@/lib/rooms';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { fail, tooManyRequests, ERR_INTERNAL } from '@/lib/http';
import {
  isAllowedImageType,
  sniffImageType,
  extensionFor,
  sanitizeFilename,
} from '@/lib/images';
import type { Attachment } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ROOM = 20;
const UPLOAD_LIMIT = 30;
const UPLOAD_WINDOW_MS = 60_000;

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const guarded = await guardRoom(params.slug);
  if (!guarded.ok) return guarded.response;

  const limit = rateLimit(
    `upload:${clientKey(req)}:${guarded.slug}`,
    UPLOAD_LIMIT,
    UPLOAD_WINDOW_MS
  );
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const supabase = createAdminClient();

  try {
    const { count, error: countErr } = await supabase
      .from('attachments')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', guarded.room.id);

    if (countErr) return fail(ERR_INTERNAL, 500, countErr);
    if ((count ?? 0) >= MAX_ATTACHMENTS_PER_ROOM) {
      return fail(`Phòng đã đạt giới hạn tối đa ${MAX_ATTACHMENTS_PER_ROOM} ảnh.`, 400);
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return fail('Không tìm thấy file tải lên', 400);
    }
    if (file.size === 0) {
      return fail('Tập tin rỗng', 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return fail('Kích thước file vượt quá giới hạn tối đa 5MB.', 400);
    }
    if (!isAllowedImageType(file.type)) {
      return fail('Chỉ chấp nhận ảnh PNG, JPEG, GIF, WebP, AVIF hoặc BMP.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffImageType(buffer.subarray(0, 32));
    if (!sniffed || sniffed !== file.type) {
      return fail('Nội dung tập tin không khớp với định dạng ảnh đã khai báo.', 400);
    }

    // Random object name: the user-supplied filename never reaches the storage
    // path, so there is nothing to traverse or collide with.
    const filename = sanitizeFilename(file.name);
    const storagePath = `${guarded.room.id}/${randomUUID()}.${extensionFor(sniffed)}`;

    const { error: uploadErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, buffer, { contentType: sniffed, upsert: false });

    if (uploadErr) return fail('Tải ảnh lên thất bại', 500, uploadErr);

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
      return fail(ERR_INTERNAL, 500, insertErr);
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

    return NextResponse.json({ attachment });
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
}
