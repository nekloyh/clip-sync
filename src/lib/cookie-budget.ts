import { tokenExpiryMs } from './owner-auth';

/**
 * Keeps room capabilities inside one bounded cookie instead of one cookie per
 * room.
 *
 * The per-room scheme had a cap it could not see: browsers allow roughly 180
 * cookies per domain and evict by their own rules once that is passed, so a
 * person who creates rooms all day — the support agent this product is aimed
 * at — silently loses ownership of their oldest rooms with no error anywhere.
 * Server-side eviction fixed the *silence*, but the ceiling stayed, and the
 * accumulated jar was still sent with every request on the origin.
 *
 * Consolidating removes the count cap entirely: one cookie, and the constraint
 * becomes the single-cookie size limit, which is a number this file can
 * actually enforce.
 *
 * Entries stay independently signed rather than being re-signed as one blob.
 * That is the point of the design: a truncated or tampered jar costs the
 * entries it damaged and nothing else, where a single signature over the whole
 * jar would mean one bad byte logs someone out of every room they own.
 */

/** The one cookie holding every owner capability this browser has. */
export const OWNER_COOKIE = 'cs_owner';

/** Pre-consolidation cookies, still read so existing owners are not evicted. */
export const LEGACY_OWNER_PREFIX = 'cs_owner_';
export const ACCESS_COOKIE_PREFIX = 'cs_room_';

/**
 * Not in base64url, not in a slug, and legal in a cookie value (RFC 6265
 * cookie-octet), so it can never occur inside an entry.
 */
const SEPARATOR = '~';

/**
 * Browsers reject a cookie larger than about 4096 bytes including its name and
 * attributes. Budgeting the value at 3800 leaves room for those and still
 * holds ~30 rooms, which is far more than anyone has in flight.
 */
export const MAX_OWNER_JAR_BYTES = 3800;

/** Access cookies are still per-room; they are short-lived and self-limiting. */
export const MAX_ACCESS_COOKIES = 40;

export interface SimpleCookie {
  name: string;
  value: string;
}

export function parseJar(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(SEPARATOR).filter(Boolean);
}

/** The room an entry claims to be for. Claims only — the signature decides. */
export function entrySlug(entry: string): string | null {
  const slug = entry.split('.')[0];
  return slug || null;
}

/**
 * The capability for one room, from the consolidated cookie, falling back to
 * the pre-consolidation per-room cookie.
 */
export function findOwnerEntry(cookies: SimpleCookie[], slug: string): string | undefined {
  const jar = cookies.find((c) => c.name === OWNER_COOKIE)?.value;
  const entry = parseJar(jar).find((e) => entrySlug(e) === slug);
  if (entry) return entry;

  return cookies.find((c) => c.name === `${LEGACY_OWNER_PREFIX}${slug}`)?.value;
}

/**
 * Adds (or refreshes) one room's capability and returns the cookie value.
 *
 * Newest-first, dropping whatever no longer fits: the capability just issued is
 * the one the person is using, so it must never be the one evicted. An entry
 * whose expiry cannot be read sorts last, since it is unusable anyway.
 */
export function upsertOwnerEntry(
  existing: string[],
  token: string,
  maxBytes = MAX_OWNER_JAR_BYTES
): string {
  const slug = entrySlug(token);
  const others = existing.filter((e) => entrySlug(e) !== slug);

  const ranked = [
    token,
    ...others.sort((a, b) => (tokenExpiryMs(b) ?? -Infinity) - (tokenExpiryMs(a) ?? -Infinity)),
  ];

  const kept: string[] = [];
  let size = 0;
  for (const entry of ranked) {
    const cost = entry.length + (kept.length > 0 ? SEPARATOR.length : 0);
    if (size + cost > maxBytes) break;
    kept.push(entry);
    size += cost;
  }

  return kept.join(SEPARATOR);
}

/**
 * Every pre-consolidation owner cookie present on the request. These are
 * folded into the jar once and then expired, so an owner who created rooms
 * under the old scheme keeps them.
 */
export function legacyOwnerEntries(cookies: SimpleCookie[]): SimpleCookie[] {
  return cookies.filter(
    (c) => c.name.startsWith(LEGACY_OWNER_PREFIX) && c.name !== OWNER_COOKIE
  );
}

/** The minimum a response needs to write cookies; `NextResponse.cookies` fits. */
export interface CookieWriter {
  set(name: string, value: string, options: Record<string, unknown>): unknown;
}

/**
 * Writes `token` into the consolidated cookie, folding in anything already
 * there plus any pre-consolidation per-room cookies, and expiring those.
 *
 * Both the create and the renew path go through here so the jar can only ever
 * be built one way — the alternative is two encoders that drift and a cookie
 * that parses in one direction only.
 */
export function writeOwnerJar(
  writer: CookieWriter,
  incoming: SimpleCookie[],
  token: string,
  options: Record<string, unknown>
): void {
  const current = parseJar(incoming.find((c) => c.name === OWNER_COOKIE)?.value);
  const legacy = legacyOwnerEntries(incoming);

  const merged = upsertOwnerEntry([...current, ...legacy.map((c) => c.value)], token);
  writer.set(OWNER_COOKIE, merged, options);

  // Folded in above, so the originals are now duplicates taking up header room.
  for (const stale of legacy) {
    writer.set(stale.name, '', { ...options, maxAge: 0 });
  }
}

/**
 * Names to expire so that, once `keepName` is added, the family fits the cap.
 * Still used for the per-room access cookies.
 */
export function cookiesToEvict(
  existing: SimpleCookie[],
  prefix: string,
  keepName: string,
  max = MAX_ACCESS_COOKIES
): string[] {
  const family = existing.filter((c) => c.name.startsWith(prefix) && c.name !== keepName);
  const excess = family.length + 1 - max;
  if (excess <= 0) return [];

  return family
    .map((c) => ({ name: c.name, expiry: tokenExpiryMs(c.value) ?? -Infinity }))
    .sort((a, b) => a.expiry - b.expiry)
    .slice(0, excess)
    .map((c) => c.name);
}
