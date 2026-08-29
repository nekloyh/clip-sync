import { describe, it, expect, beforeAll, vi } from 'vitest';

/**
 * Next patches global fetch and keeps a Data Cache in front of GETs. PostgREST
 * reads are GETs, so a query can be answered from that cache instead of the
 * database — which is never what a server-side read in this app wants.
 *
 * It is worth a test because the failure is invisible: the schema health probe
 * kept reporting `ok` from a cached response for as long as the process lived,
 * after the owner columns had actually been dropped. Nothing errored, nothing
 * logged, and the endpoint whose entire job is noticing that exact situation
 * was the thing being fooled.
 */

const H = vi.hoisted(() => ({ options: null as Record<string, unknown> | null }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, options: Record<string, unknown>) => {
    H.options = options;
    return {};
  },
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests';
});

const { createAdminClient } = await import('./server');

describe('the admin client', () => {
  it('never lets a read be served from a cache', async () => {
    createAdminClient();

    const custom = (H.options?.global as { fetch?: typeof fetch })?.fetch;
    expect(custom, 'no custom fetch installed').toBeTypeOf('function');

    const spy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', spy);

    await custom!('http://localhost:54321/rest/v1/rooms?select=id', { method: 'GET' });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![1]).toMatchObject({ cache: 'no-store' });
    vi.unstubAllGlobals();
  });

  it('keeps the caller’s own options rather than replacing them', async () => {
    createAdminClient();
    const custom = (H.options?.global as { fetch?: typeof fetch }).fetch!;

    const spy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', spy);

    await custom('http://localhost:54321/rest/v1/rooms', {
      method: 'POST',
      headers: { apikey: 'k' },
      body: '{"slug":"x"}',
    });

    // supabase-js puts the auth headers and body here; dropping them would
    // break every request rather than just the caching behaviour.
    expect(spy.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      headers: { apikey: 'k' },
      body: '{"slug":"x"}',
      cache: 'no-store',
    });
    vi.unstubAllGlobals();
  });

  it('does not persist a session, since there is no user to persist', () => {
    createAdminClient();
    expect(H.options?.auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
  });
});
