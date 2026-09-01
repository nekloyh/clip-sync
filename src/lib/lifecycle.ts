import 'server-only';
import { createAdminClient } from './supabase/server';
import { ATTACHMENTS_BUCKET } from './rooms';
import { describeSchemaError } from './schema-errors.mjs';
import { ErrorCode, type ErrorCodeValue } from './errors';
import { log } from './log';
import { captureError } from './monitoring';
import { roomRef } from './pseudonym';
import { track, EVENTS, type Actor } from './analytics';

/**
 * Room deletion, as a resumable job rather than a request.
 *
 * The old flow deleted the room row and then asked Storage to remove the
 * objects, logging any failure and returning success either way. Three things
 * were wrong with that, and they compound:
 *
 *   1. The row is the only record of which objects belong to the room. Deleting
 *      it first means a storage failure produces objects that nothing can ever
 *      attribute, so nothing can ever retry them. The failure is permanent at
 *      the instant it happens.
 *   2. It reported success to the owner regardless. For a product whose
 *      promise is that data disappears, "deleted" that left the images in place
 *      is not a tidiness bug, it is the promise being false.
 *   3. The cron did the same thing in the other order and ignored the storage
 *      error anyway, so the two paths were separately wrong. Manual deletion
 *      and expiry now run the exact same code below; that is the point.
 *
 * The shape here is intent-first: mark the room `deletion_pending` (which makes
 * it invisible to every reader immediately, which is what the owner actually
 * asked for), then let a worker destroy the objects, then the attachment rows,
 * then the room row. Every step is safe to repeat, and the row survives until
 * the objects are genuinely gone.
 */

/**
 * How many times a room's deletion may fail before it stops being retried.
 *
 * Bounded because an unbounded retry on a permanently broken room means the
 * worker spends every run failing on the same row and never reaches the rooms
 * behind it — one poisoned row becomes a total cleanup outage. Exhausting the
 * budget parks the room in `deletion_failed`, which is a state the ops endpoint
 * reports and an operator can alert on.
 */
export const MAX_DELETION_ATTEMPTS = 5;

export interface DeletionOutcome {
  roomId: string;
  deletedObjects: number;
  failedObjects: number;
  errorCode?: ErrorCodeValue;
  /** Final state written for this room. */
  state: 'deleted' | 'deletion_pending' | 'deletion_failed';
}

/**
 * Queue a room for deletion.
 *
 * `expectedOwnerVersion` re-checks, inside the write, the same version the
 * guard authorized against: authorization reads the row and the mutation writes
 * it as two separate round trips, and a revocation landing in between used to
 * be ignored, so a just-revoked token still got its delete. The `active`
 * predicate does the same job for a different race — two concurrent deletes, or
 * a delete arriving for a room the TTL already claimed, must not re-open a
 * deletion that is already in progress and reset its attempt counter.
 *
 * Returns false when nothing matched, which the caller reports as 404: the room
 * is gone, revoked, or already on its way out, and telling those apart would be
 * telling the caller something they have not proved they may know.
 */
export async function requestRoomDeletion(
  roomId: string,
  expectedOwnerVersion: number,
  actor: Actor
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('rooms')
    .update({
      lifecycle_state: 'deletion_pending',
      deletion_requested_at: new Date().toISOString(),
      deletion_attempts: 0,
      deletion_error_code: null,
    })
    .eq('id', roomId)
    .eq('owner_version', expectedOwnerVersion)
    .eq('lifecycle_state', 'active')
    .select('id')
    .maybeSingle();

  if (error) throw describeSchemaError(error);
  if (!data) return false;

  const ref = roomRef(roomId);
  log.info({
    event: 'room.deletion_requested',
    roomRef: ref,
    actor,
    outcome: 'success',
  });

  // `room_completed` is the funnel's terminal success: somebody decided the
  // handoff was done. It is not the same fact as `room_deleted`, which says the
  // bytes are gone and is emitted by the worker once they actually are — the
  // gap between the two is precisely the thing this milestone exists to make
  // measurable.
  if (actor !== 'system') {
    await track({ name: EVENTS.ROOM_COMPLETED, roomRef: ref, actor });
  }

  return true;
}

