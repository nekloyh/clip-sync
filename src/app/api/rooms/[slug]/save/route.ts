import { NextRequest, NextResponse } from 'next/server';
import { guardRoom } from '@/lib/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { POLICIES, enforceAll, clientIdentity } from '@/lib/limiter';
import { roomRef } from '@/lib/pseudonym';
import { trackOnce, EVENTS } from '@/lib/analytics';
import { requestIdFrom } from '@/lib/log';
import { ErrorCode } from '@/lib/errors';
import { fail, rateLimitResponse, ERR_INTERNAL, ERR_NOT_FOUND } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'POST /api/rooms/[slug]/save';
const MAX_CONTENT_LENGTH = 100_000;

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const requestId = requestIdFrom(req.headers);
  const guarded = await guardRoom(params.slug, ROUTE);
  if (!guarded.ok) return guarded.response;

  const ref = roomRef(guarded.room.id);

  // Keyed by client *and* room. The room dimension goes in as its HMAC, never
  // as the slug — a slug in a shared cache key is a live room URL sitting in a
  // third-party keyspace, and for a room with no PIN that URL is the password.
  const limit = await enforceAll([
    { policy: POLICIES.saveContent, identity: `${clientIdentity(req.headers)}:${ref}` },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await req.json().catch(() => null);
  const content =
    body && typeof body === 'object' ? (body as { content?: unknown }).content : undefined;

  if (typeof content !== 'string') {
    return fail(400, ErrorCode.INVALID_REQUEST, 'Nội dung không hợp lệ', {
      requestId,
      route: ROUTE,
      roomRef: ref,
    });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return fail(
      400,
      ErrorCode.PAYLOAD_TOO_LARGE,
      `Nội dung vượt quá giới hạn ${MAX_CONTENT_LENGTH.toLocaleString()} ký tự.`,
      { requestId, route: ROUTE, roomRef: ref }
    );
  }

  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('rooms')
      .update({ content, updated_at: nowIso, last_seen_at: nowIso })
      .eq('id', guarded.room.id)
      // A save must not resurrect a room whose deletion is already queued.
      // Without this the room would silently return to being written to while
      // the worker was destroying it.
      .eq('lifecycle_state', 'active')
      .select('updated_at')
      .maybeSingle();

    if (error) {
      return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
        requestId,
        route: ROUTE,
        roomRef: ref,
        cause: error,
      });
    }
    // The room can be deleted between the guard and this update.
    if (!data) {
      return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, {
        requestId,
        route: ROUTE,
        roomRef: ref,
      });
    }

    // The funnel's "did anything actually get transferred?" step. Only a
    // non-empty save counts: the client saves on a debounce, so an empty one is
    // routinely just a room being opened, and counting it would put every
    // abandoned room in the success column.
    if (content.trim() !== '') {
      await trackOnce({
        name: EVENTS.FIRST_CONTENT_TRANSFERRED,
        roomRef: ref,
        actor: guarded.capabilities.canManage ? 'owner' : 'recipient',
      });
    }

    return NextResponse.json({ success: true, updated_at: data.updated_at });
  } catch (err) {
    return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
      requestId,
      route: ROUTE,
      roomRef: ref,
      cause: err,
    });
  }
}
