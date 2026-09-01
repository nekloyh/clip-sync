import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { hashPin, verifyPin, isLegacyHash } from '@/lib/crypto';
import { getRoom } from '@/lib/rooms';
import {
  createAccessToken,
  accessCookieName,
  accessCookieOptions,
} from '@/lib/room-auth';
import { guardRoomManagement } from '@/lib/guard';
import { normalizeSlug, isValidSlug } from '@/lib/slug';
import { POLICIES, enforce, enforceAll, clientIdentity } from '@/lib/limiter';
import { roomRef } from '@/lib/pseudonym';
import { log, requestIdFrom } from '@/lib/log';
import { ErrorCode } from '@/lib/errors';
import {
  fail,
  rateLimitResponse,
  ERR_BAD_SLUG,
  ERR_INTERNAL,
  ERR_NOT_FOUND,
} from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PIN_PATTERN = /^\d{4,6}$/;

const ROUTE = 'POST /api/rooms/[slug]/pin';

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const requestId = requestIdFrom(req.headers);
  const slug = normalizeSlug(params.slug);
  if (!isValidSlug(slug)) {
    return fail(400, ErrorCode.BAD_SLUG, ERR_BAD_SLUG, { requestId, route: ROUTE });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return fail(400, ErrorCode.INVALID_REQUEST, 'Yêu cầu không hợp lệ', {
      requestId,
      route: ROUTE,
    });
  }

  const { action, pin } = body as { action?: unknown; pin?: unknown };

  // `verify` is the recipient's lane: prove the PIN, get an unlock cookie. It
  // cannot go through a guard, because passing the PIN gate is the very thing
  // it exists to accomplish.
  if (action === 'verify') {
    let room;
    try {
      room = await getRoom(slug);
    } catch (err) {
      return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
        requestId,
        route: ROUTE,
        cause: err,
      });
    }
    if (!room) {
      return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, { requestId, route: ROUTE });
    }
    return handleVerify(req, slug, room, pin, requestId);
  }

  // `set` is the owner's lane, and it goes through the same gate as every other
  // administrative mutation. This handler used to call `canManageRoom` itself.
  // That was equivalent in effect, but it made this the one admin endpoint not
  // covered by the single gate the design is built around — and the template a
  // fourth endpoint would have been copied from.
  if (action === 'set') {
    const guarded = await guardRoomManagement(slug, ROUTE);
    if (!guarded.ok) return guarded.response;

    // Limited after the guard, not before: the guard is the cheap check, and
    // limiting first would let an unauthenticated caller consume an owner's
    // budget for changing their own PIN.
    const limit = await enforceAll([
      { policy: POLICIES.pinSet, identity: clientIdentity(req.headers) },
      { policy: POLICIES.pinSet, identity: roomRef(guarded.room.id) },
    ]);
    if (!limit.allowed) return rateLimitResponse(limit);

    return handleSet(guarded.slug, guarded.room, pin, requestId);
  }

  return fail(400, ErrorCode.INVALID_REQUEST, 'Action không hợp lệ', {
    requestId,
    route: ROUTE,
  });
}

type RoomRow = NonNullable<Awaited<ReturnType<typeof getRoom>>>;

