import { NextRequest, NextResponse } from 'next/server';
import { guardRoom, guardRoomManagement } from '@/lib/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { ATTACHMENTS_BUCKET } from '@/lib/rooms';
import { POLICIES, enforce, clientIdentity } from '@/lib/limiter';
import { roomRef } from '@/lib/pseudonym';
import { log, requestIdFrom } from '@/lib/log';
import { ErrorCode } from '@/lib/errors';
import { fail, rateLimitResponse, ERR_INTERNAL, ERR_NOT_FOUND } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROUTE_GET = 'GET /api/rooms/[slug]/attachments/[id]';
const ROUTE_DELETE = 'DELETE /api/rooms/[slug]/attachments/[id]';

/**
 * Streams an attachment through the room's authorization check, replacing the
 * previous public storage URLs. Images in a PIN-locked room are now locked too.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const requestId = requestIdFrom(req.headers);
  const guarded = await guardRoom(params.slug, ROUTE_GET);
  if (!guarded.ok) return guarded.response;

  const ref = roomRef(guarded.room.id);
  if (!UUID.test(params.id)) {
    return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, {
      requestId,
      route: ROUTE_GET,
      roomRef: ref,
    });
  }

  try {
    const supabase = createAdminClient();

    // Scoped by room_id — the old handler looked the attachment up by id alone,
    // which let any room address any other room's files.
    const { data: att, error } = await supabase
      .from('attachments')
      .select('storage_path, mime, filename')
      .eq('id', params.id)
      .eq('room_id', guarded.room.id)
      .maybeSingle();

    if (error) {
      return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
        requestId,
        route: ROUTE_GET,
        roomRef: ref,
        cause: error,
      });
    }
    if (!att) {
      return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, {
        requestId,
        route: ROUTE_GET,
        roomRef: ref,
      });
    }

    const { data: blob, error: downloadErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .download(att.storage_path);

    if (downloadErr || !blob) {
      // A row whose object is missing is exactly what the reconciler looks for.
      // Logged as its own event so the two signals can be correlated, and still
      // answered as a plain 404 - the caller does not need to know which half
      // of the system lost it.
      log.warn({
        event: 'attachment.object_missing',
        requestId,
        route: ROUTE_GET,
        roomRef: ref,
        outcome: 'failure',
        errorCode: ErrorCode.STORAGE_UNAVAILABLE,
      });
      return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, {
        requestId,
        route: ROUTE_GET,
        roomRef: ref,
      });
    }

    return new NextResponse(blob.stream(), {
      headers: {
        'Content-Type': att.mime,
        'Content-Length': String(blob.size),
        'Content-Disposition': 'inline',
        // Belt and braces against a mis-sniffed or malicious payload being
        // interpreted as anything other than an image on our own origin.
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    return fail(500, ErrorCode.INTERNAL, ERR_INTERNAL, {
      requestId,
      route: ROUTE_GET,
      roomRef: ref,
      cause: err,
    });
  }
}

/**
 * Owner only. Contributors upload evidence; removing it is an administrative
 * act.
 *
 * Note what this does and does not buy: it protects *images*. The text buffer
 * is shared and last-write-wins, so any contributor can still overwrite or
 * blank the room's text in a single save. That asymmetry is deliberate — text
 * is the collaborative surface and images are the record — but it means this
 * check is not, on its own, a guarantee that a recipient cannot destroy what
 * someone else submitted.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const requestId = requestIdFrom(req.headers);
  const guarded = await guardRoomManagement(params.slug, ROUTE_DELETE);
  if (!guarded.ok) return guarded.response;

  const ref = roomRef(guarded.room.id);
  if (!UUID.test(params.id)) {
    return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, {
      requestId,
      route: ROUTE_DELETE,
      roomRef: ref,
    });
  }

  const limit = await enforce(POLICIES.ownerMutation, clientIdentity(req.headers));
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const supabase = createAdminClient();

    const { data: att, error } = await supabase
      .from('attachments')
      .select('id, storage_path')
      .eq('id', params.id)
      .eq('room_id', guarded.room.id)
      .maybeSingle();

    if (error) {
      return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
        requestId,
        route: ROUTE_DELETE,
        roomRef: ref,
        cause: error,
      });
    }
    // Already gone. Answering success is what makes a retried delete safe.
    if (!att) return NextResponse.json({ success: true });

    const { error: removeErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .remove([att.storage_path]);

    // Storage first, and the row stays if storage refused.
    //
    // The previous version logged this failure and deleted the row anyway,
    // which destroyed the only record of which object it was - an orphan
    // nothing could ever attribute or retry, from a handler whose entire job is
    // making a file go away. Refusing means the owner sees an error and can
    // press delete again, and the object is still addressable when they do.
    if (removeErr) {
      return fail(500, ErrorCode.STORAGE_DELETE_FAILED, 'Xóa ảnh thất bại, vui lòng thử lại', {
        requestId,
        route: ROUTE_DELETE,
        roomRef: ref,
        cause: removeErr,
      });
    }

    const { error: deleteErr } = await supabase
      .from('attachments')
      .delete()
      .eq('id', att.id)
      .eq('room_id', guarded.room.id);

    if (deleteErr) {
      // The object is gone and the row is not: the reconciler's
      // `db_without_object` case, which is why it exists.
      return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
        requestId,
        route: ROUTE_DELETE,
        roomRef: ref,
        cause: deleteErr,
      });
    }

    log.info({
      event: 'attachment.deleted',
      requestId,
      route: ROUTE_DELETE,
      roomRef: ref,
      actor: 'owner',
      outcome: 'success',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return fail(500, ErrorCode.INTERNAL, ERR_INTERNAL, {
      requestId,
      route: ROUTE_DELETE,
      roomRef: ref,
      cause: err,
    });
  }
}
