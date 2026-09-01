import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeSupabase } from '@/test/fake-supabase';

/**
 * Two-way drift detection.
 *
 * The previous orphan sweep only ever looked one way — storage objects with no
 * live room — and deleted what it found. Both halves of that were wrong. It
 * could not see an attachment row whose object had gone (the case a user
 * actually experiences, as a thumbnail that 404s), and deleting on the evidence
 * it had risked destroying an upload that was merely still in flight, since an
 * upload writes the object first and the row second.
 */

const H = vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-reconcile-at-least-32-chars';
  return { db: null as unknown as FakeSupabase };
});

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => H.db.client() }));

const { reconcile, openFindings, countOpenFindings } = await import('./reconcile');

const ROOM_A = 'aaaaaaaa-0000-4000-8000-000000000000';
const ROOM_B = 'bbbbbbbb-0000-4000-8000-000000000000';

const findings = () => H.db.rows('reconciliation_findings');
const kinds = () => findings().map((row) => row.kind);

beforeEach(() => {
  H.db = new FakeSupabase({ rooms: [], attachments: [], reconciliation_findings: [] });
});

describe('a healthy deployment', () => {
  it('finds nothing when rows and objects agree', async () => {
    H.db.rows('rooms').push({ id: ROOM_A });
    H.db.rows('attachments').push({
      id: 'att-1',
      room_id: ROOM_A,
      storage_path: `${ROOM_A}/one.png`,
      created_at: '2026-01-01',
    });
    H.db.objects.add(`${ROOM_A}/one.png`);

    const report = await reconcile(100);

    expect(report).toMatchObject({ dbWithoutObject: 0, objectWithoutDb: 0 });
    expect(findings()).toEqual([]);
  });
});

