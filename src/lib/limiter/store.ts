/**
 * The rate-limit store port, and the two adapters this deployment ships with.
 *
 * The port exists because the in-memory limiter and the shared one are not
 * interchangeable in the way the old code assumed. In-memory is per-process, so
 * on serverless the effective limit is the configured limit times the number of
 * warm instances - a number nobody controls, that rises exactly when traffic
 * rises, and that an attacker can raise on purpose by sending requests faster.
 * For spam that is merely imprecise. For a 4-digit PIN it means the limit is
 * whatever the platform's autoscaler feels like today.
 */

export interface RateLimitDecision {
  ok: boolean;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  /** Which adapter answered. Recorded in logs and reported by /api/health/ready. */
  readonly kind: 'memory' | 'upstash';
  /**
   * Count one hit against `key` and say whether it is inside the window.
   *
   * Throws when the backing store is unreachable. That is the contract: a
   * store that swallowed its own failures and returned `ok: true` would make an
   * outage indistinguishable from an absence of traffic, and would silently
   * disable every limit built on it - which is the one failure mode this whole
   * module exists to prevent.
   */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
}

/* -------------------------------------------------------------------------- */
/* In-memory adapter                                                          */
/* -------------------------------------------------------------------------- */

type Bucket = { count: number; resetAt: number };

const MAX_BUCKETS = 10_000;

/**
 * Fixed-window counter in process memory.
 *
 * Kept for three jobs: unit tests, local development without a Redis, and the
 * documented `fallback_memory` degradation when the shared store is down. It is
 * not the production limiter for anything that guards a secret.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly kind = 'memory' as const;
  private buckets = new Map<string, Bucket>();

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    return this.hitAt(key, limit, windowMs, Date.now());
  }

  /** Synchronous, clock-injectable core. The tests drive this directly. */
  hitAt(key: string, limit: number, windowMs: number, now: number): RateLimitDecision {
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      if (this.buckets.size >= MAX_BUCKETS) this.evict(now);
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, retryAfterSeconds: 0 };
    }

    existing.count += 1;
    if (existing.count > limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    return { ok: true, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.buckets.clear();
  }

  private evict(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    // Still full of live buckets: drop the oldest insertions to bound memory.
    if (this.buckets.size >= MAX_BUCKETS) {
      const excess = this.buckets.size - Math.floor(MAX_BUCKETS / 2);
      let dropped = 0;
      for (const key of this.buckets.keys()) {
        this.buckets.delete(key);
        if (++dropped >= excess) break;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Upstash adapter                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Upstash Redis over its REST API, spoken with `fetch` and no SDK.
 *
 * Two reasons not to add the client library. It is edge-incompatible in some
 * runtimes and pulls a dependency tree into a project that currently has ten
 * runtime dependencies; and the protocol used here is three commands, so the
 * library would be abstraction over something already smaller than its own
 * README. `fetch` also means this runs unchanged on the edge runtime if the
 * rate-limited routes ever move there.
 *
 * Any Redis-compatible REST endpoint that speaks the same pipeline format works
 * here; nothing below is Upstash-specific beyond the two environment variable
 * names.
 */
export class UpstashRateLimitStore implements RateLimitStore {
  readonly kind = 'upstash' as const;

  constructor(
    private readonly url: string,
    private readonly token: string,
    /**
     * A limiter that hangs is worse than one that is down: it converts a cache
     * outage into a request-timeout outage on every route that consults it.
     */
    private readonly timeoutMs = 1500
  ) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    // INCR then PTTL, rather than INCR + EXPIRE NX, so this does not depend on
    // a Redis 7 flag. The window is set on the first hit; a race where two
    // instances both see "no TTL" and both set the same one is harmless.
    const [count, pttl] = await this.pipeline([
      ['INCR', key],
      ['PTTL', key],
    ]);

    let remainingMs = typeof pttl === 'number' ? pttl : -1;
    if (remainingMs < 0) {
      await this.pipeline([['PEXPIRE', key, String(windowMs)]]);
      remainingMs = windowMs;
    }

    const hits = typeof count === 'number' ? count : Number(count);
    if (!Number.isFinite(hits)) throw new Error('rate limit store returned a non-count');

    if (hits > limit) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
    }
    return { ok: true, retryAfterSeconds: 0 };
  }

  private async pipeline(commands: string[][]): Promise<unknown[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.url.replace(/\/+$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        // The status, never the body: an error body from a cache echoes the
        // command that failed, and the command contains the key.
        throw new Error(`rate limit store responded ${response.status}`);
      }

      const payload = (await response.json()) as Array<{ result?: unknown; error?: unknown }>;
      if (!Array.isArray(payload)) throw new Error('rate limit store returned a non-pipeline');

      return payload.map((entry) => {
        if (entry?.error) throw new Error('rate limit store rejected a command');
        return entry?.result;
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The per-instance limiter. Module-scoped so the `fallback_memory` degradation
 * accumulates across requests instead of restarting empty on each one, which
 * would make the fallback no limit at all.
 */
export const memoryStore = new MemoryRateLimitStore();

let shared: RateLimitStore | null | undefined;

/**
 * The configured shared store, or null when none is configured.
 *
 * Null is a legitimate deployment (local development, a self-hosted single
 * process) and not an error. What it is not, is invisible: `/api/health/ready`
 * reports which store is in use, and `CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER=1`
 * makes readiness fail without one, which is what a production deployment sets
 * so that shipping without a limiter cannot pass a deploy check.
 */
export function sharedStore(): RateLimitStore | null {
  if (shared !== undefined) return shared;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  shared = url && token ? new UpstashRateLimitStore(url, token) : null;
  return shared;
}

export function distributedLimiterRequired(): boolean {
  return process.env.CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER === '1';
}

/** Test seam: force a specific store, or `undefined` to re-read the env. */
export function setSharedStore(store: RateLimitStore | null | undefined): void {
  shared = store;
}