async function handleVerify(
  req: NextRequest,
  slug: string,
  room: RoomRow,
  pin: unknown,
  requestId: string
): Promise<NextResponse> {
  // An open room needs no proof, but still gets a cookie so a PIN added later
  // does not immediately lock out the person who was already in the room.
  if (!room.pin_hash) {
    return withAccessCookie(NextResponse.json({ verified: true }), slug, null);
  }

  const ref = roomRef(room.id);

  // Two dimensions, both required.
  //
  // Limiting per client alone is not a limit on guessing this room's PIN, only
  // on guessing it from one address: 10 attempts per address per ten minutes is
  // a budget that a few hundred addresses exhaust against a 4-digit space in an
  // afternoon. The room-scoped limit caps the total however the attempts are
  // distributed, which is the dimension that actually bounds the attack.
  //
  // Both use the shared store and both `fail_closed` when it is unreachable:
  // the per-instance fallback is bypassable by making the next request land on
  // a different instance, which for a credential check is no limit at all.
  const limit = await enforceAll([
    { policy: POLICIES.pinVerify, identity: clientIdentity(req.headers) },
    { policy: POLICIES.pinVerifyRoom, identity: ref },
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);

  if (typeof pin !== 'string' || pin === '') {
    return fail(400, ErrorCode.INVALID_REQUEST, 'Mã PIN là bắt buộc', {
      requestId,
      route: ROUTE,
      roomRef: ref,
    });
  }

  let ok: boolean;
  try {
    ok = await verifyPin(pin, room.pin_hash, slug);
  } catch (err) {
    return fail(500, ErrorCode.INTERNAL, ERR_INTERNAL, {
      requestId,
      route: ROUTE,
      roomRef: ref,
      cause: err,
    });
  }

  if (!ok) {
    // The attempt is logged; the attempted PIN is not, and neither is the slug.
    log.info({
      event: 'pin.verify_rejected',
      requestId,
      route: ROUTE,
      roomRef: ref,
      actor: 'recipient',
      outcome: 'failure',
    });
    // Deliberately 200 with verified:false — the client distinguishes a wrong
    // PIN from a server error, and neither reveals anything extra.
    return NextResponse.json({ verified: false });
  }

  // Transparently migrate rooms still holding an unsalted SHA-256 digest.
  let effectiveHash = room.pin_hash;
  if (isLegacyHash(room.pin_hash)) {
    try {
      const upgraded = await hashPin(pin);
      const { data, error } = await createAdminClient()
        .from('rooms')
        .update({ pin_hash: upgraded })
        .eq('id', room.id)
        // Scoped like every other write in the codebase. The room can be queued
        // for deletion between the read above and this write, and an upgrade
        // that lands on a room on its way out is the one exception that gets
        // copied the next time somebody adds an endpoint.
        .eq('lifecycle_state', 'active')
        // Both of these are load-bearing, and adding the predicate above
        // without them would have been worse than leaving it off. The cookie
        // minted below is bound to a hash, and `hasRoomAccess` compares it
        // against the hash the database holds. Adopting `upgraded` when the
        // write matched nothing — or when PostgREST *returned* an error rather
        // than throwing one — binds the cookie to a hash the room does not
        // have, and locks a recipient with the correct PIN out of the room on
        // every retry.
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (data) effectiveHash = upgraded;
    } catch {
      // No provider message: it quotes the failed statement, and the statement
      // carries the room id and the hash.
      log.warn({
        event: 'pin.legacy_upgrade_failed',
        requestId,
        route: ROUTE,
        roomRef: ref,
        outcome: 'failure',
      });
    }
  }

  return withAccessCookie(NextResponse.json({ verified: true }), slug, effectiveHash);
}

/**
 * Setting, changing and clearing the PIN are all one owner-only operation.
 *
 * Knowing the current PIN used to be sufficient here, which meant any recipient
 * who had been let into the room could lock the owner out of it — or, on a room
 * with no PIN at all, simply post `{action:'set', pin:'1234'}` and take it over.
 * The owner capability replaces that proof entirely.
 */
async function handleSet(
  slug: string,
  room: RoomRow,
  pin: unknown,
  requestId: string
): Promise<NextResponse> {
  const ref = roomRef(room.id);

  if (typeof pin !== 'string') {
    return fail(400, ErrorCode.INVALID_REQUEST, 'Mã PIN không hợp lệ', {
      requestId,
      route: ROUTE,
      roomRef: ref,
    });
  }

  if (pin.trim() !== '' && !PIN_PATTERN.test(pin)) {
    return fail(400, ErrorCode.INVALID_REQUEST, 'Mã PIN phải từ 4 đến 6 chữ số', {
      requestId,
      route: ROUTE,
      roomRef: ref,
    });
  }

  try {
    const nextHash = pin.trim() === '' ? null : await hashPin(pin);
    const applied = await applyPinHash(room, nextHash);

    // The room can be deleted, or the owner capability revoked, between the
    // guard and this write. Both show up the same way: nothing was updated.
    // Reporting success here used to hand back `{success:true}` plus a fresh
    // unlock cookie for a room that no longer existed.
    if (!applied) {
      return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, {
        requestId,
        route: ROUTE,
        roomRef: ref,
      });
    }

    // Records that the PIN changed, never what it changed to or from.
    log.info({
      event: 'pin.updated',
      requestId,
      route: ROUTE,
      roomRef: ref,
      actor: 'owner',
      outcome: 'success',
    });

    return withAccessCookie(
      NextResponse.json({ success: true, hasPin: nextHash !== null }),
      slug,
      nextHash
    );
  } catch (err) {
    return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
      requestId,
      route: ROUTE,
      roomRef: ref,
      cause: err,
    });
  }
}

/**
 * Writes the new PIN hash, conditional on the room still being the one that was
 * authorized. Returns false when no row matched.
 */
async function applyPinHash(room: RoomRow, pinHash: string | null): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('rooms')
    .update({ pin_hash: pinHash })
    .eq('id', room.id)
    .eq('owner_version', room.owner_version)
    .eq('lifecycle_state', 'active')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/** Issues the httpOnly unlock cookie bound to the room's current PIN hash. */
function withAccessCookie(
  response: NextResponse,
  slug: string,
  pinHash: string | null
): NextResponse {
  response.cookies.set(
    accessCookieName(slug),
    createAccessToken(slug, pinHash),
    accessCookieOptions()
  );
  return response;
}