describe('database rows whose object is gone', () => {
  it('detects the direction the old sweep was blind to', async () => {
    H.db.rows('rooms').push({ id: ROOM_A });
    H.db.rows('attachments').push({
      id: 'att-1',
      room_id: ROOM_A,
      storage_path: `${ROOM_A}/missing.png`,
      created_at: '2026-01-01',
    });
    // The object is simply not there. A user sees this as a broken thumbnail.

    const report = await reconcile(100);

    expect(report.dbWithoutObject).toBe(1);
    expect(kinds()).toEqual(['db_without_object']);
  });

  it('records the attachment id and not the storage path', async () => {
    H.db.rows('rooms').push({ id: ROOM_A });
    H.db.rows('attachments').push({
      id: 'att-1',
      room_id: ROOM_A,
      storage_path: `${ROOM_A}/missing.png`,
      created_at: '2026-01-01',
    });

    await reconcile(100);

    const finding = findings()[0];
    expect(finding.attachment_id).toBe('att-1');
    // The attachment UUID is app-internal and carries no user data. The storage
    // path is not recorded because it embeds the room id.
    expect(JSON.stringify(finding)).not.toContain(ROOM_A);
    expect(JSON.stringify(finding)).not.toContain('missing.png');
    expect(String(finding.room_ref)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('reports nothing when the storage listing itself failed', async () => {
    H.db.rows('rooms').push({ id: ROOM_A });
    H.db.rows('attachments').push({
      id: 'att-1',
      room_id: ROOM_A,
      storage_path: `${ROOM_A}/one.png`,
      created_at: '2026-01-01',
    });
    H.db.objects.add(`${ROOM_A}/one.png`);
    H.db.storageRoomListFails = true;

    // A listing error is not evidence of absence. Treating it as one would
    // report every attachment in the room as orphaned the first time Storage
    // has a bad minute.
    const report = await reconcile(100);
    expect(report.dbWithoutObject).toBe(0);
    expect(findings()).toEqual([]);
  });

  it('fails the run when it could not scan at all', async () => {
    H.db.rows('rooms').push({ id: ROOM_A });
    H.db.objects.add(`${ROOM_A}/one.png`);
    H.db.storageListFails = true;

    // Distinct from the case above. There, one room could not be read and the
    // rest of the sweep still happened. Here nothing was looked at, and a
    // report of "success, zero findings" would be indistinguishable from a
    // clean bucket at exactly the moment there is most to find — so the run has
    // to fail and be recorded as a failure.
    await expect(reconcile(100)).rejects.toThrow();
  });
});

describe('storage objects no room claims', () => {
  it('detects a folder whose room is gone', async () => {
    H.db.objects.add(`${ROOM_B}/orphan.png`);

    const report = await reconcile(100);

    expect(report.objectWithoutDb).toBe(1);
    expect(kinds()).toEqual(['object_without_db']);
  });

  it('leaves the object in place', async () => {
    H.db.objects.add(`${ROOM_B}/orphan.png`);

    await reconcile(100);

    // Report-only, and deliberately so: an object with no row is
    // indistinguishable from an upload still in flight, because an upload
    // writes the object first and the row second.
    expect(H.db.objects.has(`${ROOM_B}/orphan.png`)).toBe(true);
    expect(H.db.removeCalls).toEqual([]);
  });

  it('says nothing about a folder this application did not create', async () => {
    H.db.objects.add('some-other-system/data.bin');

    const report = await reconcile(100);

    // Not deleted, and not even recorded: a finding is a suggestion to an
    // operator, and suggesting the deletion of another system's data is how a
    // reconciler causes an incident.
    expect(report.objectWithoutDb).toBe(0);
    expect(findings()).toEqual([]);
  });

  it('leaves the objects of a live room alone', async () => {
    H.db.rows('rooms').push({ id: ROOM_A });
    H.db.objects.add(`${ROOM_A}/one.png`);

    expect((await reconcile(100)).objectWithoutDb).toBe(0);
  });
});

describe('both directions at once', () => {
  it('reports each kind separately', async () => {
    H.db.rows('rooms').push({ id: ROOM_A });
    H.db.rows('attachments').push({
      id: 'att-1',
      room_id: ROOM_A,
      storage_path: `${ROOM_A}/missing.png`,
      created_at: '2026-01-01',
    });
    H.db.objects.add(`${ROOM_B}/orphan.png`);

    const report = await reconcile(100);

    expect(report).toMatchObject({ dbWithoutObject: 1, objectWithoutDb: 1 });
    expect(kinds().sort()).toEqual(['db_without_object', 'object_without_db']);
  });
});

describe('bounded scanning', () => {
  it('reports hasMore rather than trying to walk the whole bucket', async () => {
    for (let i = 0; i < 5; i++) {
      H.db.objects.add(`${i}aaaaaaa-0000-4000-8000-00000000000${i}/x.png`);
    }

    // A serverless invocation has a hard wall-clock limit. A reconciler that
    // tries to finish in one pass gets killed partway through every night once
    // the bucket is large enough, reporting nothing exactly when there is most
    // to find.
    expect((await reconcile(5)).hasMore).toBe(true);
    expect((await reconcile(100)).hasMore).toBe(false);
  });
});

describe('reading findings back', () => {
  it('returns open findings newest first', async () => {
    H.db.rows('reconciliation_findings').push(
      { kind: 'db_without_object', room_ref: 'a'.repeat(32), detected_at: '2026-01-01', resolved_at: null },
      { kind: 'object_without_db', room_ref: 'b'.repeat(32), detected_at: '2026-02-01', resolved_at: null },
      { kind: 'object_without_db', room_ref: 'c'.repeat(32), detected_at: '2026-03-01', resolved_at: '2026-03-02' }
    );

    const open = await openFindings(10);

    expect(open).toHaveLength(2);
    expect(open[0].detectedAt).toBe('2026-02-01');
  });

  it('counts every open finding, not just the page an operator is shown', async () => {
    for (let i = 0; i < 25; i++) {
      H.db.rows('reconciliation_findings').push({
        kind: 'object_without_db',
        room_ref: String(i).padStart(32, '0'),
        detected_at: '2026-01-01',
        resolved_at: null,
      });
    }
    H.db.rows('reconciliation_findings').push({
      kind: 'object_without_db',
      room_ref: 'f'.repeat(32),
      detected_at: '2026-01-01',
      resolved_at: '2026-01-02',
    });

    // The alert in docs/OPERATIONS.md watches this number rising. Reporting the
    // length of the first page instead made it saturate at the page size and
    // stop moving — blind from the exact point it was written to watch.
    expect(await openFindings(20)).toHaveLength(20);
    expect(await countOpenFindings()).toBe(25);
  });
});

describe('running it again on drift that has not moved', () => {
  it('does not record the same finding twice across runs', async () => {
    H.db.rows('rooms').push({ id: ROOM_A });
    H.db.rows('attachments').push({
      id: 'att-1',
      room_id: ROOM_A,
      storage_path: `${ROOM_A}/missing.png`,
      created_at: '2026-01-01',
    });
    H.db.objects.add(`${ROOM_B}/orphan.png`);

    const first = await reconcile(100);
    const second = await reconcile(100);

    // Both runs *see* the drift — it is still there, and saying otherwise would
    // be a reconciler that forgets. Only the first one records it. Without
    // this, one orphan becomes one new row every night and the "open findings
    // rising steadily" alert fires on the reconciler duplicating itself.
    expect(first).toMatchObject({ dbWithoutObject: 1, objectWithoutDb: 1, recorded: 2 });
    expect(second).toMatchObject({ dbWithoutObject: 1, objectWithoutDb: 1, recorded: 0 });
    expect(findings()).toHaveLength(2);
    expect(await countOpenFindings()).toBe(2);
  });

  it('records a finding again once the old one has been resolved', async () => {
    H.db.objects.add(`${ROOM_B}/orphan.png`);

    await reconcile(100);
    // An operator dealt with it, and the object drifted back. That is a new
    // fact, not a duplicate of a closed one.
    findings()[0].resolved_at = '2026-04-01';

    expect((await reconcile(100)).recorded).toBe(1);
    expect(findings()).toHaveLength(2);
  });

  it('records nothing rather than duplicating when it cannot read what is open', async () => {
    H.db.objects.add(`${ROOM_B}/orphan.png`);
    H.db.failingTable = 'reconciliation_findings';

    // Reporting nothing new this run is recoverable. Doubling the queue an
    // operator is triaging is the failure this guard exists to prevent.
    expect((await reconcile(100)).recorded).toBe(0);
    expect(findings()).toEqual([]);
  });
});
