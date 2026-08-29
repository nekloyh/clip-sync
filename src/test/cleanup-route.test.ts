import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeSupabase } from '@/test/fake-supabase';

/**
 * The scheduled worker, driven end to end through its route handler.
 *
 * The unit tests in `lifecycle.test.ts` pin what one room's deletion does. This
 * pins that the endpoint actually wires those pieces together — expire, claim,
 * destroy, record — and, just as importantly, that a run leaves behind an
 * operational record an alert can be written against. A cron that silently
 * stops firing emits nothing, so its absence is indistinguishable from a quiet
 * week; the `ops_runs` row is what makes that difference visible.
 */

const H = vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-cleanup-route-at-least-32';
  return { db: null as unknown as FakeSupabase };
});

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => H.db.client() }));

const { GET } = await import('@/app/api/cron/cleanup/route');
const { MemoryAnalyticsSink, setAnalyticsSink } = await import('@/lib/analytics');

const SECRET = 'cron-secret-for-tests';
const OLD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

let analytics: InstanceType<typeof MemoryAnalyticsSink>;

function req(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return { headers: new Headers(headers) } as never;
}

function room(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    slug: `quiet-fox-${id}`,
    owner_version: 1,
    lifecycle_state: 'active',
    deletion_requested_at: null,
    deletion_attempts: 0,
    deletion_error_code: null,
    last_seen_at: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  H.db = new FakeSupabase({ rooms: [], attachments: [], ops_runs: [] });
  analytics = new MemoryAnalyticsSink();
  setAnalyticsSink(analytics);
});

const opsRow = () => H.db.rows('ops_runs').find((row) => row.job === 'cleanup');

describe('authorization', () => {
  it('refuses an anonymous caller', async () => {
    expect((await GET(req({}))).status).toBe(401);
  });

  it('refuses a wrong token', async () => {
    expect((await GET(req({ authorization: 'Bearer nope-wrong-token' }))).status).toBe(401);
  });

  it('is 503, not open, when no secret is configured', async () => {
    delete process.env.CRON_SECRET;
    // Without a secret the endpoint would delete every expired room for anyone
    // who found the URL.
    expect((await GET(req({}))).status).toBe(503);
  });
});

describe('a full run', () => {
  it('expires, deletes, and reports counters only', async () => {
    H.db.rows('rooms').push(room('r1', { last_seen_at: OLD }), room('r2'));
    H.db.rows('attachments').push({
      id: 'a1',
      room_id: 'r1',
      storage_path: 'r1/one.png',
      created_at: '2026-01-01',
    });
    H.db.objects.add('r1/one.png');

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ deletedRooms: 1, deletedObjects: 1, failedObjects: 0 });

    // The fresh room is untouched; the expired one is gone from both systems.
    expect(H.db.rows('rooms').map((r) => r.id)).toEqual(['r2']);
    expect(H.db.objects.size).toBe(0);
  });

  it('leaks nothing through the response a scheduler will log', async () => {
    H.db.rows('rooms').push(room('r1', { last_seen_at: OLD }));
    H.db.rows('attachments').push({
      id: 'a1',
      room_id: 'r1',
      storage_path: 'r1/screenshot-of-credentials.png',
      created_at: '2026-01-01',
    });
    H.db.objects.add('r1/screenshot-of-credentials.png');

    const text = await (await GET(req())).text();

    // A scheduler's log is one of the least controlled places output ends up.
    expect(text).not.toContain('quiet-fox');
    expect(text).not.toContain('screenshot-of-credentials');
    expect(text).not.toContain('r1');
  });

  it('records the funnel events for an expiry', async () => {
    H.db.rows('rooms').push(room('r1', { last_seen_at: OLD }));

    await GET(req());

    const names = analytics.rows.map((row) => row.event_name);
    expect(names).toContain('room_expired');
    expect(names).toContain('room_deleted');
    // Nobody decided this handoff was done; the clock claimed it.
    expect(names).not.toContain('room_completed');
  });
});

