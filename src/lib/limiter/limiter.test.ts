import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The rate limiter, tested at the level the old one could not be.
 *
 * The previous limiter was a `Map` in one process, which on serverless means
 * the effective limit is the configured limit times the number of warm
 * instances — a number nobody controls, that rises exactly when traffic rises,
 * and that an attacker can raise on purpose by sending requests faster. Against
 * a 4-digit PIN that is not a limit, it is a suggestion.
 *
 * So the tests that matter here are the ones a per-process limiter fails:
 * counting across instances, and refusing rather than silently weakening when
 * the shared store is gone.
 */

vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-limiter-at-least-32-chars';
});

const {
  POLICIES,
  enforce,
  enforceAll,
  clientIdentity,
  memoryStore,
  setSharedStore,
  MemoryRateLimitStore,
} = await import('./index');
const { setLogSink } = await import('../log');

/**
 * One shared counter standing in for Redis, plus as many `RateLimitStore`
 * handles onto it as a test wants.
 *
 * That is what "distributed" means for these tests: several limiter instances,
 * one source of truth. A per-instance limiter passes every other test in this
 * file and fails the ones built on this.
 */
function sharedBackend() {
  const counts = new Map<string, { count: number; resetAt: number }>();
  const keys: string[] = [];

  return {
    counts,
    keys,
    /** A fresh store handle, as a separate serverless instance would have. */
    instance(): {
      kind: 'upstash';
      hit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterSeconds: number }>;
    } {
      return {
        kind: 'upstash' as const,
        async hit(key: string, limit: number, windowMs: number) {
          keys.push(key);
          const now = Date.now();
          const existing = counts.get(key);

          if (!existing || existing.resetAt <= now) {
            counts.set(key, { count: 1, resetAt: now + windowMs });
            return { ok: true, retryAfterSeconds: 0 };
          }

          existing.count += 1;
          return existing.count > limit
            ? { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) }
            : { ok: true, retryAfterSeconds: 0 };
        },
      };
    },
  };
}

/** A store that is configured but unreachable. */
const brokenStore = {
  kind: 'upstash' as const,
  async hit(): Promise<never> {
    throw new Error('connect ECONNREFUSED redis.upstash.io:6379 for key rl:pin_verify:abc');
  },
};

beforeEach(() => {
  setSharedStore(undefined);
  memoryStore.reset();
});

describe('the fixed window', () => {
  it('allows exactly `limit` requests and then refuses', async () => {
    const store = new MemoryRateLimitStore();
    const t0 = 1_000_000;

    for (let i = 0; i < 5; i++) {
      expect(store.hitAt('k', 5, 60_000, t0 + i).ok).toBe(true);
    }
    expect(store.hitAt('k', 5, 60_000, t0 + 5).ok).toBe(false);
  });

  it('reports how long to wait', () => {
    const store = new MemoryRateLimitStore();
    const t0 = 1_000_000;

    store.hitAt('k', 1, 60_000, t0);
    expect(store.hitAt('k', 1, 60_000, t0 + 10_000).retryAfterSeconds).toBe(50);
  });

  it('opens back up once the window rolls over', () => {
    const store = new MemoryRateLimitStore();
    const t0 = 1_000_000;

    store.hitAt('k', 1, 60_000, t0);
    expect(store.hitAt('k', 1, 60_000, t0 + 1).ok).toBe(false);
    expect(store.hitAt('k', 1, 60_000, t0 + 60_001).ok).toBe(true);
  });

  it('keeps separate keys independent', () => {
    const store = new MemoryRateLimitStore();
    store.hitAt('a', 1, 60_000, 1_000_000);

    expect(store.hitAt('a', 1, 60_000, 1_000_000).ok).toBe(false);
    expect(store.hitAt('b', 1, 60_000, 1_000_000).ok).toBe(true);
  });
});

