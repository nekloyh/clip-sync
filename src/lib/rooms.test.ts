import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Deploying this build without migration 003 makes every column the owner
 * feature needs disappear from the select list, so *every* route answers a
 * generic 500 and the log shows a bare PostgREST error. That is a total outage
 * whose one-line fix is invisible. These tests pin the actionable message.
 */

const H = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  /** Every `.eq(column, value)` the code under test applied, in order. */
  filters: [] as { table: string; column: string; value: unknown }[],
  attachments: [] as { storage_path: string }[],
  storageRemoved: [] as string[],
  /** Set false to model a database where migration 003 has not run. */
  ownerColumnsExist: true,
  /** Every select list the code asked for, so the fallback can be observed. */
  selects: [] as string[],
  /** True while the most recent select named a column that does not exist. */
  selectFailed: false,
}));

vi.mock('./supabase/server', () => {
  const settle = () =>
    H.selectFailed
      ? {
          data: null,
          error: { code: '42703', message: 'column rooms.owner_secret_hash does not exist' },
        }
      : H.result;

  return {
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: (columns?: string) => {
          if (typeof columns === 'string') {
            H.selects.push(columns);
            // Postgres fails the whole query when the select list names a
            // column that is not there — it does not silently omit it.
            H.selectFailed =
              !H.ownerColumnsExist && /owner_secret_hash|owner_version/.test(columns);
          }
          return chain;
        },
        insert: () => chain,
        delete: () => chain,
        eq: (column: string, value: unknown) => {
          H.filters.push({ table, column, value });
          return chain;
        },
        maybeSingle: async () => settle(),
        single: async () => settle(),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(
            table === 'attachments' ? { data: H.attachments, error: null } : settle()
          ).then(res, rej),
      };
      return chain;
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          H.storageRemoved.push(...paths);
          return { error: null };
        },
      }),
    },
  }),
  };
});

const { getRoom, getRoomIncludingDeleted, createRoom, resetSchemaState, ownerColumnsDegraded } =
  await import('./rooms');

const UNDEFINED_COLUMN = {
  code: '42703',
  message: 'column rooms.owner_secret_hash does not exist',
};

beforeEach(() => {
  H.result = { data: null, error: null };
  H.filters.length = 0;
  H.attachments.length = 0;
  H.storageRemoved.length = 0;
  H.selects.length = 0;
  H.selectFailed = false;
  H.ownerColumnsExist = true;
  resetSchemaState();
});

describe('the lifecycle gate on room reads', () => {
  const ROW = {
    id: 'r1',
    slug: 'quiet-fox',
    pin_hash: null,
    content: 'evidence',
    created_at: 'x',
    updated_at: 'x',
    last_seen_at: 'x',
    owner_secret_hash: 'hash',
    owner_version: 1,
  };

  it('reads an active room normally', async () => {
    H.result = { data: { ...ROW, lifecycle_state: 'active' }, error: null };
    expect((await getRoom('quiet-fox'))?.content).toBe('evidence');
  });

  it('hides a room the moment its deletion is requested', async () => {
    H.result = { data: { ...ROW, lifecycle_state: 'deletion_pending' }, error: null };

    // The owner pressed delete. "Deleted" that keeps serving content until the
    // cron happens to run is not deleted, and this is the line that makes the
    // promise true at the moment it is made rather than up to a day later.
    expect(await getRoom('quiet-fox')).toBeNull();
  });

  it('hides a room a worker has already claimed', async () => {
    H.result = { data: { ...ROW, lifecycle_state: 'deleting' }, error: null };
    expect(await getRoom('quiet-fox')).toBeNull();
  });

  it('still hides a room whose deletion has permanently failed', async () => {
    H.result = { data: { ...ROW, lifecycle_state: 'deletion_failed' }, error: null };

    // The data is still in storage and an operator has to deal with it, but
    // that is not a reason to hand it back to callers in the meantime.
    expect(await getRoom('quiet-fox')).toBeNull();
  });

  it('lets the deletion worker see what readers cannot', async () => {
    H.result = { data: { ...ROW, lifecycle_state: 'deletion_pending' }, error: null };

    const room = await getRoomIncludingDeleted('quiet-fox');
    expect(room?.lifecycle_state).toBe('deletion_pending');
  });

  it('treats a row from a database without migration 004 as active', async () => {
    H.result = { data: ROW, error: null };

    // Losing the ability to queue a deletion is recoverable; showing a 404 for
    // every live room is not. The synthesis has to fall this way.
    const room = await getRoom('quiet-fox');
    expect(room?.lifecycle_state).toBe('active');
    expect(room?.deletion_attempts).toBe(0);
  });
});