/**
 * Move expired rooms into the deletion queue.
 *
 * Only marks; the same worker that handles manual deletion does the destroying,
 * so there is one implementation of "destroy a room" and not two that drift.
 * `room_expired` is recorded per room and is idempotent at the database, so a
 * room that somehow gets marked twice is still counted once.
 */
export async function queueExpiredRooms(
  ttlDays: number,
  batchSize: number
): Promise<{ queued: number }> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error } = await supabase
    .from('rooms')
    .select('id')
    .eq('lifecycle_state', 'active')
    .lt('last_seen_at', cutoff)
    // Stable ordering, so successive batches make progress instead of
    // re-picking the same arbitrary rows.
    .order('last_seen_at', { ascending: true })
    .limit(batchSize);

  if (error) throw describeSchemaError(error);

  const ids = (expired ?? []).map((row) => row.id as string);
  if (ids.length === 0) return { queued: 0 };

  const { data: claimed, error: markErr } = await supabase
    .from('rooms')
    .update({
      lifecycle_state: 'deletion_pending',
      deletion_requested_at: new Date().toISOString(),
      deletion_attempts: 0,
      deletion_error_code: null,
    })
    .in('id', ids)
    // Re-asserted so a concurrent run, or an owner deleting the room in the
    // same second, cannot have its state overwritten by this one.
    .eq('lifecycle_state', 'active')
    .select('id');

  if (markErr) throw describeSchemaError(markErr);

  for (const row of claimed ?? []) {
    await track({
      name: EVENTS.ROOM_EXPIRED,
      roomRef: roomRef(row.id as string),
      actor: 'system',
    });
  }

  return { queued: (claimed ?? []).length };
}

/**
 * Take up to `batchSize` rooms off the queue and lease them to this worker.
 *
 * `deletion_requested_at` is the lease clock as well as the queue order. It
 * starts as the moment deletion was asked for and is **rewritten on every
 * claim**, so it means "the moment this room became available to a worker".
 * That dual role is deliberate and it is what makes the visibility timeout
 * real: without the rewrite, a room whose deletion was requested an hour ago
 * looks stale the instant the first worker claims it, so a second worker
 * concludes the first one died and takes the room off it. Ordering is
 * unaffected — oldest-available-first is still oldest-request-first for a room
 * nobody has touched — and a room that keeps failing drifts to the back of the
 * queue instead of blocking the rooms behind it.
 *
 * The claim is the conditional UPDATE and nothing else. Both predicates live in
 * SQL rather than in the filter above them, because a staleness test evaluated
 * in JavaScript is a test against a row that may already have been claimed by
 * the time the UPDATE runs. Two workers may read the same ids; only one of them
 * can move a given row, and `select()` reports which rows that actually was.
 */
