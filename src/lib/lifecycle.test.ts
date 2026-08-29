import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeSupabase } from '@/test/fake-supabase';

/**
 * Deletion as a resumable job.
 *
 * The behaviour under test is the one the previous implementation got exactly
 * backwards: it deleted the room row first and then asked Storage to remove the
 * objects, logging any failure and returning success either way. Because the
 * row is the only record of which objects belong to the room, a storage failure
 * there produced objects nothing could ever attribute — so nothing could ever
 * retry them. The failure was permanent at the instant it happened, in a
 * product whose promise is that data disappears.
 *
 * Almost every test below is a variation on "what survived a failure, and can
 * the next run finish the job".
 */

const H = vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-lifecycle-at-least-32-chars';
  return { db: null as unknown as FakeSupabase };
});

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => H.db.client(),
}));

const { MemoryAnalyticsSink, setAnalyticsSink } = await import('./analytics');
const {
  requestRoomDeletion,
  queueExpiredRooms,
  claimDeletionBatch,
  processRoomDeletion,
  pendingDeletionCount,
  failedDeletionCount,
  MAX_DELETION_ATTEMPTS,
} = await import('./lifecycle');

const ROOM_ID = 'b3f1c2d4-0000-4000-8000-000000000000';
let analytics: InstanceType<typeof MemoryAnalyticsSink>;

function room(over: Record<string, unknown> = {}) {
  return {
    id: ROOM_ID,
    slug: 'quiet-fox-k3n8xq2p',
    owner_version: 1,
    lifecycle_state: 'active',
    deletion_requested_at: null,
    deletion_attempts: 0,
    deletion_error_code: null,
    last_seen_at: new Date().toISOString(),
    ...over,
  };
}

function seed(rooms: Record<string, unknown>[], attachments: Record<string, unknown>[] = []) {
  H.db = new FakeSupabase({ rooms, attachments });
  for (const attachment of attachments) H.db.objects.add(attachment.storage_path as string);
}

beforeEach(() => {
  analytics = new MemoryAnalyticsSink();
  setAnalyticsSink(analytics);
  seed([room()]);
});

const roomRow = () => H.db.rows('rooms')[0];
const eventNames = () => analytics.rows.map((row) => row.event_name);

describe('requesting a deletion', () => {
  it('queues the room and makes it unreadable immediately', async () => {
    expect(await requestRoomDeletion(ROOM_ID, 1, 'owner')).toBe(true);

    // The row is still there — it is the only record of which objects belong to
    // this room — but its state means every read path reports 404.
    expect(roomRow().lifecycle_state).toBe('deletion_pending');
    expect(roomRow().deletion_requested_at).toBeTruthy();
  });

  it('refuses when the owner version has moved on', async () => {
    // A revocation landed between the guard's read and this write. Honouring
    // the stale version would let a just-revoked token still get its delete.
    expect(await requestRoomDeletion(ROOM_ID, 7, 'owner')).toBe(false);
    expect(roomRow().lifecycle_state).toBe('active');
  });

  it('does not re-open a deletion already in progress', async () => {
    seed([room({ lifecycle_state: 'deleting', deletion_attempts: 3 })]);

    expect(await requestRoomDeletion(ROOM_ID, 1, 'owner')).toBe(false);
    // Resetting the attempt counter here is how a room retries forever: every
    // duplicate delete hands it a fresh budget.
    expect(roomRow().deletion_attempts).toBe(3);
  });

  it('records room_completed for a person, not for the TTL', async () => {
    await requestRoomDeletion(ROOM_ID, 1, 'owner');
    expect(eventNames()).toContain('room_completed');

    // `room_completed` means somebody decided the handoff was done. A room the
    // clock claimed is `room_expired`, and conflating the two would score every
    // abandoned room as a success.
    analytics.reset();
    seed([room()]);
    await requestRoomDeletion(ROOM_ID, 1, 'system');
    expect(eventNames()).not.toContain('room_completed');
  });
});

describe('expiring rooms', () => {
  const OLD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  it('queues rooms past the TTL and leaves fresh ones alone', async () => {
    seed([
      room({ id: 'old-room', last_seen_at: OLD }),
      room({ id: 'fresh-room', last_seen_at: new Date().toISOString() }),
    ]);

    const { queued } = await queueExpiredRooms(7, 100);

    expect(queued).toBe(1);
    expect(H.db.rows('rooms').find((r) => r.id === 'old-room')!.lifecycle_state).toBe(
      'deletion_pending'
    );
    expect(H.db.rows('rooms').find((r) => r.id === 'fresh-room')!.lifecycle_state).toBe('active');
  });

  it('records room_expired once, even across two runs', async () => {
    seed([room({ last_seen_at: OLD })]);

    await queueExpiredRooms(7, 100);
    await queueExpiredRooms(7, 100);

    expect(eventNames().filter((n) => n === 'room_expired')).toHaveLength(1);
  });

  it('does not disturb a room the owner is already deleting', async () => {
    seed([room({ last_seen_at: OLD, lifecycle_state: 'deletion_pending', deletion_attempts: 2 })]);

    expect((await queueExpiredRooms(7, 100)).queued).toBe(0);
    expect(roomRow().deletion_attempts).toBe(2);
  });
});

