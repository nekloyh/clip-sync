import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { resetSchemaState, ATTACHMENTS_BUCKET } from '@/lib/rooms';
import { sharedStore, distributedLimiterRequired } from '@/lib/limiter';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Readiness: can this instance actually do the job?
 *
 * Four checks, each of which has been a real way this deployment half-worked:
 * required configuration present, the database reachable *with the columns this
 * build needs*, the attachments bucket reachable, and a distributed rate
 * limiter present when the deployment says one is required.
 *
 * The schema check is the reason this endpoint exists at all. `getRoom`
 * degrades quietly when a migration is missing - which is right for users and
 * wrong for operators, who end up with a deployment that serves reads, refuses
 * to create rooms, and says nothing. This is the thing that says it.
 *
 * What it never returns: a Supabase project URL, a bucket policy, a table name,
 * a column name, a connection string, or a provider error message. Readiness
 * endpoints are routinely left unauthenticated and are the first thing an
 * attacker curls, so every check reports one of a small set of fixed strings
 * and the detail goes to the log.
 */

type CheckState = 'ok' | 'degraded' | 'unavailable' | 'not_configured';

export async function GET() {
  const checks: Record<string, CheckState> = {};

  checks.config = checkConfig();
  checks.database = await checkDatabase();
  checks.storage = await checkStorage();
  checks.rateLimiter = checkRateLimiter();

  // `not_configured` is a warning, not a failure: a local or single-process
  // deployment legitimately runs without a shared limiter, and only the
  // deployment itself knows whether that is acceptable - which is what
  // CLIPSYNC_REQUIRE_DISTRIBUTED_LIMITER exists to say.
  const ready = Object.values(checks).every(
    (state) => state === 'ok' || state === 'not_configured'
  );

  return NextResponse.json(
    { status: ready ? 'ok' : 'degraded', checks },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * Presence and shape of required configuration, without echoing any of it.
 *
 * The length check on the auth secret matters more than it looks: that secret
 * signs owner capabilities and keys every analytics pseudonym, and a deployment
 * that started with a two-character value would sign happily and be trivially
 * forgeable.
 */
function checkConfig(): CheckState {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.CLIPSYNC_AUTH_SECRET;

  if (!url || !url.startsWith('http')) return 'unavailable';
  if (!service) return 'unavailable';
  if (!secret || secret.length < 32) return 'unavailable';
  // Sharing these two means the next routine Supabase key rotation orphans
  // every room on the deployment at once.
  if (secret === service) return 'unavailable';
  return 'ok';
}

async function checkDatabase(): Promise<CheckState> {
  try {
    const { error } = await createAdminClient()
      .from('rooms')
      // Names a column from each migration this build depends on. Selecting
      // only `id` would pass against a database that never ran either of them.
      .select('id, owner_secret_hash, owner_version, lifecycle_state')
      .limit(1);

    if (error) {
      log.warn({
        event: 'health.database_check_failed',
        route: '/api/health/ready',
        outcome: 'degraded',
        providerCode: typeof error.code === 'string' ? error.code : undefined,
      });
      return 'degraded';
    }

    // A successful probe is the cheapest place to clear the cached "columns are
    // missing" flag, so a running instance recovers the moment the migration
    // lands instead of waiting out its recheck window.
    resetSchemaState();
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

/**
 * Storage reachable and the bucket addressable.
 *
 * A zero-length listing is the whole probe: it proves credentials, network and
 * bucket name without reading an object. Downloading anything to prove storage
 * works would mean reading a user's attachment on every health check.
 */
async function checkStorage(): Promise<CheckState> {
  try {
    const { error } = await createAdminClient()
      .storage.from(ATTACHMENTS_BUCKET)
      .list('', { limit: 1 });

    if (error) {
      log.warn({
        event: 'health.storage_check_failed',
        route: '/api/health/ready',
        outcome: 'degraded',
      });
      return 'degraded';
    }
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

/**
 * Whether a shared limiter is configured. Connectivity is deliberately not
 * probed here - a readiness check that opens a Redis connection on every poll
 * is a load generator, and the limiter's own degradation policy already handles
 * an unreachable store per request.
 */
function checkRateLimiter(): CheckState {
  if (sharedStore()) return 'ok';
  return distributedLimiterRequired() ? 'unavailable' : 'not_configured';
}
