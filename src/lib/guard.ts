import 'server-only';
import { NextResponse } from 'next/server';
import { getRoom } from './rooms';
import { hasRoomAccess } from './room-auth';
import { normalizeSlug, isValidSlug } from './slug';
import { fail, ERR_BAD_SLUG, ERR_INTERNAL, ERR_LOCKED, ERR_NOT_FOUND } from './http';
import type { RoomRecord } from './types';

export type Guarded =
  | { ok: true; slug: string; room: RoomRecord }
  | { ok: false; response: NextResponse };

/**
 * The gate every room route goes through: normalize the slug, load the room,
 * and refuse if it is PIN-protected and this request has no valid unlock
 * cookie. Previously each handler did its own (or no) check — this is the one
 * place that decision now lives.
 */
export async function guardRoom(rawSlug: string): Promise<Guarded> {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlug(slug)) {
    return { ok: false, response: fail(ERR_BAD_SLUG, 400) };
  }

  let room: RoomRecord | null;
  try {
    room = await getRoom(slug);
  } catch (err) {
    return { ok: false, response: fail(ERR_INTERNAL, 500, err) };
  }

  if (!room) {
    return { ok: false, response: fail(ERR_NOT_FOUND, 404) };
  }

  if (!hasRoomAccess(slug, room.pin_hash)) {
    return { ok: false, response: fail(ERR_LOCKED, 401) };
  }

  return { ok: true, slug, room };
}
