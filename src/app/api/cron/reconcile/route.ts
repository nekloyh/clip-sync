import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/cron-auth';
import { reconcile, countOpenFindings } from '@/lib/reconcile';
import { recordRunStart, recordRunEnd, JOBS } from '@/lib/ops';
import { fail, ERR_INTERNAL } from '@/lib/http';
import { ErrorCode } from '@/lib/errors';
import { log, requestIdFrom } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROUTE = '/api/cron/reconcile';
const BATCH_SIZE = 100;

/**
 * Drift detection between the database and object storage. Report-only.
 *
 * Separate from cleanup on purpose. Cleanup is the path that must run reliably
 * every night and finish inside its budget; reconciliation walks storage and is
 * inherently slower and less predictable. Bolting it onto cleanup - which is
 * what the previous orphan sweep did - meant a slow bucket listing could eat
 * the budget of the job that actually deletes people's data, and a failure in
 * the optional half could take down the mandatory one.
 *
 * Nothing here deletes anything. See src/lib/reconcile.ts for why that is a
 * decision rather than an omission.
 */
export async function GET(req: NextRequest) {
  const requestId = requestIdFrom(req.headers);
  const startedAt = Date.now();

  const auth = checkCronAuth(req.headers);
  if (auth === 'not_configured') {
    return fail(503, ErrorCode.NOT_CONFIGURED, 'Endpoint chưa được cấu hình', {
      requestId,
      route: ROUTE,
    });
  }
  if (auth === 'unauthorized') {
    return fail(401, ErrorCode.UNAUTHORIZED, 'Unauthorized', { requestId, route: ROUTE });
  }

  await recordRunStart(JOBS.RECONCILE);

  try {
    const report = await reconcile(BATCH_SIZE);

    // Queue depth, read after the scan and deliberately kept out of the outcome
    // the scan decides. docs/OPERATIONS.md §5 tells an operator that a failed
    // reconcile run means "nothing was looked at"; letting a failed *count*
    // query mark the run failed would send them to inspect Storage when the
    // sweep itself was fine. Falls back to what this run saw, which is the
    // number the job reported before there was a count at all.
    let openFindings: number | null = null;
    try {
      openFindings = await countOpenFindings();
    } catch {
      log.warn({ event: 'reconcile.count_failed', requestId, route: ROUTE, outcome: 'failure' });
    }

    const pendingWork = openFindings ?? report.dbWithoutObject + report.objectWithoutDb;
    const durationMs = Date.now() - startedAt;

    await recordRunEnd(JOBS.RECONCILE, {
      outcome: 'success',
      // Findings are work an operator still has to do, so the queue depth this
      // job reports is every finding still open — not the subset this run
      // happened to walk past, which would fall to zero the moment the drift
      // moved outside the batch window.
      pendingWork,
      hasMore: report.hasMore,
      durationMs,
    });

    log.info({
      event: 'reconcile.completed',
      requestId,
      route: ROUTE,
      outcome: 'success',
      findings: report.dbWithoutObject + report.objectWithoutDb,
      pendingWork,
      durationMs,
    });

    return NextResponse.json(
      { ...report, openFindings, durationMs },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    await recordRunEnd(JOBS.RECONCILE, {
      outcome: 'failure',
      errorCode: ErrorCode.INTERNAL,
      durationMs: Date.now() - startedAt,
    });

    return fail(500, ErrorCode.INTERNAL, ERR_INTERNAL, {
      requestId,
      route: ROUTE,
      cause: err,
    });
  }
}