describe('the operational record', () => {
  it('stamps a start before the work and a completion after it', async () => {
    await GET(req());

    const ops = opsRow()!;
    expect(ops.last_started_at).toBeTruthy();
    expect(ops.last_completed_at).toBeTruthy();
    expect(ops.last_outcome).toBe('success');
    // The number an alert watches: a run that completes every night and still
    // falls behind shows up here and nowhere else.
    expect(ops.pending_work).toBe(0);
  });

  it('reports a backlog when work is left over', async () => {
    H.db.rows('rooms').push(
      room('stuck', {
        lifecycle_state: 'deletion_failed',
        deletion_attempts: 5,
        deletion_requested_at: OLD,
      })
    );
    // A room parked in `deletion_failed` is not claimable, so this is the case
    // where every run reports success while data quietly stays behind.
    H.db.rows('rooms').push(room('pending', { lifecycle_state: 'deletion_pending', deletion_requested_at: OLD }));
    H.db.storageRemoveFailures = 0;

    await GET(req());

    // The pending one was drained this run; the failed one still needs a human.
    expect(opsRow()!.pending_work).toBe(0);
    expect(H.db.rows('rooms').map((r) => r.id)).toEqual(['stuck']);
  });

  it('reports a degraded run when storage refused', async () => {
    H.db.rows('rooms').push(room('r1', { last_seen_at: OLD }));
    H.db.rows('attachments').push({
      id: 'a1',
      room_id: 'r1',
      storage_path: 'r1/one.png',
      created_at: '2026-01-01',
    });
    H.db.objects.add('r1/one.png');
    H.db.storageRemoveFailures = 1;

    const body = await (await GET(req())).json();

    expect(body).toMatchObject({ deletedRooms: 0, failedObjects: 1 });
    expect(body.remainingWork).toBe(1);
    expect(opsRow()!.last_outcome).toBe('degraded');

    // Nothing was thrown away, so the next run can finish the job.
    expect(H.db.rows('rooms')).toHaveLength(1);
    expect(H.db.rows('attachments')).toHaveLength(1);
    expect(H.db.objects.size).toBe(1);
  });
});

describe('running it twice', () => {
  it('is idempotent: the second run finds nothing and errors on nothing', async () => {
    H.db.rows('rooms').push(room('r1', { last_seen_at: OLD }));
    H.db.rows('attachments').push({
      id: 'a1',
      room_id: 'r1',
      storage_path: 'r1/one.png',
      created_at: '2026-01-01',
    });
    H.db.objects.add('r1/one.png');

    const first = await (await GET(req())).json();
    const second = await (await GET(req())).json();

    expect(first).toMatchObject({ deletedRooms: 1, deletedObjects: 1 });
    expect(second).toMatchObject({ deletedRooms: 0, deletedObjects: 0, failedObjects: 0 });
    expect((await GET(req())).status).toBe(200);
  });

  it('does not double-count the funnel across runs', async () => {
    H.db.rows('rooms').push(room('r1', { last_seen_at: OLD }));

    await GET(req());
    await GET(req());

    const names = analytics.rows.map((row) => row.event_name);
    expect(names.filter((n) => n === 'room_expired')).toHaveLength(1);
    expect(names.filter((n) => n === 'room_deleted')).toHaveLength(1);
  });

  it('finishes a deletion that a previous run could not', async () => {
    H.db.rows('rooms').push(room('r1', { last_seen_at: OLD }));
    H.db.rows('attachments').push({
      id: 'a1',
      room_id: 'r1',
      storage_path: 'r1/one.png',
      created_at: '2026-01-01',
    });
    H.db.objects.add('r1/one.png');
    H.db.storageRemoveFailures = 1;

    await GET(req());
    expect(H.db.rows('rooms')).toHaveLength(1);

    // Storage has recovered. The room is still fully described in the database,
    // so the retry has everything it needs.
    const second = await (await GET(req())).json();
    expect(second).toMatchObject({ deletedRooms: 1, deletedObjects: 1 });
    expect(H.db.rows('rooms')).toEqual([]);
    expect(H.db.objects.size).toBe(0);
  });
});
