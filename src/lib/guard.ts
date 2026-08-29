import 'server-only';
import { NextResponse } from 'next/server';
import { getRoom } from './rooms';
import { canAccessRoom, roomCapabilities } from './authz';
import { normalizeSlug, isValidSlug } from './slug';
import {
  fail,
  ERR_BAD_SLUG,
  ERR_FORBIDDEN,
  ERR_INTERNAL,
  ERR_LOCKED,
  ERR_NOT_FOUND,
} from './http';
import { ErrorCode } from './errors';
import type { RoomCapabilities, RoomRecord } from './types';

export type Guarded =
  | { ok: true; slug: string; room: RoomRecord; capabilities: RoomCapabilities }
  | { ok: false; response: NextResponse };

/** Normalize the slug and load the row, or produce the response that says why not. */
async function loadRoom(
  rawSlug: string,
  route: string
): Promise<{ ok: true; slug: string; room: RoomRecord } | { ok: false; response: NextResponse }> {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlug(slug)) {
    return { ok: false, response: fail(400, ErrorCode.BAD_SLUG, ERR_BAD_SLUG, { route }) };
  }

  let room: RoomRecord | null;
  try {
    room = await getRoom(slug);
  } catch (err) {
    return {
      ok: false,
      response: fail(500, ErrorCode.DB_ERROR, ERR_INTERNAL, { route, cause: err }),
    };
  }

  // Null also covers a room that is queued for deletion. That is deliberate:
  // once deletion is requested the room is gone as far as every caller is
  // concerned, and a distinct "being deleted" status would be a way to probe
  // for rooms that used to exist.
  if (!room) {
    return { ok: false, response: fail(404, ErrorCode.NOT_FOUND, ERR_NOT_FOUND, { route }) };
  }

  return { ok: true, slug, room };
}

/**
 * The contributor gate: read the room, save text, upload evidence. Refuses if
 * the room is PIN-protected and this request has no valid unlock cookie.
 * Previously each handler did its own (or no) check — this is the one place
 * that decision now lives.
 *
 * Passing this gate does not make a request an owner.
 */
export async function guardRoom(rawSlug: string, route = 'room'): Promise<Guarded> {
  const loaded = await loadRoom(rawSlug, route);
  if (!loaded.ok) return loaded;

  const { slug, room } = loaded;
  if (!canAccessRoom(slug, room)) {
    return { ok: false, response: fail(401, ErrorCode.LOCKED, ERR_LOCKED, { route }) };
  }

  return { ok: true, slug, room, capabilities: roomCapabilities(slug, room) };
}

/**
 * The owner gate: delete the room, set or clear the PIN, delete evidence.
 * Handlers call this instead of writing their own owner test, so "who may do
 * this" has exactly one implementation.
 *
 * The PIN gate is deliberately *not* applied here. A PIN protects the room's
 * contents from readers; it is not what proves ownership, and requiring it
 * would strand an owner who forgot their own PIN with a room they cannot close.
 * The owner capability alone is the answer.
 *
 * The 403 is uniform: it does not say whether the room has an owner, whether a
 * cookie arrived, or why it was rejected.
 */
export async function guardRoomManagement(rawSlug: string, route = 'room'): Promise<Guarded> {
  const loaded = await loadRoom(rawSlug, route);
  if (!loaded.ok) return loaded;

  const { slug, room } = loaded;
  const capabilities = roomCapabilities(slug, room);
  if (!capabilities.canManage) {
    return { ok: false, response: fail(403, ErrorCode.FORBIDDEN, ERR_FORBIDDEN, { route }) };
  }

  return { ok: true, slug, room, capabilities };
}
