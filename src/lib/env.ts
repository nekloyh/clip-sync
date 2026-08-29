import 'server-only';

/**
 * Server-side environment access.
 *
 * Every getter throws instead of silently falling back to a placeholder — a
 * misconfigured deployment should fail loudly at the first request rather than
 * produce confusing Supabase errors deep inside a route handler.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable "${name}". See .env.example for the full list.`
    );
  }
  return value;
}

export function supabaseUrl(): string {
  const url = required('NEXT_PUBLIC_SUPABASE_URL');
  if (!url.startsWith('http')) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be an absolute http(s) URL.');
  }
  return url;
}

export function supabaseServiceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY');
}

const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Secret used to sign room access cookies *and* owner capability cookies.
 *
 * This deliberately has no fallback. It used to default to the service-role
 * key, which was survivable while the only casualty was an unlock cookie —
 * losing one just means retyping a PIN. Owner capabilities changed the stakes:
 * the signing key is now the thing that proves who created a room, and there
 * is no account to recover from. Rotating the Supabase key is routine hygiene
 * and mandatory after any suspected leak, so a deployment where those two
 * secrets are the same value is one rotation away from orphaning every room it
 * hosts, irreversibly and all at once.
 *
 * Keeping them separate is the whole point, so an unset value is a
 * configuration error and fails loudly rather than silently borrowing a key
 * whose rotation schedule belongs to somebody else.
 */
export function authSecret(): string {
  const secret = required('CLIPSYNC_AUTH_SECRET');
  if (secret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(
      `CLIPSYNC_AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters. ` +
        'Generate one with: openssl rand -base64 48'
    );
  }
  return secret;
}

/** Shared secret required by the scheduled cleanup endpoint. */
export function cronSecret(): string | null {
  return process.env.CRON_SECRET || null;
}
