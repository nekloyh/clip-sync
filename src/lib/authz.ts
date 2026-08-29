import 'server-only';
import { cookies } from 'next/headers';
import { hasRoomAccess } from './room-auth';
import { verifyOwnerToken, renewOwnerToken } from './owner-auth';
import { findOwnerEntry } from './cookie-budget';
import type { RoomCapabilities, RoomRecord } from './types';

/**
 * The one place that decides what a request may do to a room.
 *
 * Two questions, deliberately separate:
 *
 *   canAccessRoom  — may this request read and contribute? Anonymous by design:
 *                    an open room says yes to anyone with the URL, a locked one
 *                    wants the PIN unlock cookie. This is the recipient's lane.
 *   canManageRoom  — may this request administer the room (delete it, set or
 *                    clear the PIN, delete evidence)? Only the creator's owner
 *                    capability answers yes. Knowing the URL is not enough, and
 *                    knowing the PIN is not enough either.
 *
 * Route handlers must ask these questions rather than re-deriving the answer;
 * that is what keeps a new admin endpoint from quietly shipping without a check.
 */

export function canAccessRoom(slug: string, room: RoomRecord): boolean {
  return hasRoomAccess(slug, room.pin_hash);
}

/** This request's capability for one room, from the consolidated cookie. */
function ownerTokenFor(slug: string): string | undefined {
  return findOwnerEntry(cookies().getAll(), slug);
}

export function canManageRoom(slug: string, room: RoomRecord): boolean {
  return verifyOwnerToken(ownerTokenFor(slug), slug, room);
}

/**
 * A freshly-dated owner token for a request that is already the owner, or null.
 *
 * Route handlers call this to slide the capability's expiry forward as the
 * owner uses the room, so that an actively-used room cannot outlive the cookie
 * that controls it. Returns null — never throws, never mints — for anyone who
 * is not already holding a valid capability, so this can only ever extend
 * ownership, not confer it.
 */
export function renewedOwnerToken(slug: string, room: RoomRecord): string | null {
  const token = ownerTokenFor(slug);
  if (!token) return null;
  return renewOwnerToken(token, slug, room);
}

/**
 * What the client is told about its own powers. Presentation only — the UI uses
 * this to hide buttons, and the API re-checks every mutation regardless.
 * Nothing here can be replayed as a credential.
 */
export function roomCapabilities(slug: string, room: RoomRecord): RoomCapabilities {
  const canManage = canManageRoom(slug, room);
  return {
    canManage,
    // Evidence deletion is an owner action in v1, but it is reported as its own
    // capability so the two can diverge without the client changing shape.
    canDeleteEvidence: canManage,
  };
}
