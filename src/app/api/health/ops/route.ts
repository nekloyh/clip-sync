import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/cron-auth';
import { readJobSnapshots } from '@/lib/ops';
import { openFindings } from '@/lib/reconcile';
import { pendingDeletionCount, failedDeletionCount } from '@/lib/lifecycle';
import { fail, ERR_INTERNAL } from '@/lib/http';
import { ErrorCode } from '@/lib/errors';
import { requestIdFrom } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/health/ops';

/**
 * The detailed operational view, behind the operator bearer token.
 *
 * Split from `/api/health/ready` because the two have different readers and
 * therefore different disclosure budgets. Readiness is polled by an uptime
 * checker, is usually left unauthenticated, and so may say only "ok" or
 * "degraded". This one answers the questions that require counts - how many
 * rooms are queued, how long since cleanup completed, how many deletions have
 * given up - and counts are exactly what tells a stranger how much traffic a
 * deployment has and whether it is currently broken.
 *
 * Still no slugs, no paths, no provider errors: `roomRef` on a finding is the
 * same HMAC the analytics table uses, which correlates and locates nothing.
 *
 * The three numbers to alert on:
 *
 *   cleanup.secondsSinceCompletion > 2 days   the cron stopped firing.
 *   deletionQueue.pending steadily rising     cleanup runs but cannot keep up.
 *   deletionQueue.failed > 0                  rooms whose data is still there
 *                                             after exhausting every retry.
 */
export async function GET(req: NextRequest) {
  const requestId = requestIdFrom(req.headers);

  const auth = checkCronAuth(req.headers);
  // Both non-ok cases answer 401 and nothing else. An unconfigured deployment
  // saying so would tell an anonymous caller that this endpoint is unprotected
  // and worth probing again after the next deploy.
  if (auth !== 'ok') {
    return fail(401, ErrorCode.UNAUTHORIZED, 'Unauthorized', { requestId, route: ROUTE });
  }

  try {
    const [jobs, pending, failed, findings] = await Promise.all([
      readJobSnapshots(),
      pendingDeletionCount(),
      failedDeletionCount(),
      openFindings(20),
    ]);

    return NextResponse.json(
      {
        jobs,
        deletionQueue: { pending, failed },
        reconciliation: {
          openFindings: findings.length,
          // Kinds and timestamps only - enough to see a pattern forming, and
          // not enough to locate the objects involved.
          recent: findings.map((finding) => ({
            kind: finding.kind,
            detectedAt: finding.detectedAt,
          })),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return fail(500, ErrorCode.INTERNAL, ERR_INTERNAL, {
      requestId,
      route: ROUTE,
      cause: err,
    });
  }
}