describe('a database where migration 003 has not run', () => {
  const LEGACY_ROW = {
    id: 'r1',
    slug: 'quiet-fox',
    pin_hash: null,
    content: 'still here',
    created_at: 'x',
    updated_at: 'x',
    last_seen_at: 'x',
  };

  it('keeps serving rooms instead of failing every read', async () => {
    H.ownerColumnsExist = false;
    H.result = { data: LEGACY_ROW, error: null };

    const room = await getRoom('quiet-fox');

    // The whole point of the fallback: a forgotten migration must not take the
    // product down, it must take *ownership* down.
    expect(room?.content).toBe('still here');
    expect(H.selects[0]).toContain('owner_secret_hash');
    expect(H.selects[1]).not.toContain('owner_secret_hash');
  });

  it('reports every room as ownerless, which is the fail-safe direction', async () => {
    H.ownerColumnsExist = false;
    H.result = { data: LEGACY_ROW, error: null };

    const room = await getRoom('quiet-fox');
    // Null digest is exactly how a genuine legacy row behaves, and
    // verifyOwnerToken refuses it outright — so the degraded mode can only ever
    // deny management, never hand it to a stranger.
    expect(room?.owner_secret_hash).toBeNull();
    expect(room?.owner_version).toBe(1);
  });

  it('records the degradation so the health check can report it', async () => {
    H.ownerColumnsExist = false;
    H.result = { data: LEGACY_ROW, error: null };

    expect(ownerColumnsDegraded()).toBe(false);
    await getRoom('quiet-fox');
    expect(ownerColumnsDegraded()).toBe(true);
  });

  it('stops re-probing the missing columns on every read', async () => {
    H.ownerColumnsExist = false;
    H.result = { data: LEGACY_ROW, error: null };

    await getRoom('quiet-fox');
    const afterFirst = H.selects.length;
    await getRoom('quiet-fox');

    // One select for the second read, not two: the first read already learned
    // the columns are missing.
    expect(H.selects.length - afterFirst).toBe(1);
  });

  it('recovers once the migration is applied, without a restart', async () => {
    H.ownerColumnsExist = false;
    H.result = { data: LEGACY_ROW, error: null };
    await getRoom('quiet-fox');
    expect(ownerColumnsDegraded()).toBe(true);

    // What the health check does after a successful probe.
    H.ownerColumnsExist = true;
    resetSchemaState();
    H.result = { data: { ...LEGACY_ROW, owner_secret_hash: 'abc', owner_version: 3 }, error: null };

    const room = await getRoom('quiet-fox');
    expect(room?.owner_secret_hash).toBe('abc');
    expect(room?.owner_version).toBe(3);
    expect(ownerColumnsDegraded()).toBe(false);
  });

  it('returns null for a room that does not exist, degraded or not', async () => {
    H.ownerColumnsExist = false;
    H.result = { data: null, error: null };
    expect(await getRoom('nope')).toBeNull();
  });
});

describe('missing migration 003 on paths that cannot degrade', () => {
  it('explains itself when even the fallback read fails', async () => {
    H.result = { data: null, error: UNDEFINED_COLUMN };

    await expect(getRoom('quiet-fox')).rejects.toThrow(
      /Run supabase\/migrations\/003_room_owner\.sql/
    );
  });

  it('explains itself on writes, which have no fallback', async () => {
    // Creating a room *requires* the owner column, so there is nothing to
    // degrade to — this must fail, and say why.
    H.result = { data: null, error: UNDEFINED_COLUMN };
    await expect(createRoom('quiet-fox', 'hash')).rejects.toThrow(/003_room_owner\.sql/);
  });

  it('recognises the failure from the message when the code is absent', async () => {
    H.result = {
      data: null,
      error: { message: "Could not find the 'owner_version' column of 'rooms'" },
    };
    await expect(createRoom('quiet-fox', 'hash')).rejects.toThrow(/003_room_owner\.sql/);
  });

  it('leaves every other database error exactly as it was', async () => {
    const other = { code: '08006', message: 'connection failure' };
    H.result = { data: null, error: other };

    await expect(getRoom('quiet-fox')).rejects.toBe(other);
  });

  it('still reports a taken slug as a collision, not an error', async () => {
    H.result = { data: null, error: { code: '23505', message: 'duplicate key' } };
    expect(await createRoom('quiet-fox', 'hash')).toBeNull();
  });
});
