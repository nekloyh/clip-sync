import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeSupabase } from '@/test/fake-supabase';

/**
 * The reconciliation job, driven through its route handler.
 *
 * `reconcile.test.ts` pins what a scan finds. This pins the thing an operator
 * actually reads: the `ops_runs` row the scan leaves behind. docs/OPERATIONS.md
 * §5 turns that row into an alert — "Reconcile đổ vỡ … Không quét được gì" — so
 * the row has to distinguish three states a report of "success, zero findings"
 * would otherwise flatten into one: nothing was wrong, nothing was looked at,
 * and the scan was fine but the bookkeeping around it was not.
 */

const H = vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-reconcile-route-at-least-32';
  return { db: null as unknown as FakeSupabase };
});

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => H.db.client() }));

const { GET } = await import('@/app/api/cron/reconcile/route');
const { setLogSink } = await import('@/lib/log');

const SECRET = 'cron-secret-for-tests';
const ROOM_A = 'aaaaaaaa-0000-4000-8000-000000000000';

function req(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return { headers: new Headers(headers) } as never;
}

const opsRow = () => H.db.rows('ops_runs').find((row) => row.job === 'reconcile');

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  H.db = new FakeSupabase({ rooms: [], attachments: [], reconciliation_findings: [], ops_runs: [] });
});

describe('a scan that completed', () => {
  it('records the run as a success and reports every open finding as the queue depth', async () => {
    H.db.objects.add(`${ROOM_A}/orphan.png`);

    const body = await (await GET(req())).json();

    expect(body).toMatchObject({ objectWithoutDb: 1, recorded: 1, openFindings: 1 });
    expect(opsRow()).toMatchObject({ last_outcome: 'success', pending_work: 1 });
  });

  it('reports work still open even on a run that found nothing new', async () => {
    H.db.objects.add(`${ROOM_A}/orphan.png`);
    await GET(req());

    const body = await (await GET(req())).json();

    // The drift has not moved, so nothing is recorded — but it is still an
    // operator's to-do. Reporting only what this run wrote would drop the queue
    // depth to zero the day after a finding appears.
    expect(body).toMatchObject({ recorded: 0, openFindings: 1 });
    expect(opsRow()).toMatchObject({ last_outcome: 'success', pending_work: 1 });
  });
});

describe('a scan that could not look', () => {
  it('records the run as a failure', async () => {
    H.db.storageListFails = true;

    const res = await GET(req());

    // The alert in docs/OPERATIONS.md §5 fires on this row. Recording success
    // here would make an outage indistinguishable from a clean bucket at
    // exactly the moment there is most to find.
    expect(res.status).toBe(500);
    expect(opsRow()).toMatchObject({ last_outcome: 'failure' });
  });

  it('says nothing about the provider that broke', async () => {
    H.db.storageListFails = true;

    const text = await (await GET(req())).text();

    expect(text).not.toContain('storage listing unavailable');
    expect(text).not.toContain('clipsync-attachments');
  });

  it('records a failure when the attachment rows cannot be read either', async () => {
    H.db.failingTable = 'attachments';

    expect((await GET(req())).status).toBe(500);
    expect(opsRow()).toMatchObject({ last_outcome: 'failure' });
  });
});

describe('a scan that worked while the bookkeeping did not', () => {
  it('stays a success when only the open-finding count fails', async () => {
    H.db.objects.add(`${ROOM_A}/orphan.png`);
    // The sweep reads Storage; the count reads this table. Failing the run for
    // the second would send an operator to inspect a bucket that was fine —
    // docs/OPERATIONS.md §5 tells them a reconcile failure means the scan did
    // not happen.
    H.db.failingTable = 'reconciliation_findings';

    const lines: Record<string, unknown>[] = [];
    const restore = setLogSink((_level, line) => lines.push(line));
    let body: Record<string, unknown>;
    try {
      body = await (await GET(req())).json();
    } finally {
      setLogSink(restore);
    }

    expect(opsRow()).toMatchObject({ last_outcome: 'success' });
    // Null rather than a number invented to fill the field: the count is not
    // known this run, and saying so is the only honest option.
    expect(body!.openFindings).toBeNull();
    expect(lines.map((line) => line.event)).toContain('reconcile.count_failed');
  });

  it('falls back to what this run saw, so the queue depth is never silently zero', async () => {
    H.db.objects.add(`${ROOM_A}/orphan.png`);
    H.db.failingTable = 'reconciliation_findings';

    await GET(req());

    expect(opsRow()).toMatchObject({ pending_work: 1 });
  });
});

describe('authorisation', () => {
  it('refuses a request without the cron secret', async () => {
    expect((await GET(req({}))).status).toBe(401);
  });

  it('reports itself unconfigured rather than open when no secret is set', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req({}))).status).toBe(503);
  });
});
