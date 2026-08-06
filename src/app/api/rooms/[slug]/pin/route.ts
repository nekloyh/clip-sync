import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { hashPin, verifyPin, isLegacyHash } from '@/lib/crypto';
import { getRoom } from '@/lib/rooms';
import {
  hasRoomAccess,
  createAccessToken,
  accessCookieName,
  accessCookieOptions,
} from '@/lib/room-auth';
import { normalizeSlug, isValidSlug } from '@/lib/slug';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { fail, tooManyRequests, ERR_BAD_SLUG, ERR_INTERNAL, ERR_NOT_FOUND } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PIN_PATTERN = /^\d{4,6}$/;

// A 4-digit PIN is only 10k guesses, so the online limiter has to be tight.
// scrypt makes each attempt expensive; this makes them scarce.
const VERIFY_LIMIT = 10;
const VERIFY_WINDOW_MS = 10 * 60_000;
const SET_LIMIT = 10;
const SET_WINDOW_MS = 60_000;

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = normalizeSlug(params.slug);
  if (!isValidSlug(slug)) return fail(ERR_BAD_SLUG, 400);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail('Yêu cầu không hợp lệ', 400);

  const { action, pin, currentPin } = body as {
    action?: unknown;
    pin?: unknown;
    currentPin?: unknown;
  };

  let room;
  try {
    room = await getRoom(slug);
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
  if (!room) return fail(ERR_NOT_FOUND, 404);

  if (action === 'verify') return handleVerify(req, slug, room, pin);
  if (action === 'set') return handleSet(req, slug, room, pin, currentPin);
  return fail('Action không hợp lệ', 400);
}

type RoomRow = NonNullable<Awaited<ReturnType<typeof getRoom>>>;

async function handleVerify(
  req: NextRequest,
  slug: string,
  room: RoomRow,
  pin: unknown
): Promise<NextResponse> {
  // An open room needs no proof, but still gets a cookie so a PIN added later
  // does not immediately lock out the person who was already in the room.
  if (!room.pin_hash) {
    return withAccessCookie(NextResponse.json({ verified: true }), slug, null);
  }

  const limit = rateLimit(
    `pin-verify:${clientKey(req)}:${slug}`,
    VERIFY_LIMIT,
    VERIFY_WINDOW_MS
  );
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  if (typeof pin !== 'string' || pin === '') {
    return fail('Mã PIN là bắt buộc', 400);
  }

  let ok: boolean;
  try {
    ok = await verifyPin(pin, room.pin_hash, slug);
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }

  if (!ok) {
    // Deliberately 200 with verified:false — the client distinguishes a wrong
    // PIN from a server error, and neither reveals anything extra.
    return NextResponse.json({ verified: false });
  }

  // Transparently migrate rooms still holding an unsalted SHA-256 digest.
  let effectiveHash = room.pin_hash;
  if (isLegacyHash(room.pin_hash)) {
    try {
      effectiveHash = await hashPin(pin);
      await createAdminClient()
        .from('rooms')
        .update({ pin_hash: effectiveHash })
        .eq('id', room.id);
    } catch (err) {
      console.error('[clipsync] legacy PIN upgrade failed', err);
      effectiveHash = room.pin_hash;
    }
  }

  return withAccessCookie(NextResponse.json({ verified: true }), slug, effectiveHash);
}

async function handleSet(
  req: NextRequest,
  slug: string,
  room: RoomRow,
  pin: unknown,
  currentPin: unknown
): Promise<NextResponse> {
  const limit = rateLimit(`pin-set:${clientKey(req)}:${slug}`, SET_LIMIT, SET_WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  // Changing or clearing an existing PIN requires proving you already have it.
  // Without this check, anyone who knew the slug could take over the room by
  // simply posting {action:'set', pin:''}.
  if (room.pin_hash) {
    let authorized = hasRoomAccess(slug, room.pin_hash);

    if (!authorized && typeof currentPin === 'string' && currentPin !== '') {
      try {
        authorized = await verifyPin(currentPin, room.pin_hash, slug);
      } catch (err) {
        return fail(ERR_INTERNAL, 500, err);
      }
    }

    if (!authorized) {
      return fail('Cần nhập đúng mã PIN hiện tại để thay đổi', 403);
    }
  }

  if (typeof pin !== 'string') return fail('Mã PIN không hợp lệ', 400);

  const supabase = createAdminClient();

  if (pin.trim() === '') {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ pin_hash: null })
        .eq('id', room.id);
      if (error) return fail(ERR_INTERNAL, 500, error);
    } catch (err) {
      return fail(ERR_INTERNAL, 500, err);
    }
    return withAccessCookie(
      NextResponse.json({ success: true, hasPin: false }),
      slug,
      null
    );
  }

  if (!PIN_PATTERN.test(pin)) {
    return fail('Mã PIN phải từ 4 đến 6 chữ số', 400);
  }

  try {
    const hashed = await hashPin(pin);
    const { error } = await supabase
      .from('rooms')
      .update({ pin_hash: hashed })
      .eq('id', room.id);
    if (error) return fail(ERR_INTERNAL, 500, error);

    return withAccessCookie(
      NextResponse.json({ success: true, hasPin: true }),
      slug,
      hashed
    );
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
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