describe('claiming work', () => {
  it('claims a pending room and marks it in progress', async () => {
    seed([room({ lifecycle_state: 'deletion_pending', deletion_requested_at: '2026-01-01' })]);

    const batch = await claimDeletionBatch(10);

    expect(batch).toEqual([{ id: ROOM_ID, attempts: 0 }]);
    expect(roomRow().lifecycle_state).toBe('deleting');
  });

  it('leaves a room another worker just claimed', async () => {
    seed([
      room({
        lifecycle_state: 'deleting',
        deletion_requested_at: new Date().toISOString(),
      }),
    ]);

    expect(await claimDeletionBatch(10)).toEqual([]);
  });

  it('reclaims a room whose worker died', async () => {
    seed([
      room({
        lifecycle_state: 'deleting',
        deletion_requested_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      }),
    ]);

    // A crash between claiming and finishing would otherwise strand the room
    // forever in a state nothing scans: a leak with a stuck row pointing at it.
    expect(await claimDeletionBatch(10)).toHaveLength(1);
  });

  it('skips a room the caller has already attempted this run', async () => {
    seed([room({ lifecycle_state: 'deletion_pending', deletion_requested_at: '2026-01-01' })]);

    const excluded = await claimDeletionBatch(10, { exclude: new Set([ROOM_ID]) });

    expect(excluded).toEqual([]);
    // And crucially it was not claimed on the way to being skipped: a room left
    // in `deleting` with a fresh timestamp is protected from re-claim by the
    // staleness rule for ten minutes, so a failure would delay its own retry.
    expect(roomRow().lifecycle_state).toBe('deletion_pending');
  });

  it('stops retrying a room that has exhausted its budget', async () => {
    seed([
      room({
        lifecycle_state: 'deletion_pending',
        deletion_attempts: MAX_DELETION_ATTEMPTS,
      }),
    ]);

    // One poisoned row must not become a total cleanup outage by consuming
    // every run and never reaching the rooms behind it.
    expect(await claimDeletionBatch(10)).toEqual([]);
  });

  it('claims oldest-request-first so successive runs make progress', async () => {
    seed([
      room({ id: 'newer', lifecycle_state: 'deletion_pending', deletion_requested_at: '2026-02-01' }),
      room({ id: 'older', lifecycle_state: 'deletion_pending', deletion_requested_at: '2026-01-01' }),
    ]);

    expect((await claimDeletionBatch(1))[0].id).toBe('older');
  });
});