describe('counting across limiter instances', () => {
  it('shares one budget between separate instances', async () => {
    const backend = sharedBackend();
    const identity = '203.0.113.42';

    // Ten attempts, each landing on a different "instance" — which is the whole
    // point: with a per-process limiter each of these would start a fresh
    // counter and all ten would be allowed.
    for (let i = 0; i < POLICIES.pinVerify.limit; i++) {
      setSharedStore(backend.instance());
      expect((await enforce(POLICIES.pinVerify, identity)).allowed).toBe(true);
    }

    setSharedStore(backend.instance());
    const refused = await enforce(POLICIES.pinVerify, identity);
    expect(refused.allowed).toBe(false);
  });

  it('cannot be bypassed by hopping instances mid-attack', async () => {
    const backend = sharedBackend();

    let allowed = 0;
    for (let i = 0; i < 40; i++) {
      setSharedStore(backend.instance()); // a new instance for every single guess
      if ((await enforce(POLICIES.pinVerify, '203.0.113.42')).allowed) allowed += 1;
    }

    expect(allowed).toBe(POLICIES.pinVerify.limit);
  });

  it('caps guesses against one room however many addresses are used', async () => {
    const backend = sharedBackend();
    const roomRef = 'a1b2c3d4e5f60718a1b2c3d4e5f60718';

    // The attack the per-client limit alone does not stop: a botnet, one guess
    // per address. Without the room dimension this loop makes 300 attempts on a
    // 10,000-guess secret and every one is allowed.
    let allowed = 0;
    for (let i = 0; i < 300; i++) {
      setSharedStore(backend.instance());
      const outcome = await enforceAll([
        { policy: POLICIES.pinVerify, identity: `198.51.100.${i % 254}` },
        { policy: POLICIES.pinVerifyRoom, identity: roomRef },
      ]);
      if (outcome.allowed) allowed += 1;
    }

    expect(allowed).toBe(POLICIES.pinVerifyRoom.limit);
  });

  it('keeps two rooms independent', async () => {
    const backend = sharedBackend();
    setSharedStore(backend.instance());

    for (let i = 0; i < POLICIES.pinVerifyRoom.limit; i++) {
      await enforce(POLICIES.pinVerifyRoom, 'room-a');
    }

    expect((await enforce(POLICIES.pinVerifyRoom, 'room-a')).allowed).toBe(false);
    // Locking every room because one is under attack would be a denial of
    // service with extra steps.
    expect((await enforce(POLICIES.pinVerifyRoom, 'room-b')).allowed).toBe(true);
  });
});

describe('what reaches the store as a key', () => {
  it('never sends a raw slug, address or token', async () => {
    const backend = sharedBackend();
    setSharedStore(backend.instance());

    await enforce(POLICIES.pinVerify, '203.0.113.42');
    await enforce(POLICIES.saveContent, 'quiet-fox-k3n8xq2p');
    await enforce(POLICIES.ownerMutation, 'quiet-fox.1.999.rawsecret.sig');

    // A shared cache is a place these would survive outside the database,
    // readable by anyone with cache access, with no retention policy and no
    // deletion path — and a slug there is a live room URL for a room with no
    // PIN, which is to say a password.
    for (const key of backend.keys) {
      expect(key).not.toContain('203.0.113.42');
      expect(key).not.toContain('quiet-fox');
      expect(key).not.toContain('rawsecret');
      expect(key).toMatch(/^rl:[a-z_]+:[0-9a-f]{32}$/);
    }
  });

  it('gives the same identity different keys under different policies', async () => {
    const backend = sharedBackend();
    setSharedStore(backend.instance());

    await enforce(POLICIES.pinVerify, 'same-identity');
    await enforce(POLICIES.upload, 'same-identity');

    // Domain separation. Without it, spending an upload budget would spend the
    // PIN budget too, and the tightest policy would silently govern everything.
    expect(backend.keys[0]).not.toBe(backend.keys[1]);
  });
});

