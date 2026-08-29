import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkCronAuth } from '@/lib/cron-auth';
import {
  queueExpiredRooms,
  claimDeletionBatch,
  processRoomDeletion,
  pendingDeletionCount,
} from '@/lib/lifecycle';
import { recordRunStart, recordRunEnd, JOBS } from '@/lib/ops';
import { fail, ERR_INTERNAL } from '@/lib/http';
import { ErrorCode } from '@/lib/errors';
import { log, requestIdFrom } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROUTE = '/api/cron/cleanup';

const TTL_DAYS = 7;
/** Rooms marked expired per run. Bounded so one run cannot outlive its budget. */
const QUEUE_BATCH = 200;
/** Rooms actually destroyed per run. Smaller: each one is several round trips. */
const DELETE_BATCH = 25;
/** Analytics rows older than this are pruned. See docs/ANALYTICS.md. */
const ANALYTICS_RETAIN_DAYS = 180;

/**
 * The scheduled worker: expire, then drain the deletion queue.
 *
 * Deliberately bounded in both dimensions rather than "delete everything that
 * is due". A serverless invocation has a hard wall-clock limit, and a run that
 * tries to finish the whole backlog gets killed partway through - doing part of
 * the work, recording none of it, and leaving rooms stranded in `deleting`.
 * Bounded batches plus `hasMore` mean the scheduler can simply run again, and
 * the backlog is visible in `pendingWork` rather than inferred from a timeout.
 *
 * `budgetMs` is the belt to that braces: the loop stops early and reports
 * `hasMore` rather than being terminated mid-room.
 */
const BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const requestId = requestIdFrom(req.headers);
  const startedAt = Date.now();

  const auth = checkCronAuth(req.headers);
  if (auth === 'not_configured') {
    return fail(503, ErrorCode.NOT_CONFIGURED, 'Cleanup endpoint chưa được cấu hình', {
      requestId,
      route: ROUTE,
    });
  }
  if (auth === 'unauthorized') {
    return fail(401, ErrorCode.UNAUTHORIZED, 'Unauthorized', { requestId, route: ROUTE });
  }

  await recordRunStart(JOBS.CLEANUP);
  log.info({ event: 'cleanup.started', requestId, route: ROUTE });

  let deletedRooms = 0;
  let deletedObjects = 0;
  let failedObjects = 0;

  try {
    const { queued } = await queueExpiredRooms(TTL_DAYS, QUEUE_BATCH);

    let hasMore = queued === QUEUE_BATCH;
    let processed = 0;
    /**
     * Rooms this run has already attempted.
     *
     * A failure returns the room to `deletion_pending`, which makes it
     * immediately claimable again — so without this the loop retries the same
     * room several times inside one invocation, burning its whole retry budget
     * against a storage outage that will still be there a second later, and
     * parking it in `deletion_failed` within seconds of the first hiccup. One
     * attempt per room per run; the next run is the retry.
     */
    const attempted = new Set<string>();

    while (processed < DELETE_BATCH) {
      if (Date.now() - startedAt > BUDGET_MS) {
        hasMore = true;
        break;
      }

      const batch = await claimDeletionBatch(Math.min(5, DELETE_BATCH - processed), {
        exclude: attempted,
      });
      if (batch.length === 0) break;

      for (const room of batch) {
        attempted.add(room.id);
        const outcome = await processRoomDeletion(room.id, room.attempts);
        processed += 1;
        deletedObjects += outcome.deletedObjects;
        failedObjects += outcome.failedObjects;
        if (outcome.state === 'deleted') deletedRooms += 1;
      }
    }

    const pendingWork = await pendingDeletionCount();
    if (pendingWork > 0) hasMore = true;

    // Retention, enforced every run rather than by a separate schedule nobody
    // remembers to create. Failure here must not fail the run that deletes
    // rooms - telemetry is the less important of the two.
    await pruneAnalytics(requestId);

    const durationMs = Date.now() - startedAt;
    await recordRunEnd(JOBS.CLEANUP, {
      outcome: failedObjects > 0 ? 'degraded' : 'success',
      deletedRooms,
      deletedObjects,
      failedObjects,
      pendingWork,
      hasMore,
      durationMs,
    });

    log.info({
      event: 'cleanup.completed',
      requestId,
      route: ROUTE,
      outcome: failedObjects > 0 ? 'degraded' : 'success',
      deletedRooms,
      deletedObjects,
      failedObjects,
      pendingWork,
      durationMs,
    });

    // Counters only. No slugs, no paths, no room ids - this response is read by
    // a scheduler's log, which is one of the least controlled places output
    // ends up.
    return NextResponse.json(
      {
        deletedRooms,
        deletedObjects,
        failedObjects,
        queuedForDeletion: queued,
        remainingWork: pendingWork,
        hasMore,
        durationMs,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    await recordRunEnd(JOBS.CLEANUP, {
      outcome: 'failure',
      errorCode: ErrorCode.INTERNAL,
      deletedRooms,
      deletedObjects,
      failedObjects,
      durationMs: Date.now() - startedAt,
    });

    return fail(500, ErrorCode.INTERNAL, ERR_INTERNAL, {
      requestId,
      route: ROUTE,
      cause: err,
    });
  }
}

async function pruneAnalytics(requestId: string): Promise<void> {
  try {
    await createAdminClient().rpc('prune_analytics_events', {
      retain_days: ANALYTICS_RETAIN_DAYS,
    });
  } catch {
    log.warn({
      event: 'cleanup.analytics_prune_failed',
      requestId,
      route: ROUTE,
      outcome: 'failure',
    });
  }
}
