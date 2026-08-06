import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { authSecret } from './env';
import { hashFingerprint } from './crypto';

/**
 * Room unlock is carried by a signed, httpOnly cookie — never by localStorage.
 * The token binds three things: the slug it was issued for, a fingerprint of
 * the PIN hash at issue time (so changing the PIN revokes it), and an expiry.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches the 7-day room TTL

export function accessCookieName(slug: string): string {
  return `cs_room_${slug}`;
}

function sign(payload: string): string {
  return createHmac('sha256', authSecret()).update(payload).digest('base64url');
}

/** `<slug>.<fingerprint>.<expiryMs>.<signature>` */
export function createAccessToken(
  slug: string,
  pinHash: string | null,
  now = Date.now()
): string {
  const payload = `${slug}.${hashFingerprint(pinHash)}.${now + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAccessToken(
  token: string | undefined,
  slug: string,
  pinHash: string | null,
  now = Date.now()
): boolean {
  if (!token) return false;

  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return false;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  if (!timingSafeEqual(expected, actual)) return false;

  const [tokenSlug, fingerprint, expiryRaw] = payload.split('.');
  if (tokenSlug !== slug) return false;
  if (fingerprint !== hashFingerprint(pinHash)) return false;

  const expiry = Number(expiryRaw);
  return Number.isFinite(expiry) && expiry > now;
}

/**
 * The single authorization check for a room. Rooms without a PIN are open by
 * design (the URL is the secret); rooms with one require a valid cookie.
 */
export function hasRoomAccess(slug: string, pinHash: string | null): boolean {
  if (!pinHash) return true;
  const token = cookies().get(accessCookieName(slug))?.value;
  return verifyAccessToken(token, slug, pinHash);
}

export function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  };
}
