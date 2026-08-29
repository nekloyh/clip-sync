import 'server-only';
import { createAdminClient } from './supabase/server';
import { log } from './log';
import type { ErrorCodeValue } from './errors';

/**
 * The operational record for background jobs.
 *
 * This exists to answer one question that logs answer badly: "is the cron still
 * running?". A job that stops being invoked emits nothing, so its absence looks
 * exactly like a quiet week — the failure mode is silence, and no amount of log
 * searching distinguishes silence from health. A row whose `lastCompletedAt`
 * you can compare against `now()` turns that into a threshold an alert can
 * watch.
 *
 * `pendingWork` is the second half. A run can succeed every night and still be
 * falling behind, if the batch size is smaller than the arrival rate; every
 * individual run reports success while the backlog grows without bound. The
 * queue depth is the number that shows it.
 *
 * Counters only. No slugs, no object paths, no provider messages — the same
 * allowlist as everything else, because an ops table is read by more people and
 * exported to more places than a log is.
 */

export const JOBS = {
  CLEANUP: 'cleanup',
  RECONCILE: 'reconcile',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export interface JobResult {
  outcome: 'success' | 'failure' | 'degraded';
  errorCode?: ErrorCodeValue;
  deletedRooms?: number;
  deletedObjects?: number;
  failedObjects?: number;
  pendingWork?: number;
  hasMore?: boolean;
  durationMs?: number;
}

/**
 * Stamp the start of a run.
 *
 * Written before the work rather than after it, so a run that dies halfway
 * leaves `lastStartedAt` ahead of `lastCompletedAt` — which is the signature of
 * a crashed or timed-out job, and is otherwise indistinguishable from a job
 * that was never invoked.
 *
 * Best-effort: a bookkeeping failure must not stop the cleanup it is
 * bookkeeping for.
 */
export async function recordRunStart(job: JobName): Promise<void> {
  try {
    await createAdminClient()
      .from('ops_runs')
      .upsert(
        { job, last_started_at: new Date().toISOString() },
        { onConflict: 'job' }
      );
  } catch {
    log.warn({ event: 'ops.record_failed', subject: job, outcome: 'failure' });
  }
}

export async function recordRunEnd(job: JobName, result: JobResult): Promise<void> {
  try {
    await createAdminClient()
      .from('ops_runs')
      .upsert(
        {
          job,
          last_completed_at: new Date().toISOString(),
          last_outcome: result.outcome,
          last_error_code: result.errorCode ?? null,
          deleted_rooms: result.deletedRooms ?? 0,
          deleted_objects: result.deletedObjects ?? 0,
          failed_objects: result.failedObjects ?? 0,
          pending_work: result.pendingWork ?? 0,
          has_more: result.hasMore ?? false,
          duration_ms: result.durationMs ?? null,
        },
        { onConflict: 'job' }
      );
  } catch {
    log.warn({ event: 'ops.record_failed', subject: job, outcome: 'failure' });
  }
}

export interface JobSnapshot {
  job: string;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastOutcome: string | null;
  lastErrorCode: string | null;
  deletedRooms: number;
  deletedObjects: number;
  failedObjects: number;
  pendingWork: number;
  hasMore: boolean;
  durationMs: number | null;
  /** Seconds since the last completed run, or null if it has never completed. */
  secondsSinceCompletion: number | null;
}

/**
 * Every job's latest run, for the protected ops endpoint.
 *
 * `secondsSinceCompletion` is computed here rather than left to the caller
 * because it is the field an alert threshold is written against, and a
 * dashboard that has to do date arithmetic on a timestamp is a dashboard whose
 * alert is subtly wrong in one timezone.
 */
export async function readJobSnapshots(): Promise<JobSnapshot[]> {
  const { data, error } = await createAdminClient()
    .from('ops_runs')
    .select(
      'job, last_started_at, last_completed_at, last_outcome, last_error_code, deleted_rooms, deleted_objects, failed_objects, pending_work, has_more, duration_ms'
    );

  if (error) throw error;

  const now = Date.now();
  return (data ?? []).map((row) => {
    const completed = row.last_completed_at as string | null;
    return {
      job: row.job as string,
      lastStartedAt: (row.last_started_at as string | null) ?? null,
      lastCompletedAt: completed,
      lastOutcome: (row.last_outcome as string | null) ?? null,
      lastErrorCode: (row.last_error_code as string | null) ?? null,
      deletedRooms: (row.deleted_rooms as number) ?? 0,
      deletedObjects: (row.deleted_objects as number) ?? 0,
      failedObjects: (row.failed_objects as number) ?? 0,
      pendingWork: (row.pending_work as number) ?? 0,
      hasMore: Boolean(row.has_more),
      durationMs: (row.duration_ms as number | null) ?? null,
      secondsSinceCompletion: completed
        ? Math.max(0, Math.round((now - new Date(completed).getTime()) / 1000))
        : null,
    };
  });
}
