import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Idempotency of the funnel's once-per-room events.
 *
 * The failure this guards against is not exotic. `second_device_joined` is
 * evaluated on every room read, and the client reads on mount, on every
 * realtime ping and whenever the tab regains focus — so a recipient on a phone
 * that keeps waking produces dozens of evaluations for one recipient. If each
 * wrote a row, the single number this pilot exists to measure would be a count
 * of reconnects.
 *
 * Two mechanisms, tested separately because they fail differently:
 *
 *   the unique index      correctness. Survives a restart, a second instance
 *                         and a concurrent request.
 *   the in-process memo   cost only. Saves the round trip; guarantees nothing.
 */

vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-analytics-at-least-32-chars';
});

const db = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: db.insert,
      // Not a stub of a method that exists: reaching for the conflict-target
      // shortcut against a *partial* unique index is the defect itself, and it
      // fails as 42P10 at runtime where `track` swallows it. Fail loudly here
      // instead of letting a test pass on a call production cannot make.
      upsert: () => {
        throw new Error('upsert cannot infer a partial index; use insert and tolerate 23505');
      },
    }),
  }),
}));

const {
  MemoryAnalyticsSink,
  SupabaseAnalyticsSink,
  setAnalyticsSink,
  resetAnalyticsMemo,
  track,
  trackOnce,
  EVENTS,
} = await import('./index');

const REF_A = 'a1b2c3d4e5f60718a1b2c3d4e5f60718';
const REF_B = 'ffffffffffffffffffffffffffffffff';

let sink: InstanceType<typeof MemoryAnalyticsSink>;

beforeEach(() => {
  sink = new MemoryAnalyticsSink();
  setAnalyticsSink(sink);
  resetAnalyticsMemo();
});

const names = () => sink.rows.map((row) => row.event_name);

describe('once-per-room events', () => {
  it('records first_content_transferred exactly once however often it fires', async () => {
    for (let i = 0; i < 20; i++) {
      await track({
        name: EVENTS.FIRST_CONTENT_TRANSFERRED,
        roomRef: REF_A,
        actor: 'recipient',
      });
    }

    expect(names().filter((n) => n === 'first_content_transferred')).toHaveLength(1);
  });

  it('is not fooled by a reconnect storm on second_device_joined', async () => {
    // A phone waking from sleep: same room, same recipient, twelve reads.
    for (let i = 0; i < 12; i++) {
      await track({ name: EVENTS.SECOND_DEVICE_JOINED, roomRef: REF_A, actor: 'recipient' });
    }

    expect(names().filter((n) => n === 'second_device_joined')).toHaveLength(1);
  });

  it('records room_expired once even if two cron runs claim the same room', async () => {
    await track({ name: EVENTS.ROOM_EXPIRED, roomRef: REF_A, actor: 'system' });
    await track({ name: EVENTS.ROOM_EXPIRED, roomRef: REF_A, actor: 'system' });

    expect(names().filter((n) => n === 'room_expired')).toHaveLength(1);
  });

  it('records room_created and room_completed once each', async () => {
    await track({ name: EVENTS.ROOM_CREATED, roomRef: REF_A, actor: 'owner' });
    await track({ name: EVENTS.ROOM_CREATED, roomRef: REF_A, actor: 'owner' });
    await track({ name: EVENTS.ROOM_COMPLETED, roomRef: REF_A, actor: 'owner' });
    await track({ name: EVENTS.ROOM_COMPLETED, roomRef: REF_A, actor: 'owner' });

    expect(names().filter((n) => n === 'room_created')).toHaveLength(1);
    expect(names().filter((n) => n === 'room_completed')).toHaveLength(1);
  });

  it('deduplicates per room, not globally', () => {
    // The obvious wrong implementation: a set keyed by event name alone, which
    // would record the first room's join and silently drop every other room's.
    return Promise.all([
      track({ name: EVENTS.SECOND_DEVICE_JOINED, roomRef: REF_A, actor: 'recipient' }),
      track({ name: EVENTS.SECOND_DEVICE_JOINED, roomRef: REF_B, actor: 'recipient' }),
    ]).then(() => {
      expect(names().filter((n) => n === 'second_device_joined')).toHaveLength(2);
    });
  });

  it('keeps different stages of the same room apart', async () => {
    await track({ name: EVENTS.ROOM_CREATED, roomRef: REF_A, actor: 'owner' });
    await track({ name: EVENTS.SECOND_DEVICE_JOINED, roomRef: REF_A, actor: 'recipient' });
    await track({ name: EVENTS.FIRST_CONTENT_TRANSFERRED, roomRef: REF_A, actor: 'recipient' });

    expect(names()).toEqual([
      'room_created',
      'second_device_joined',
      'first_content_transferred',
    ]);
  });
});

