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

/**
 * Secret used to sign room access cookies. Falls back to the service-role key,
 * which is already a server-only secret, so existing deployments keep working
 * without a new variable. Rotating either value invalidates all unlock cookies.
 */
export function authSecret(): string {
  return process.env.CLIPSYNC_AUTH_SECRET || supabaseServiceRoleKey();
}

/** Shared secret required by the scheduled cleanup endpoint. */
export function cronSecret(): string | null {
  return process.env.CRON_SECRET || null;
}
