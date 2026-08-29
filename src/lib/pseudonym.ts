import 'server-only';
import { createHmac } from 'node:crypto';
import { authSecret } from './env';

/**
 * Keyed pseudonyms for identifiers that must be correlatable but not readable.
 *
 * Two things need this, for the same reason and with different inputs:
 *
 *   roomRef      - the analytics and logging identity of a room. Room ids and
 *                  slugs both identify a person's data; a slug additionally *is*
 *                  the credential for a room with no PIN. Neither may sit in a
 *                  log line or a metrics row, but a funnel with no join key is
 *                  not a funnel, so the join key is an HMAC.
 *   limiterRef   - the Redis key. Same argument, sharper: a shared cache is a
 *                  place a slug or an IP would survive outside the database,
 *                  visible to anyone with cache access and to whoever operates
 *                  it, and it would remain there after the room was deleted.
 *
 * Keyed, not plain hashing. The input spaces here are small and enumerable: a
 * plain sha256 of an IPv4 address is reversible by brute force in seconds, and
 * a plain hash of a slug is reversible by anyone who can generate slugs. The
 * key is what makes the mapping unguessable without it.
 *
 * The key is CLIPSYNC_AUTH_SECRET, which is deliberate: rotating it severs old
 * pseudonyms from new ones. Funnel history before the rotation stops joining to
 * history after it - an acceptable and *bounded* loss, and the same rotation
 * already invalidates every cookie, so operators expect a discontinuity there.
 */

const REF_BYTES = 16; // 128 bits - collision-free at any volume this sees

function keyed(domain: string, value: string, bytes: number): string {
  return createHmac('sha256', authSecret())
    .update(`${domain} ${value}`)
    .digest('hex')
    .slice(0, bytes * 2);
}

/**
 * The pseudonymous room id used by analytics, logs and ops records.
 *
 * Takes the room's UUID rather than its slug on purpose. The UUID never leaves
 * the server, so a caller cannot compute a ref for a room they merely know the
 * URL of and go looking for it - which they could, trivially, if the ref were
 * derived from the slug they are holding.
 */
export function roomRef(roomId: string): string {
  return keyed('room', roomId, REF_BYTES);
}

/** Domain-separated key material for the rate limiter. */
export function limiterRef(namespace: string, identity: string): string {
  return keyed(`rl:${namespace}`, identity, REF_BYTES);
}
