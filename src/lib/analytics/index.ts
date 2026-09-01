import 'server-only';
import { log } from '../log';
import { ONCE_PER_ROOM, buildEventRow, type AnalyticsEvent } from './catalog';
import { createAdminClient } from '../supabase/server';

export * from './catalog';

/**
 * The analytics port, plus the two sinks this deployment ships with.
 *
 * A port rather than a direct call to a SaaS, for a reason specific to this
 * product: the events below describe a support handoff involving a customer's
 * sensitive data, and several plausible buyers will refuse a deployment that
 * ships any of it to a third party. Making the sink an interface means
 * "self-hosted, events stay in your own Postgres" is a configuration rather
 * than a fork - and it keeps a vendor SDK, with its default-on autocapture of
 * URLs and request bodies, off the path where a room slug lives.
 */

export interface AnalyticsSink {
  readonly kind: string;
  record(event: AnalyticsEvent): Promise<void>;
}

/**
 * Postgres, in the same project as everything else.
 *
 * Idempotency lives in the partial unique index on `(room_ref, event_name)`,
 * not here: it is what makes a reconnect, a retry and two concurrent instances
 * collapse into one row. This class's only part in it is writing plainly and
 * treating the resulting duplicate as success. Nothing here reads before
 * writing, because a read-then-write guard loses every one of those races.
 */
export class SupabaseAnalyticsSink implements AnalyticsSink {
  readonly kind = 'supabase';

  async record(event: AnalyticsEvent): Promise<void> {
    const row = buildEventRow(event);
    if (!row) return;

    const table = createAdminClient().from('analytics_events');

    // A plain insert for both kinds, deliberately, because
    // `uq_analytics_once_per_room` is a *partial* index. Postgres will not
    // infer a conflict target from a partial index unless the statement
    // repeats its `where` predicate, and PostgREST has no way to express that
    // - so asking for `on conflict (room_ref, event_name)` here does not
    // deduplicate anything. It fails the whole insert with 42P10, and `track`
    // swallows that into a log line, which means every once-per-room event
    // silently never lands and the funnel reports zero for all five stages.
    //
    // The index still does exactly its job on a plain insert; the second write
    // just arrives as a 23505 instead of being absorbed.
    const { error } = await table.insert([row]);

    if (!error) return;

    // For these events the duplicate *is* the success case: another request,
    // another instance or a second cron pass already recorded this stage. Only
    // this one code, and only for these events - anything else is a real
    // failure and must still reach `track`'s log.
    if (ONCE_PER_ROOM.has(event.name) && error.code === '23505') return;

    throw error;
  }
}

/** Collects events in memory. Tests assert against this; nothing else uses it. */
export class MemoryAnalyticsSink implements AnalyticsSink {
  readonly kind = 'memory';
  readonly rows: Record<string, unknown>[] = [];

  async record(event: AnalyticsEvent): Promise<void> {
    const row = buildEventRow(event);
    if (!row) return;

    // Mirrors the database's unique index so a test exercises the same
    // idempotency rule the production sink gets from Postgres.
    if (ONCE_PER_ROOM.has(event.name)) {
      const duplicate = this.rows.some(
        (existing) =>
          existing.event_name === row.event_name && existing.room_ref === row.room_ref
      );
      if (duplicate) return;
    }

    this.rows.push({ ...row, occurred_at: new Date().toISOString() });
  }

  reset(): void {
    this.rows.length = 0;
  }
}

let sink: AnalyticsSink | null = null;

export function analyticsSink(): AnalyticsSink {
  if (!sink) sink = new SupabaseAnalyticsSink();
  return sink;
}

/** Test seam, and the hook a future vendor adapter is installed through. */
export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

/**
 * Bounded memo of once-per-room events this process has already written.
 *
 * A cost optimisation, never the correctness mechanism. `second_device_joined`
 * is evaluated on every room read, and a recipient polling a room all afternoon
 * would otherwise mean a database round trip per poll to be told "already
 * recorded". Correctness stays with the unique index, which is the only thing
 * that survives a second instance, a restart, or an eviction from this map.
 */
const MEMO_LIMIT = 5000;
const memo = new Set<string>();

/**
 * Record an event that describes a stage a room reaches once.
 *
 * Safe to call on every request. Duplicates are dropped here when this process
 * has seen them and by the database when it has not.
 */
export async function trackOnce(event: AnalyticsEvent): Promise<void> {
  const key = `${event.name}:${event.roomRef ?? ''}`;
  if (memo.has(key)) return;

  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.add(key);

  await track(event);
}

/** Test seam. */
export function resetAnalyticsMemo(): void {
  memo.clear();
}

/**
 * Record an event. Never throws, never blocks the outcome it describes.
 *
 * Awaited by callers rather than fired and forgotten - a floating promise in a
 * serverless handler is routinely killed the moment the response is sent, which
 * would make the funnel quietly lossy in exactly the high-traffic conditions
 * where it matters. But a telemetry failure must not fail a user's upload, so
 * the error is swallowed into a log line and the request continues.
 */
export async function track(event: AnalyticsEvent): Promise<void> {
  try {
    await analyticsSink().record(event);
  } catch {
    // The thrown value is deliberately not classified or attached: a PostgREST
    // error on an insert echoes the row it was given, and the row is the thing
    // being protected. The event name is enough to find it.
    log.warn({
      event: 'analytics.write_failed',
      outcome: 'failure',
      // The *event's* name, not a user value - it comes from the closed set in
      // the catalog.
      subject: event.name,
    });
  }
}
