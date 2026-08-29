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

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }));

const {
  MemoryAnalyticsSink,
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