export async function claimDeletionBatch(
  batchSize: number,
  options: { staleAfterMs?: number; exclude?: ReadonlySet<string> } = {}
): Promise<Array<{ id: string; attempts: number }>> {
  const { staleAfterMs = 10 * 60_000, exclude } = options;
  const supabase = createAdminClient();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleAfterMs).toISOString();

  const { data: pending, error } = await supabase
    .from('rooms')
    .select('id, lifecycle_state, deletion_requested_at, deletion_attempts')
    .in('lifecycle_state', ['deletion_pending', 'deleting'])
    .lt('deletion_attempts', MAX_DELETION_ATTEMPTS)
    // Oldest available first: a stable order is what makes "run it again to get
    // the rest" actually work, instead of re-shuffling the same backlog.
    .order('deletion_requested_at', { ascending: true })
    .limit(batchSize);

  if (error) throw describeSchemaError(error);

  // Already attempted by the caller this run. Filtered *before* the claim, not
  // after: claiming a room and then declining to process it would leave it
  // holding a fresh lease for the next ten minutes — a failure that delays its
  // own retry.
  const candidates = (pending ?? []).filter((row) => !exclude?.has(row.id as string));
  if (candidates.length === 0) return [];

  const lease = { lifecycle_state: 'deleting', deletion_requested_at: now.toISOString() };
  const claimed: Array<{ id: string; attempts: number }> = [];

  const queued = candidates
    .filter((row) => row.lifecycle_state === 'deletion_pending')
    .map((row) => row.id);

  if (queued.length > 0) {
    const { data, error: claimErr } = await supabase
      .from('rooms')
      .update(lease)
      .in('id', queued)
      // Re-asserted inside the write: a room another worker claimed between the
      // SELECT and here is no longer `deletion_pending` and matches nothing.
      .eq('lifecycle_state', 'deletion_pending')
      .select('id, deletion_attempts');

    if (claimErr) throw describeSchemaError(claimErr);
    for (const row of data ?? []) {
      claimed.push({ id: row.id as string, attempts: (row.deletion_attempts as number) ?? 0 });
    }
  }

  // Rooms whose worker died mid-deletion. A crash between claiming and
  // finishing would otherwise strand the room forever in a state nothing scans
  // — a leak with a stuck row pointing straight at it.
  const abandoned = candidates
    .filter(
      (row) =>
        row.lifecycle_state === 'deleting' &&
        String(row.deletion_requested_at ?? '') < staleBefore
    )
    .map((row) => row.id);

  if (abandoned.length > 0) {
    const { data, error: reclaimErr } = await supabase
      .from('rooms')
      .update(lease)
      .in('id', abandoned)
      .eq('lifecycle_state', 'deleting')
      // The lease test, in SQL. A worker that renewed its lease between the
      // SELECT and here keeps the room.
      .lt('deletion_requested_at', staleBefore)
      .select('id, deletion_attempts');

    if (reclaimErr) throw describeSchemaError(reclaimErr);
    for (const row of data ?? []) {
      claimed.push({ id: row.id as string, attempts: (row.deletion_attempts as number) ?? 0 });
    }
  }

  return claimed;
}

/** One page of a room's storage folder. Well above the 20-attachment cap. */
const OBJECT_PAGE = 100;
/** Pages swept per attempt. Beyond this the room is retried rather than half-emptied. */
const MAX_OBJECT_PAGES = 10;

/**
 * Destroy one room's data, in the only order that is safe to interrupt.
 *
 * Storage objects, then attachment rows, then the room row. Each step is
 * idempotent:
 *
 *   - An object that is already gone counts as deleted. Supabase Storage's
 *     `remove` does not error on a missing key, and it must not: "the previous
 *     attempt succeeded and then crashed" is the single most likely reason for
 *     a retry, and treating that as a failure would make a room that is already
 *     empty retry until its budget ran out and then park in `deletion_failed`.
 *   - Deleting rows that are already deleted matches nothing and is a no-op.
 *   - The room row is removed last, so any interruption leaves a row that still
 *     points at whatever remains.
 *
 * Objects are found two ways, and the second is what makes the promise true.
 * The attachment rows name the objects this room knows about; the room's
 * storage folder names the objects it *has*. Those differ whenever an upload
 * stored its object and then failed to write the row — the handler tries to
 * remove the object again, and if that removal also fails, nothing references
 * it any more. Sweeping only the rows would leave that object behind at the one
 * moment the product promises the room's data is gone, and leave it there
 * forever, since nothing retries what nothing can attribute. Everything under
 * `<room_id>/` belongs to this room by construction, so the folder is the
 * authority on what has to go.
 *
 * A failure writes a stable code and returns the room to the queue with its
 * attempt count incremented. It writes no provider message: a Storage error
 * carries bucket names and full object paths, and an object path here begins
 * with the room id.
 */
