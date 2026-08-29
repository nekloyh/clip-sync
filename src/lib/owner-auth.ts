import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { authSecret } from './env';

/**
 * Room ownership as a bearer capability, not an account.
 *
 * POST /api/rooms mints a 256-bit secret, keeps only its sha256 in the room row
 * and hands the raw secret back in an httpOnly cookie. Nothing else ever sees
 * it: not the URL, not the response body, not localStorage, not a log line.
 *
 * The cookie value is a signed envelope around that secret so that a garbage or
 * tampered cookie is rejected before any comparison against the database, and
 * so the token carries a slug binding, an expiry and the room's owner version.
 * Bumping `owner_version` revokes every token ever issued for the room.
 */

const OWNER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SECRET_BYTES = 32;

export function ownerCookieName(slug: string): string {
  return `cs_owner_${slug}`;
}

/** The raw capability. Lives in one cookie and nowhere else. */
export function generateOwnerSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

/**
 * What the database stores. A plain sha256 is the right primitive here (unlike
 * a PIN): the input is 256 bits of entropy, so there is nothing to brute-force
 * and nothing for a slow KDF to buy.
 */
export function ownerSecretHash(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function sign(payload: string): string {
  return createHmac('sha256', authSecret()).update(payload).digest('base64url');
}

/** `<slug>.<ownerVersion>.<expiryMs>.<secret>.<signature>` */
export function createOwnerToken(
  slug: string,
  ownerVersion: number,
  secret: string,
  now = Date.now()
): string {
  const payload = `${slug}.${ownerVersion}.${now + OWNER_TTL_MS}.${secret}`;
  return `${payload}.${sign(payload)}`;
}

/** The room fields ownership is checked against. */
export interface OwnedRoom {
  owner_secret_hash: string | null;
  owner_version: number;
}

export function verifyOwnerToken(
  token: string | undefined,
  slug: string,
  room: OwnedRoom,
  now = Date.now()
): boolean {
  // A room created before ownership existed has no owner and cannot acquire
  // one — the first visitor must not be able to claim it.
  if (!room.owner_secret_hash) return false;
  if (!token) return false;

  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return false;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  if (!timingSafeEqual(expected, actual)) return false;

  const parts = payload.split('.');
  if (parts.length !== 4) return false;
  const [tokenSlug, versionRaw, expiryRaw, secret] = parts;

  if (tokenSlug !== slug) return false;
  if (Number(versionRaw) !== room.owner_version) return false;

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry <= now) return false;

  // Signature proves the envelope; this proves the secret inside it is still
  // the one this room was created with.
  const presented = Buffer.from(ownerSecretHash(secret));
  const stored = Buffer.from(room.owner_secret_hash);
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}

/**
 * The secret carried inside a token. Only meaningful for a token that has
 * already passed {@link verifyOwnerToken} — on its own this parses, it does not
 * authenticate.
 */
export function ownerSecretFromToken(token: string): string | null {
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const parts = token.slice(0, lastDot).split('.');
  return parts.length === 4 ? parts[3] : null;
}

/**
 * Re-mints a token that has just verified, sliding its expiry window forward.
 *
 * Without this the capability was a hard 30-day fuse. Room TTL is refreshed by
 * every visit, so a room in daily use never expires — but the cookie proving
 * who owns it did, silently, on day 31, leaving a live room nobody could close
 * or unlock. Renewing on each verified read keeps the two lifetimes in step.
 *
 * A room kept alive by *other* people while its owner stays away for the full
 * window still ages out. Without accounts there is nothing to renew against;
 * that residual case is documented rather than fixed.
 */
export function renewOwnerToken(
  token: string,
  slug: string,
  room: OwnedRoom,
  now = Date.now()
): string | null {
  if (!verifyOwnerToken(token, slug, room, now)) return null;
  const secret = ownerSecretFromToken(token);
  return secret ? createOwnerToken(slug, room.owner_version, secret, now) : null;
}

/**
 * Issue-ordering key for cookie eviction. Both cookie families this app sets
 * put their expiry in the third dot-separated field, and both use a fixed TTL,
 * so a lower expiry means an older cookie. Returns null for anything
 * unparseable, which the caller treats as "evict first".
 */
export function tokenExpiryMs(token: string): number | null {
  const raw = token.split('.')[2];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function ownerCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // `lax` and not `strict`: the room URL gets pasted into chat and opened as
    // a top-level navigation, and the owner must still be recognised there.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(OWNER_TTL_MS / 1000),
  };
}
