/**
 * Every rate limit this application applies, in one table.
 *
 * They used to be seven pairs of loose constants sitting next to the handlers
 * that used them, which meant nobody could answer "what are our limits" without
 * grepping, and two handlers guarding the same class of action drifted apart
 * without anyone noticing. Naming them also makes them loggable: `policy:
 * "pin_verify"` in a log line is a dimension you can group a dashboard by,
 * where `"pin-verify:1.2.3.4:quiet-fox-abc"` was a leak wearing a key's
 * clothes.
 *
 * `onStoreUnavailable` is the interesting column. When the shared store is
 * unreachable, every limiter has to choose between refusing traffic it cannot
 * measure and admitting traffic it cannot count, and the right answer is not
 * the same for all seven:
 *
 *   fail_closed     - the operation is an online guessing attack surface, and a
 *                     per-instance fallback is bypassable by making the next
 *                     request land on a different instance. Refusing is the
 *                     only honest answer, so PIN verification (a 4-digit secret,
 *                     10^4 guesses) and PIN changes refuse. A Redis outage
 *                     locks people out of PIN-protected rooms for its duration.
 *                     That is the trade being made deliberately: temporarily
 *                     unavailable beats quietly brute-forceable.
 *
 *   fallback_memory - fall back to the per-instance limiter and log
 *                     `degraded: true`. Weaker, but not absent, and never
 *                     silent. Used where the limit exists to stop spam and cost
 *                     rather than to protect a secret, and where refusing would
 *                     take the product down for everyone using it correctly.
 *                     Room deletion is deliberately in this group: this is a
 *                     product whose promise is that data goes away on request,
 *                     and a cache outage must not be able to prevent that.
 */

export type StoreUnavailablePolicy = 'fail_closed' | 'fallback_memory';

export interface RateLimitPolicy {
  /** Stable name. Appears in logs and forms part of the key's HMAC domain. */
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly onStoreUnavailable: StoreUnavailablePolicy;
}

const MINUTE = 60_000;

export const POLICIES = {
  createRoom: {
    name: 'create_room',
    limit: 20,
    windowMs: MINUTE,
    onStoreUnavailable: 'fallback_memory',
  },
  roomVisit: {
    name: 'room_visit',
    limit: 60,
    windowMs: MINUTE,
    onStoreUnavailable: 'fallback_memory',
  },
  /** Per client identity. Paired with {@link pinVerifyRoom}; both must pass. */
  pinVerify: {
    name: 'pin_verify',
    limit: 10,
    windowMs: 10 * MINUTE,
    onStoreUnavailable: 'fail_closed',
  },
  /**
   * Per room, regardless of who is asking.
   *
   * The client-identity limit alone is not a limit on guessing a given room's
   * PIN - it is a limit on guessing it *from one address*. A 4-digit PIN is
   * 10,000 guesses, and 10 per address per ten minutes is a budget a few
   * hundred addresses exhaust in an afternoon. Counting attempts against the
   * room as well caps the total no matter how the attempts are distributed,
   * which is the dimension that actually bounds the attack.
   *
   * Set well above the per-client limit so a shared NAT does not lock a room
   * for everyone behind it, and still far below 10,000.
   */
  pinVerifyRoom: {
    name: 'pin_verify_room',
    limit: 50,
    windowMs: 10 * MINUTE,
    onStoreUnavailable: 'fail_closed',
  },
  pinSet: {
    name: 'pin_set',
    limit: 10,
    windowMs: MINUTE,
    onStoreUnavailable: 'fail_closed',
  },
  saveContent: {
    name: 'save_content',
    limit: 120, // ~one save per 500ms of continuous typing
    windowMs: MINUTE,
    onStoreUnavailable: 'fallback_memory',
  },
  upload: {
    name: 'upload',
    limit: 30,
    windowMs: MINUTE,
    onStoreUnavailable: 'fallback_memory',
  },
  /** Owner-only mutations: delete room, delete attachment. */
  ownerMutation: {
    name: 'owner_mutation',
    limit: 60,
    windowMs: MINUTE,
    onStoreUnavailable: 'fallback_memory',
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type PolicyName = (typeof POLICIES)[keyof typeof POLICIES]['name'];
