import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * `authSecret()` signs owner capabilities, so a deployment that gets it wrong
 * does not fail visibly — it works, and then loses every room at once the next
 * time the borrowed key is rotated. These tests pin the loud failure in place.
 */

const ORIGINAL = { ...process.env };

async function loadEnv() {
  vi.resetModules();
  return import('./env');
}

beforeEach(() => {
  process.env = { ...ORIGINAL };
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('authSecret', () => {
  it('throws when unset instead of borrowing the service-role key', async () => {
    delete process.env.CLIPSYNC_AUTH_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'a-perfectly-usable-service-role-key-value';

    const { authSecret } = await loadEnv();
    expect(() => authSecret()).toThrow(/CLIPSYNC_AUTH_SECRET/);
  });

  it('throws on an empty or whitespace-only value', async () => {
    const { authSecret } = await loadEnv();

    for (const value of ['', '   ']) {
      process.env.CLIPSYNC_AUTH_SECRET = value;
      expect(() => authSecret()).toThrow(/CLIPSYNC_AUTH_SECRET/);
    }
  });

  it('refuses a secret too short to be worth signing with', async () => {
    process.env.CLIPSYNC_AUTH_SECRET = 'short';
    const { authSecret } = await loadEnv();
    expect(() => authSecret()).toThrow(/at least 32 characters/);
  });

  it('accepts a secret of adequate length', async () => {
    const good = 'x'.repeat(32);
    process.env.CLIPSYNC_AUTH_SECRET = good;

    const { authSecret } = await loadEnv();
    expect(authSecret()).toBe(good);
  });

  it('does not fall back even when the service-role key is present and long', async () => {
    delete process.env.CLIPSYNC_AUTH_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'y'.repeat(200);

    const { authSecret } = await loadEnv();
    expect(() => authSecret()).toThrow();
  });
});
