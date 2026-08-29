import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Health endpoints, tested for what they say *and* for what they refuse to say.
 *
 * The second half matters more than it looks. A readiness endpoint is routinely
 * left unauthenticated and is the first thing anyone curls, so every check here
 * has to report one of a small set of fixed strings — never a provider message,
 * a project URL, a bucket name or a column name. The tests that assert absence
 * are the ones that stop a helpful `error.message` being added later.
 */

const H = vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-health-at-least-32-chars';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests';
  return {
    dbError: null as unknown,
    storageError: null as unknown,
    throws: false,
    selects: [] as string[],
    resets: 0,
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    if (H.throws) throw new Error('connection refused to db.internal:5432');
    const chain: Record<string, unknown> = {
      select: (columns: string) => {
        H.selects.push(columns);
        return chain;
      },
      limit: async () => ({ data: H.dbError ? null : [], error: H.dbError }),
    };
    return {
      from: () => chain,
      storage: {
        from: () => ({
          list: async () => ({ data: H.storageError ? null : [], error: H.storageError }),
        }),
      },
    };
  },
}));

vi.mock('@/lib/rooms', () => ({
  ATTACHMENTS_BUCKET: 'clipsync-attachments',
  resetSchemaState: () => {
    H.resets += 1;
  },
}));

const { GET: live } = await import('@/app/api/health/live/route');
const { GET: ready } = await import('@/app/api/health/ready/route');
const { GET: legacy } = await import('@/app/api/health/route');
const { GET: ops } = await import('@/app/api/health/ops/route');

const UNDEFINED_COLUMN = {
  code: '42703',
  message: 'column rooms.lifecycle_state does not exist',
};

beforeEach(() => {
  H.dbError = null;
  H.storageError = null;
  H.throws = false;
  H.selects.length = 0;
  H.resets = 0;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER;
  delete process.env.CRON_SECRET;
});

describe('liveness', () => {
  it('is ok, and reaches no dependency to say so', async () => {
    const res = await live();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    // The point of liveness: a database outage must not make an orchestrator
    // believe every instance is dead and restart them all on top of it.
    expect(H.selects).toEqual([]);
  });

  it('is never cached', async () => {
    expect((await live()).headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('readiness', () => {
  it('reports ok when every subsystem answers', async () => {
    const res = await ready();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      checks: {
        config: 'ok',
        database: 'ok',
        storage: 'ok',
        rateLimiter: 'not_configured',
      },
    });
  });

  it('probes the columns both migrations add, not just the table', async () => {
    await ready();

    // Selecting only `id` would pass against a database that never ran either.
    expect(H.selects[0]).toContain('owner_secret_hash');
    expect(H.selects[0]).toContain('lifecycle_state');
  });

  it('fails when the schema is behind', async () => {
    H.dbError = UNDEFINED_COLUMN;

    const res = await ready();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.database).toBe('degraded');
  });

  it('separates an unreachable database from a schema problem', async () => {
    H.throws = true;

    const res = await ready();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.database).toBe('unavailable');
  });

  it('reports storage separately from the database', async () => {
    H.storageError = { message: 'Bucket not found: clipsync-attachments' };

    const res = await ready();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.storage).toBe('degraded');
    expect(body.checks.database).toBe('ok');
  });

  it('treats a missing shared limiter as a warning by default', async () => {
    const res = await ready();

    // A local or single-process deployment legitimately runs without one, and
    // failing readiness there would mean the app never starts on a laptop.
    expect(res.status).toBe(200);
    expect((await res.json()).checks.rateLimiter).toBe('not_configured');
  });

  it('fails when the deployment declares a shared limiter mandatory', async () => {
    process.env.CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER = '1';

    const res = await ready();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.rateLimiter).toBe('unavailable');
  });

  it('refuses a deployment that signs cookies with the Supabase key', async () => {
    const previous = process.env.CLIPSYNC_AUTH_SECRET;
    process.env.CLIPSYNC_AUTH_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Sharing them means the next routine Supabase key rotation orphans every
    // room on the deployment at once, irreversibly.
    const res = await ready();
    expect((await res.json()).checks.config).toBe('unavailable');

    process.env.CLIPSYNC_AUTH_SECRET = previous;
  });

  it('says nothing a stranger could use', async () => {
    H.dbError = UNDEFINED_COLUMN;
    H.storageError = { message: 'Bucket not found: clipsync-attachments' };

    const body = await (await ready()).text();

    expect(body).not.toContain('supabase');
    expect(body).not.toContain('example');
    expect(body).not.toContain('clipsync-attachments');
    expect(body).not.toContain('lifecycle_state');
    expect(body).not.toMatch(/select|column|bucket/i);
  });

  it('clears the cached degradation after a successful probe', async () => {
    await ready();
    // This is what lets a running instance recover the moment a migration
    // lands, instead of waiting out its recheck window.
    expect(H.resets).toBe(1);
  });

  it('does not clear it when the probe failed', async () => {
    H.dbError = UNDEFINED_COLUMN;
    await ready();
    expect(H.resets).toBe(0);
  });

  it('is never cached', async () => {
    expect((await ready()).headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('/api/health stays pointed at readiness', () => {
  it('answers exactly what /api/health/ready answers', async () => {
    // Uptime monitors and the README already point here. Making this 404 would
    // be a false alarm at 3am, so the expand step keeps it answering.
    const [aliased, direct] = [await legacy(), await ready()];

    expect(aliased.status).toBe(direct.status);
    expect(await aliased.json()).toEqual(await direct.json());
  });
});

describe('the detailed ops endpoint', () => {
  it('refuses an anonymous caller', async () => {
    process.env.CRON_SECRET = 'ops-secret';

    const res = await ops(request({}));
    expect(res.status).toBe(401);
  });

  it('refuses a wrong token', async () => {
    process.env.CRON_SECRET = 'ops-secret';

    const res = await ops(request({ authorization: 'Bearer wrong-secret-x' }));
    expect(res.status).toBe(401);
  });

  it('answers 401, not 503, when no secret is configured', async () => {
    // Saying "unconfigured" would tell an anonymous caller this endpoint is
    // currently unprotected and worth probing again after the next deploy.
    const res = await ops(request({}));
    expect(res.status).toBe(401);
  });
});

function request(headers: Record<string, string>) {
  return { headers: new Headers(headers) } as never;
}

afterEach(() => {
  vi.unstubAllEnvs();
});