describe('countable events', () => {
  it('records every attachment upload', async () => {
    for (let i = 0; i < 3; i++) {
      await track({
        name: EVENTS.ATTACHMENT_UPLOADED,
        roomRef: REF_A,
        actor: 'recipient',
        sizeBucket: 'lt_1mb',
        mimeCategory: 'image',
      });
    }

    // Deduplicating here would report a room with three screenshots as a room
    // with one.
    expect(names().filter((n) => n === 'attachment_uploaded')).toHaveLength(3);
  });

  it('records every failed cleanup run separately', async () => {
    await track({ name: EVENTS.CLEANUP_FAILED, roomRef: REF_A, outcome: 'failure' });
    await track({ name: EVENTS.CLEANUP_FAILED, roomRef: REF_A, outcome: 'failure' });

    expect(names().filter((n) => n === 'cleanup_failed')).toHaveLength(2);
  });
});

describe('trackOnce', () => {
  it('skips the round trip for something this process already wrote', async () => {
    const recorded: string[] = [];
    setAnalyticsSink({
      kind: 'counting',
      record: async (event) => {
        recorded.push(event.name);
      },
    });

    for (let i = 0; i < 10; i++) {
      await trackOnce({ name: EVENTS.SECOND_DEVICE_JOINED, roomRef: REF_A });
    }

    expect(recorded).toHaveLength(1);
  });

  it('is only an optimisation: the sink still deduplicates without it', async () => {
    // Models a second serverless instance, or this one after a restart — the
    // memo is empty, so every call reaches the sink and the constraint is what
    // keeps the count right.
    for (let i = 0; i < 5; i++) {
      resetAnalyticsMemo();
      await trackOnce({ name: EVENTS.SECOND_DEVICE_JOINED, roomRef: REF_A });
    }

    expect(names().filter((n) => n === 'second_device_joined')).toHaveLength(1);
  });
});

/**
 * The sink that actually talks to Postgres.
 *
 * Everything above runs against `MemoryAnalyticsSink`, which reimplements the
 * dedup rule in JavaScript — so it proves the rule and nothing about the
 * statement that enforces it. That gap is where a real defect lived: the sink
 * asked for `on conflict (room_ref, event_name)`, which a partial index cannot
 * satisfy, so every once-per-room write failed with 42P10 and `track` logged it
 * and moved on. All five funnel stages recorded zero rows, in a suite that was
 * entirely green.
 */
describe('SupabaseAnalyticsSink', () => {
  const sink = () => new SupabaseAnalyticsSink();
  const join = { name: EVENTS.SECOND_DEVICE_JOINED, roomRef: REF_A, actor: 'recipient' } as const;
  const upload = {
    name: EVENTS.ATTACHMENT_UPLOADED,
    roomRef: REF_A,
    actor: 'recipient',
    sizeBucket: 'lt_1mb',
    mimeCategory: 'image',
  } as const;

  beforeEach(() => {
    db.insert.mockReset();
    db.insert.mockResolvedValue({ error: null });
  });

  it('writes a once-per-room event with a plain insert', async () => {
    await sink().record(join);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith([
      expect.objectContaining({ event_name: 'second_device_joined', room_ref: REF_A }),
    ]);
  });

  it('treats the unique-index duplicate as the stage having been recorded already', async () => {
    db.insert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    await expect(sink().record(join)).resolves.toBeUndefined();
  });

  it('still surfaces any other write failure', async () => {
    // The one that must never be mistaken for a duplicate: migration 004 not
    // applied. Swallowing it would report a healthy funnel that records nothing.
    db.insert.mockResolvedValue({
      error: { code: '42P01', message: 'relation "analytics_events" does not exist' },
    });

    await expect(sink().record(join)).rejects.toMatchObject({ code: '42P01' });
  });

  it('does not swallow 23505 for a countable event', async () => {
    // No unique index covers `attachment_uploaded`, so a duplicate there is not
    // idempotency working - it is something wrong that should be seen.
    db.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    await expect(sink().record(upload)).rejects.toMatchObject({ code: '23505' });
  });
});

describe('failure handling', () => {
  it('never lets a telemetry failure break the request it describes', async () => {
    setAnalyticsSink({
      kind: 'broken',
      record: async () => {
        throw new Error('relation "analytics_events" does not exist');
      },
    });

    await expect(
      track({ name: EVENTS.ROOM_CREATED, roomRef: REF_A, actor: 'owner' })
    ).resolves.toBeUndefined();
  });
});