describe('when the shared store is unreachable', () => {
  it('refuses PIN verification rather than weakening it silently', async () => {
    setSharedStore(brokenStore);

    const outcome = await enforce(POLICIES.pinVerify, '203.0.113.42');

    // A per-instance fallback here is bypassable by making the next request
    // land on a different instance, which for a credential check is no limit at
    // all. Temporarily unavailable beats quietly brute-forceable.
    expect(outcome.allowed).toBe(false);
    expect(outcome).toMatchObject({
      errorCode: 'rate_limiter_unavailable',
      degraded: true,
    });
    expect(outcome.allowed === false && outcome.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('refuses PIN changes for the same reason', async () => {
    setSharedStore(brokenStore);
    expect((await enforce(POLICIES.pinSet, '203.0.113.42')).allowed).toBe(false);
  });

  it('falls back to the per-instance limiter for room reads', async () => {
    setSharedStore(brokenStore);

    // Refusing here would 500 every room URL during a cache outage, taking the
    // product down for everyone using it correctly.
    const outcome = await enforce(POLICIES.roomVisit, '203.0.113.42');
    expect(outcome.allowed).toBe(true);
    expect(outcome.degraded).toBe(true);
  });

  it('still enforces a limit while degraded, rather than waving traffic through', async () => {
    setSharedStore(brokenStore);

    let allowed = 0;
    for (let i = 0; i < POLICIES.roomVisit.limit + 20; i++) {
      if ((await enforce(POLICIES.roomVisit, '203.0.113.42')).allowed) allowed += 1;
    }

    expect(allowed).toBe(POLICIES.roomVisit.limit);
  });

  it('lets an owner delete their room during an outage', async () => {
    setSharedStore(brokenStore);

    // This is a product whose promise is that data goes away on request. A
    // cache outage must not be able to prevent that.
    expect((await enforce(POLICIES.ownerMutation, '203.0.113.42')).allowed).toBe(true);
  });

  it('announces the degradation instead of hiding it', async () => {
    const lines: Record<string, unknown>[] = [];
    const previous = setLogSink((_, line) => lines.push(line));
    setSharedStore(brokenStore);

    await enforce(POLICIES.upload, '203.0.113.42');

    setLogSink(previous);
    expect(lines).toContainEqual(
      expect.objectContaining({
        event: 'rate_limit.store_unavailable',
        policy: 'upload',
        degraded: true,
      })
    );
  });

  it('logs no key material when it reports the outage', async () => {
    const lines: Record<string, unknown>[] = [];
    const previous = setLogSink((_, line) => lines.push(line));
    setSharedStore(brokenStore);

    await enforce(POLICIES.pinVerify, '203.0.113.42');

    setLogSink(previous);
    const serialized = JSON.stringify(lines);
    // The thrown value quotes the command that failed, and the command contains
    // the key — classifying it would be the one place a key could reach a log.
    expect(serialized).not.toContain('203.0.113.42');
    expect(serialized).not.toContain('rl:pin_verify:abc');
    expect(serialized).not.toContain('ECONNREFUSED');
  });
});

describe('when no shared store is configured at all', () => {
  it('uses the per-instance limiter without calling it a degradation', async () => {
    setSharedStore(null);

    // A local or single-process deployment is a supported setup, not an
    // incident. Treating it as one would make `fail_closed` mean "PIN
    // verification does not work on a developer's laptop".
    const outcome = await enforce(POLICIES.pinVerify, '203.0.113.42');
    expect(outcome.allowed).toBe(true);
    expect(outcome.degraded).toBe(false);
  });

  it('still counts', async () => {
    setSharedStore(null);

    for (let i = 0; i < POLICIES.pinVerify.limit; i++) {
      await enforce(POLICIES.pinVerify, '203.0.113.42');
    }
    expect((await enforce(POLICIES.pinVerify, '203.0.113.42')).allowed).toBe(false);
  });
});

describe('enforceAll', () => {
  it('reports the first refusal and stops', async () => {
    setSharedStore(null);

    for (let i = 0; i < POLICIES.pinVerify.limit; i++) {
      await enforce(POLICIES.pinVerify, 'client');
    }

    const outcome = await enforceAll([
      { policy: POLICIES.pinVerify, identity: 'client' },
      { policy: POLICIES.pinVerifyRoom, identity: 'room' },
    ]);

    expect(outcome.allowed).toBe(false);
  });

  it('carries a degradation forward even when every check passed', async () => {
    setSharedStore(brokenStore);

    const outcome = await enforceAll([{ policy: POLICIES.upload, identity: 'client' }]);
    expect(outcome).toMatchObject({ allowed: true, degraded: true });
  });
});

describe('client identity', () => {
  it('takes the first hop of x-forwarded-for', async () => {
    expect(
      clientIdentity(new Headers({ 'x-forwarded-for': '203.0.113.42, 70.41.3.18' }))
    ).toBe('203.0.113.42');
  });

  it('falls back to x-real-ip, then to a constant', () => {
    expect(clientIdentity(new Headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientIdentity(new Headers())).toBe('unknown');
  });
});
