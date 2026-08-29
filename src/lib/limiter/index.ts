import 'server-only';
import { limiterRef } from '../pseudonym';
import { log } from '../log';
import { ErrorCode, type ErrorCodeValue } from '../errors';
import { POLICIES, type RateLimitPolicy } from './policies';
import { memoryStore, sharedStore, type RateLimitStore } from './store';

export { POLICIES } from './policies';
export type { RateLimitPolicy } from './policies';
export {
  memoryStore,
  sharedStore,
  setSharedStore,
  distributedLimiterRequired,
  MemoryRateLimitStore,
  UpstashRateLimitStore,
} from './store';
export type { RateLimitStore, RateLimitDecision } from './store';

/**
 * Applying a named policy to an identity.
 *
 * Callers never build keys. They name a policy and hand over the raw identity
 * (an address, a room ref); this module is the only thing that turns those into
 * a store key, and it does so through a keyed HMAC. That is not decoration:
 *
 *   - A raw IP in a shared cache is personal data sitting outside the database,
 *     readable by anyone with cache access, with no retention policy and no
 *     deletion path.
 *   - A raw slug is worse. For a room with no PIN the slug *is* the credential,
 *     so `pin-verify:1.2.3.4:quiet-fox-k3n8xq2p` - the key the previous
 *     implementation used - was a live room URL in a third-party keyspace, and
 *     it outlived the room.
 *
 * Keys are therefore `rl:<policy>:<hmac>`, and the raw identity never leaves
 * this function.
 */

export type RateLimitOutcome =
  | { allowed: true; store: RateLimitStore['kind']; degraded: boolean }
  | {
      allowed: false;
      retryAfterSeconds: number;
      errorCode: ErrorCodeValue;
      store: RateLimitStore['kind'] | 'none';
      degraded: boolean;
    };

/**
 * Count one hit and decide.
 *
 * Degradation, in full:
 *
 *   1. A shared store is configured and answers  -> its verdict, authoritative.
 *   2. A shared store is configured and throws   -> the policy's
 *      `onStoreUnavailable` decides. `fail_closed` refuses with
 *      RATE_LIMITER_UNAVAILABLE; `fallback_memory` falls through to the
 *      per-instance limiter. Either way a `degraded: true` line is logged, so
 *      the weaker guarantee is visible rather than assumed.
 *   3. No shared store is configured at all      -> the per-instance limiter,
 *      no degradation logged. This is a deliberate distinction: an unconfigured
 *      local or single-process deployment is a supported setup, not an
 *      incident, and treating it as one would make `fail_closed` mean "PIN
 *      verification does not work on a developer's laptop". A production
 *      deployment sets CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER=1, which makes
 *      readiness fail while no store is configured, so this case cannot reach
 *      production unnoticed.
 */
export async function enforce(
  policy: RateLimitPolicy,
  identity: string
): Promise<RateLimitOutcome> {
  const key = `rl:${policy.name}:${limiterRef(policy.name, identity)}`;
  const store = sharedStore();

  if (store) {
    try {
      const decision = await store.hit(key, policy.limit, policy.windowMs);
      return decision.ok
        ? { allowed: true, store: store.kind, degraded: false }
        : {
            allowed: false,
            retryAfterSeconds: decision.retryAfterSeconds,
            errorCode: ErrorCode.RATE_LIMITED,
            store: store.kind,
            degraded: false,
          };
    } catch {
      // The thrown value is discarded on purpose. A cache client's error
      // message quotes the command that failed, and the command contains the
      // key; classifying it would be the one place a key could reach a log.
      log.warn({
        event: 'rate_limit.store_unavailable',
        policy: policy.name,
        degraded: true,
        outcome: 'degraded',
      });

      if (policy.onStoreUnavailable === 'fail_closed') {
        return {
          allowed: false,
          // Long enough that a client retry loop does not become the load that
          // keeps the store down.
          retryAfterSeconds: 30,
          errorCode: ErrorCode.RATE_LIMITER_UNAVAILABLE,
          store: 'none',
          degraded: true,
        };
      }

      const fallback = await memoryStore.hit(key, policy.limit, policy.windowMs);
      return fallback.ok
        ? { allowed: true, store: 'memory', degraded: true }
        : {
            allowed: false,
            retryAfterSeconds: fallback.retryAfterSeconds,
            errorCode: ErrorCode.RATE_LIMITED,
            store: 'memory',
            degraded: true,
          };
    }
  }

  const local = await memoryStore.hit(key, policy.limit, policy.windowMs);
  return local.ok
    ? { allowed: true, store: 'memory', degraded: false }
    : {
        allowed: false,
        retryAfterSeconds: local.retryAfterSeconds,
        errorCode: ErrorCode.RATE_LIMITED,
        store: 'memory',
        degraded: false,
      };
}

/**
 * Apply several policies and report the first refusal.
 *
 * Used where one action is limited along more than one dimension - PIN
 * verification is limited per client *and* per room, and passing one is not
 * passing the other.
 */
export async function enforceAll(
  checks: Array<{ policy: RateLimitPolicy; identity: string }>
): Promise<RateLimitOutcome> {
  let degraded = false;
  let store: RateLimitStore['kind'] = 'memory';

  for (const check of checks) {
    const outcome = await enforce(check.policy, check.identity);
    if (!outcome.allowed) return outcome;
    degraded = degraded || outcome.degraded;
    store = outcome.store;
  }

  return { allowed: true, store, degraded };
}

/**
 * Best-effort client identity from proxy headers.
 *
 * Returned raw because {@link enforce} is what hashes it, and hashing here as
 * well would mean two layers each believing the other did it. The one rule is
 * that this value never reaches a log line or a store key un-HMAC'd.
 */
export function clientIdentity(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return headers.get('x-real-ip') || 'unknown';
}

/** Convenience for the common single-policy case in a route handler. */
export function policyFor(name: keyof typeof POLICIES): RateLimitPolicy {
  return POLICIES[name];
}
