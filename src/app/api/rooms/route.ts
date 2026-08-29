import { NextRequest, NextResponse } from 'next/server';
import { generateRandomSlug, normalizeSlug, isValidSlug } from '@/lib/slug';
import { getRoom, createRoom } from '@/lib/rooms';
import {
  generateOwnerSecret,
  ownerSecretHash,
  createOwnerToken,
  ownerCookieOptions,
} from '@/lib/owner-auth';
import { writeOwnerJar } from '@/lib/cookie-budget';
import { POLICIES, enforce, clientIdentity } from '@/lib/limiter';
import { roomRef } from '@/lib/pseudonym';
import { track, EVENTS } from '@/lib/analytics';
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

const ROUTE = 'POST /api/rooms';
const MAX_SLUG_ATTEMPTS = 5;

/**
 * The only endpoint that creates a room, and therefore the only place an owner
 * capability is minted. The caller does not get to choose the locator: a
 * user-supplied slug would be short, guessable and — for a room with no PIN —
 * the credential itself, so `slug` in the body means "join this existing room"
 * and nothing more.
 */
export async function POST(req: NextRequest) {
  const requestId = requestIdFrom(req.headers);
  const startedAt = Date.now();

  const limit = await enforce(POLICIES.createRoom, clientIdentity(req.headers));
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  try {
    // Join-only. Creating under a chosen name would hand the next person who
    // guesses that name a room indistinguishable from one they created.
    if (body && typeof body === 'object' && 'slug' in body && body.slug) {
      const slug = normalizeSlug(body.slug);
      if (!isValidSlug(slug)) {
        return fail(400, ErrorCode.BAD_SLUG, ERR_BAD_SLUG, { requestId, route: ROUTE });
      }

      const room = await getRoom(slug);
      if (!room) {
        return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, { requestId, route: ROUTE });
      }

      return NextResponse.json({
        success: true,
        slug: room.slug,
        isExisting: true,
        hasPin: !!room.pin_hash,
      });
    }

    // No slug: the server picks one. Retrying on collision matters — the old
    // code silently handed the caller somebody else's existing room instead.
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = generateRandomSlug();
      const secret = generateOwnerSecret();

      const room = await createRoom(slug, ownerSecretHash(secret));
      if (!room) continue; // name taken, try another

      const response = NextResponse.json({
        success: true,
        slug: room.slug,
        isExisting: false,
        hasPin: false,
      });

      // The capability travels in an httpOnly cookie and only there: never in
      // the URL, the JSON body, localStorage or a log line. All of them share
      // one cookie, so creating rooms cannot run the browser out of cookie
      // slots and start evicting ownership by its own rules.
      writeOwnerJar(
        response.cookies,
        req.cookies.getAll(),
        createOwnerToken(room.slug, room.owner_version, secret),
        ownerCookieOptions()
      );

      // The funnel's first step. `roomRef` is an HMAC of the room UUID, so this
      // row can be joined to the rest of the room's funnel and to nothing else
      // — in particular, not to the slug, which is the credential.
      const ref = roomRef(room.id);
      await track({ name: EVENTS.ROOM_CREATED, roomRef: ref, actor: 'owner' });
      log.info({
        event: 'room.created',
        requestId,
        route: ROUTE,
        roomRef: ref,
        actor: 'owner',
        outcome: 'success',
        status: 200,
        durationMs: Date.now() - startedAt,
        degraded: limit.degraded || undefined,
      });

      return response;
    }

    return fail(503, ErrorCode.INTERNAL, ERR_INTERNAL, { requestId, route: ROUTE });
  } catch (err) {
    return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
      requestId,
      route: ROUTE,
      cause: err,
    });
  }
}
