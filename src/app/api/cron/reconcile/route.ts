import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/cron-auth';
import { reconcile } from '@/lib/reconcile';
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
    const durationMs = Date.now() - startedAt;

    await recordRunEnd(JOBS.RECONCILE, {
      outcome: 'success',
      // Findings are work an operator still has to do, so they are the queue
      // depth this job reports.
      pendingWork: report.dbWithoutObject + report.objectWithoutDb,
      hasMore: report.hasMore,
      durationMs,
    });

    log.info({
      event: 'reconcile.completed',
      requestId,
      route: ROUTE,
      outcome: 'success',
      findings: report.dbWithoutObject + report.objectWithoutDb,
      durationMs,
    });

    return NextResponse.json(
      { ...report, durationMs },
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