export async function processRoomDeletion(
  roomId: string,
  attempts: number
): Promise<DeletionOutcome> {
  const supabase = createAdminClient();
  const ref = roomRef(roomId);

  let deletedObjects = 0;

  try {
    const { data: rows, error: listErr } = await supabase
      .from('attachments')
      .select('id, storage_path')
      .eq('room_id', roomId);

    if (listErr) throw listErr;

    let known = (rows ?? [])
      .map((row) => row.storage_path as string)
      .filter((path): path is string => Boolean(path));

    // Sweep the folder until it comes back short, so a room holding more
    // objects than one page still empties completely before its row goes.
    for (let page = 0; page < MAX_OBJECT_PAGES; page++) {
      const { data: objects, error: folderErr } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .list(roomId, { limit: OBJECT_PAGE });

      // Not evidence of absence, and proceeding on it would delete the rows
      // that say what is still there.
      if (folderErr) {
        throw Object.assign(folderErr, { errorCode: ErrorCode.STORAGE_DELETE_FAILED });
      }

      const found = (objects ?? []).map((object) => `${roomId}/${object.name}`);
      const paths = [...new Set([...known, ...found])];
      known = [];

      if (paths.length === 0) break;

      const { error: removeErr } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .remove(paths);

      // The one thing this must never do is proceed past a storage failure.
      // The rows below are the only record of which objects these were.
      if (removeErr) throw Object.assign(removeErr, { errorCode: ErrorCode.STORAGE_DELETE_FAILED });
      deletedObjects += paths.length;

      if (found.length < OBJECT_PAGE) break;
      if (page === MAX_OBJECT_PAGES - 1) {
        throw Object.assign(new Error('room still holds objects'), {
          errorCode: ErrorCode.STORAGE_DELETE_FAILED,
        });
      }
    }

    if ((rows ?? []).length > 0) {
      const { error: rowsErr } = await supabase
        .from('attachments')
        .delete()
        .eq('room_id', roomId);
      if (rowsErr) throw rowsErr;
    }

    const { data: removed, error: roomErr } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)
      .select('id');
    if (roomErr) throw roomErr;

    // Only report a deletion that actually removed something. A re-run finds no
    // row and must stay a silent no-op: `room_deleted` is a countable event
    // with no unique index behind it, so an unconditional emit would let a
    // retried or double-scheduled run inflate the one number that says how many
    // rooms this deployment has destroyed.
    const roomExisted = ((removed as unknown[]) ?? []).length > 0;
    if (roomExisted) {
      log.info({
        event: 'room.deleted',
        roomRef: ref,
        actor: 'system',
        outcome: 'success',
        deletedObjects,
        attempts,
      });
      await track({ name: EVENTS.ROOM_DELETED, roomRef: ref, actor: 'system' });
    }

    return { roomId, deletedObjects, failedObjects: 0, state: 'deleted' };
  } catch (thrown) {
    const nextAttempts = attempts + 1;
    const exhausted = nextAttempts >= MAX_DELETION_ATTEMPTS;
    const errorCode =
      (thrown as { errorCode?: ErrorCodeValue })?.errorCode ?? ErrorCode.STORAGE_DELETE_FAILED;

    await supabase
      .from('rooms')
      .update({
        lifecycle_state: exhausted ? 'deletion_failed' : 'deletion_pending',
        deletion_attempts: nextAttempts,
        deletion_error_code: errorCode,
      })
      .eq('id', roomId);

    captureError({
      event: 'room.deletion_failed',
      errorCode,
      roomRef: ref,
      attempts: nextAttempts,
      route: '/api/cron/cleanup',
    });

    await track({
      name: EVENTS.CLEANUP_FAILED,
      roomRef: ref,
      actor: 'system',
      outcome: 'failure',
      errorCode,
    });

    return {
      roomId,
      deletedObjects,
      failedObjects: 1,
      errorCode,
      state: exhausted ? 'deletion_failed' : 'deletion_pending',
    };
  }
}

/** How much work is still queued, for the ops record and its alert. */
export async function pendingDeletionCount(): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .in('lifecycle_state', ['deletion_pending', 'deleting']);

  if (error) throw describeSchemaError(error);
  return count ?? 0;
}

/** Rooms that have given up. Non-zero is an operator's problem, and alertable. */
export async function failedDeletionCount(): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('lifecycle_state', 'deletion_failed');

  if (error) throw describeSchemaError(error);
  return count ?? 0;
}
