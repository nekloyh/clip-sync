import { NextRequest, NextResponse } from 'next/server';
import { guardRoom, guardRoomManagement } from '@/lib/guard';
import { listAttachments, touchRoom } from '@/lib/rooms';
import { requestRoomDeletion } from '@/lib/lifecycle';
import { renewedOwnerToken } from '@/lib/authz';
import { ownerCookieOptions } from '@/lib/owner-auth';
import { writeOwnerJar } from '@/lib/cookie-budget';
import { toPublicRoom } from '@/lib/types';
import { POLICIES, enforce, clientIdentity } from '@/lib/limiter';
import { roomRef } from '@/lib/pseudonym';
import { trackOnce, EVENTS } from '@/lib/analytics';
import { log, requestIdFrom } from '@/lib/log';
import { ErrorCode } from '@/lib/errors';
import { fail, rateLimitResponse, ERR_INTERNAL, ERR_NOT_FOUND } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE_GET = 'GET /api/rooms/[slug]';
const ROUTE_DELETE = 'DELETE /api/rooms/[slug]';

/**
 * Authoritative room state. Clients call this on load and whenever a realtime
 * ping tells them something changed, so this response — not the broadcast
 * payload — is the source of truth.
 */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const requestId = requestIdFrom(req.headers);
  const guarded = await guardRoom(params.slug, ROUTE_GET);
  if (!guarded.ok) return guarded.response;

  try {
    const [attachments] = await Promise.all([
      listAttachments(guarded.room.id, guarded.slug),
      touchRoom(guarded.room.id),
    ]);

    const response = NextResponse.json(
      {
        room: toPublicRoom(guarded.room),
        attachments,
        // Booleans the UI uses to decide what to render. The API re-checks
        // every mutation anyway, so hiding a button is presentation, not
        // security, and there is nothing here worth forging.
        capabilities: guarded.capabilities,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );

    // Slide the owner capability's expiry forward. This endpoint is the right
    // place for it because the client calls it on mount, on every realtime
    // ping and whenever the tab regains focus — so an owner who keeps using
    // the room keeps their capability, and a room that stays alive because
    // people are using it can no longer outlive the cookie that controls it.
    // Returns null for everyone who is not already the owner, so this can only
    // extend ownership, never confer it.
    const renewed = renewedOwnerToken(guarded.slug, guarded.room);
    if (renewed) {
      writeOwnerJar(response.cookies, req.cookies.getAll(), renewed, ownerCookieOptions());
    }

    // The funnel's "did the handoff have another end?" step.
    //
    // Recorded from the read path rather than from a connection event, because
    // the question is whether a second *participant* reached the room, and the
    // websocket sees a phone waking from sleep as a new connection several
    // times an hour. Idempotent per room at the database, so reconnects,
    // retries and two concurrent instances all collapse into one row - the
    // in-process memo in `trackOnce` only saves the round trip.
    //
    // "Not the owner" is the proxy for "somebody else", and it is the right one
    // here: the owner's browser is the one holding the capability, so anyone
    // else reaching an authorized read is by definition a second party.
    if (!guarded.capabilities.canManage) {
      await trackOnce({
        name: EVENTS.SECOND_DEVICE_JOINED,
        roomRef: roomRef(guarded.room.id),
        actor: 'recipient',
      });
    }

    return response;
  } catch (err) {
    return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
      requestId,
      route: ROUTE_GET,
      roomRef: roomRef(guarded.room.id),
      cause: err,
    });
  }
}

/**
 * Owner only: deleting a room destroys everybody else's evidence with it.
 *
 * Answers 202, not 200, and the difference is honest rather than pedantic. The
 * room is unreadable the instant this returns - which is what the person
 * pressing the button is asking for - but the objects in storage are destroyed
 * by the same worker that handles expiry, moments later. Claiming 200 would be
 * claiming the bytes are gone at a point where they demonstrably are not, in
 * the one product area where that claim is the product.
 *
 * Manual deletion and TTL expiry share this path deliberately. They were two
 * implementations, separately wrong in different ways; now there is one, and a
 * fix to the retry semantics fixes both.
 */
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const requestId = requestIdFrom(req.headers);
  const guarded = await guardRoomManagement(params.slug, ROUTE_DELETE);
  if (!guarded.ok) return guarded.response;

  const limit = await enforce(POLICIES.ownerMutation, clientIdentity(req.headers));
  if (!limit.allowed) return rateLimitResponse(limit);

  const ref = roomRef(guarded.room.id);

  try {
    // Conditional on the version the guard just authorized against, so a
    // revocation landing between the two round trips is honoured rather than
    // raced past, and on the room still being `active`, so a second delete
    // cannot reset an in-flight one's retry budget.
    const accepted = await requestRoomDeletion(
      guarded.room.id,
      guarded.room.owner_version,
      'owner'
    );
    if (!accepted) {
      return fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, {
        requestId,
        route: ROUTE_DELETE,
        roomRef: ref,
      });
    }

    log.info({
      event: 'room.delete_accepted',
      requestId,
      route: ROUTE_DELETE,
      roomRef: ref,
      actor: 'owner',
      outcome: 'success',
      status: 202,
    });

    return NextResponse.json(
      { success: true, status: 'deletion_pending' },
      { status: 202 }
    );
  } catch (err) {
    return fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, {
      requestId,
      route: ROUTE_DELETE,
      roomRef: ref,
      cause: err,
    });
  }
}