describe('processing a deletion', () => {
  const ATTACHMENTS = [
    { id: 'a1', room_id: ROOM_ID, storage_path: `${ROOM_ID}/one.png` },
    { id: 'a2', room_id: ROOM_ID, storage_path: `${ROOM_ID}/two.png` },
  ];

  it('destroys objects, then rows, then the room', async () => {
    seed([room({ lifecycle_state: 'deleting' })], ATTACHMENTS);

    const outcome = await processRoomDeletion(ROOM_ID, 0);

    expect(outcome).toMatchObject({ state: 'deleted', deletedObjects: 2, failedObjects: 0 });
    expect(H.db.objects.size).toBe(0);
    expect(H.db.rows('attachments')).toEqual([]);
    expect(H.db.rows('rooms')).toEqual([]);
    expect(eventNames()).toContain('room_deleted');
  });

  it('keeps every database row when storage refuses', async () => {
    seed([room({ lifecycle_state: 'deleting' })], ATTACHMENTS);
    H.db.storageRemoveFailures = 1;

    const outcome = await processRoomDeletion(ROOM_ID, 0);

    // This is the assertion the old implementation failed. The rows are the
    // only record of which objects these were; deleting them here makes the
    // failure permanent and unattributable.
    expect(outcome.state).toBe('deletion_pending');
    expect(H.db.rows('attachments')).toHaveLength(2);
    expect(H.db.rows('rooms')).toHaveLength(1);
    expect(H.db.objects.size).toBe(2);
  });

  it('returns the room to the queue with its attempt counted', async () => {
    seed([room({ lifecycle_state: 'deleting' })], ATTACHMENTS);
    H.db.storageRemoveFailures = 1;

    await processRoomDeletion(ROOM_ID, 0);

    expect(roomRow()).toMatchObject({
      lifecycle_state: 'deletion_pending',
      deletion_attempts: 1,
      deletion_error_code: 'storage_delete_failed',
    });
  });

  it('stores a stable code and never the provider message', async () => {
    seed([room({ lifecycle_state: 'deleting' })], ATTACHMENTS);
    H.db.storageRemoveFailures = 1;

    await processRoomDeletion(ROOM_ID, 0);

    // The Storage error carries the bucket and the full object path, and an
    // object path here begins with the room id.
    const serialized = JSON.stringify(roomRow());
    expect(serialized).not.toContain('clipsync-attachments');
    expect(serialized).not.toContain('secret.png');
    expect(serialized).not.toContain('Object not accessible');
  });

  it('finishes the job on the next run', async () => {
    seed([room({ lifecycle_state: 'deleting' })], ATTACHMENTS);
    H.db.storageRemoveFailures = 1;

    await processRoomDeletion(ROOM_ID, 0);

    // The retry: everything is still addressable because nothing was thrown
    // away, so a second pass completes.
    const claimed = await claimDeletionBatch(10);
    expect(claimed).toEqual([{ id: ROOM_ID, attempts: 1 }]);

    const outcome = await processRoomDeletion(ROOM_ID, 1);
    expect(outcome.state).toBe('deleted');
    expect(H.db.objects.size).toBe(0);
    expect(H.db.rows('rooms')).toEqual([]);
  });

  it('parks the room after the retry budget runs out', async () => {
    seed([room({ lifecycle_state: 'deleting' })], ATTACHMENTS);
    H.db.storageRemoveFailures = 1;

    await processRoomDeletion(ROOM_ID, MAX_DELETION_ATTEMPTS - 1);

    expect(roomRow().lifecycle_state).toBe('deletion_failed');
    expect(await failedDeletionCount()).toBe(1);
  });

  it('records cleanup_failed for every failed attempt', async () => {
    seed([room({ lifecycle_state: 'deleting' })], ATTACHMENTS);
    H.db.storageRemoveFailures = 2;

    await processRoomDeletion(ROOM_ID, 0);
    await processRoomDeletion(ROOM_ID, 1);

    // Not deduplicated: a room that failed twice failed twice, and collapsing
    // them would hide a room stuck in a retry loop.
    expect(eventNames().filter((n) => n === 'cleanup_failed')).toHaveLength(2);
  });
});

describe('idempotency', () => {
  it('is a no-op when run again on a room already gone', async () => {
    seed([room({ lifecycle_state: 'deleting' })], [
      { id: 'a1', room_id: ROOM_ID, storage_path: `${ROOM_ID}/one.png` },
    ]);

    const first = await processRoomDeletion(ROOM_ID, 0);
    const second = await processRoomDeletion(ROOM_ID, 0);

    expect(first.state).toBe('deleted');
    // Running twice must not error, and must not report a failure that would
    // send a healthy room back into the queue.
    expect(second.state).toBe('deleted');
    expect(second.failedObjects).toBe(0);
  });

  it('treats an object that is already missing as deleted', async () => {
    seed([room({ lifecycle_state: 'deleting' })], [
      { id: 'a1', room_id: ROOM_ID, storage_path: `${ROOM_ID}/one.png` },
    ]);
    // The previous attempt removed the object and then crashed before writing
    // anything — the single most likely reason for a retry to exist at all.
    H.db.objects.clear();

    const outcome = await processRoomDeletion(ROOM_ID, 1);

    expect(outcome.state).toBe('deleted');
    expect(H.db.rows('rooms')).toEqual([]);
  });

  it('emits room_deleted once even when the worker runs twice', async () => {
    seed([room({ lifecycle_state: 'deleting' })]);

    await processRoomDeletion(ROOM_ID, 0);
    await processRoomDeletion(ROOM_ID, 0);

    // `room_deleted` is a countable event with no unique index behind it, so
    // this is the application's job: the second pass removes no row and stays
    // silent. Emitting unconditionally would let a retried or double-scheduled
    // run inflate the one number that says how many rooms were destroyed.
    expect(eventNames().filter((n) => n === 'room_deleted')).toHaveLength(1);
  });

  it('handles a room with no attachments at all', async () => {
    seed([room({ lifecycle_state: 'deleting' })]);

    const outcome = await processRoomDeletion(ROOM_ID, 0);
    expect(outcome).toMatchObject({ state: 'deleted', deletedObjects: 0 });
    expect(H.db.removeCalls).toEqual([]);
  });
});

describe('queue depth', () => {
  it('counts everything still owed, which is what an alert watches', async () => {
    seed([
      room({ id: 'r1', lifecycle_state: 'deletion_pending' }),
      room({ id: 'r2', lifecycle_state: 'deleting' }),
      room({ id: 'r3', lifecycle_state: 'active' }),
      room({ id: 'r4', lifecycle_state: 'deletion_failed' }),
    ]);

    // A run can succeed every night and still fall behind. The queue depth is
    // the number that shows it; `last_outcome` never would.
    expect(await pendingDeletionCount()).toBe(2);
    expect(await failedDeletionCount()).toBe(1);
  });
});
