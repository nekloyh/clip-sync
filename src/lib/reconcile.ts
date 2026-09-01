import 'server-only';
import { createAdminClient } from './supabase/server';
import { ATTACHMENTS_BUCKET } from './rooms';
import { log } from './log';
import { roomRef } from './pseudonym';

/**
 * Two-way drift detection between the database and object storage.
 *
 * Deletion spans two systems with no shared transaction, so drift is not a
 * hypothetical — it is the expected residue of every crash, timeout and
 * killed serverless invocation. It comes in two shapes and they are not
 * symmetric:
 *
 *   db_without_object  an attachment row whose object is missing. Visible to
 *                      users as a thumbnail that 404s, and invisible to the
 *                      orphan sweep, which only ever looked the other way. This
 *                      is the one the old code could not see at all.
 *   object_without_db  an object no live room claims. Invisible to users and
 *                      billed monthly, forever, in a product whose promise is
 *                      that data expires.
 *
 * Report-only, and that is a decision rather than an unfinished feature.
 *
 * "An object with no row" is indistinguishable from "an upload that is still in
 * flight" — the upload writes the object first and the row second, so a
 * reconciler racing a live upload sees a genuine orphan — and from "an object
 * this application did not create". Deleting on that evidence destroys a
 * customer's evidence in exchange for a few kilobytes of storage, which is a
 * trade this product should never make automatically. So findings are recorded
 * and an operator decides. When automatic collection is added, the safe design
 * is a second pass that only acts on a finding still present after a grace
 * period long enough to exclude an in-flight upload.
 */

export interface ReconcileReport {
  scannedRooms: number;
  /** Drift seen this run, whether or not it was already on record. */
  dbWithoutObject: number;
  objectWithoutDb: number;
  /** Findings this run added. Zero with non-zero drift means "same as yesterday". */
  recorded: number;
  hasMore: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scan one batch of storage folders and one batch of attachment rows.
 *
 * Bounded on purpose. A serverless invocation has a hard wall-clock limit, and
 * a reconciler that tries to walk the whole bucket in one pass gets killed
 * partway through every night once the bucket is large enough — doing no useful
 * work and reporting nothing, precisely when there is most to find. Successive
 * runs make progress instead.
 */
export async function reconcile(batchSize = 100): Promise<ReconcileReport> {
  const supabase = createAdminClient();

  // A failure here is not "nothing to report", it is "nothing was looked at",
  // and the two are indistinguishable in a report that says `success` with zero
  // findings. Throwing lets the route record the run as a failure, which is the
  // honest answer at the moment there is most to find.
  const { data: folders, error: folderErr } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .list('', { limit: batchSize, sortBy: { column: 'name', order: 'asc' } });

  if (folderErr) throw new Error('reconcile: could not list the attachments bucket');

  // Objects are laid out as `<room_id>/<uuid>.<ext>`, so a top-level entry that
  // is not a UUID was not created by this application. It is left strictly
  // alone: not deleted, and not even recorded as a finding, because a finding
  // is a suggestion to an operator and suggesting the deletion of something
  // that belongs to another system is how a reconciler causes an incident.
  const roomIds = (folders ?? [])
    .map((entry) => entry.name)
    .filter((name): name is string => Boolean(name) && UUID.test(name));

  const liveRoomIds = new Set<string>();
  if (roomIds.length > 0) {
    const { data: live } = await supabase.from('rooms').select('id').in('id', roomIds);
    for (const row of live ?? []) liveRoomIds.add(row.id as string);
  }

  const findings: Array<{ kind: string; room_ref: string; attachment_id: string | null }> = [];

  for (const roomId of roomIds) {
    if (liveRoomIds.has(roomId)) continue;
    findings.push({
      kind: 'object_without_db',
      room_ref: roomRef(roomId),
      attachment_id: null,
    });
  }

  // The other direction: rows whose object is gone. Checked per room folder so
  // this costs one `list` per room rather than one `download` per attachment.
  let dbWithoutObject = 0;
  const { data: rows, error: rowsErr } = await supabase
    .from('attachments')
    .select('id, room_id, storage_path')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (rowsErr) throw new Error('reconcile: could not read attachment rows');

  const byRoom = new Map<string, Array<{ id: string; path: string }>>();
  for (const row of rows ?? []) {
    const roomId = row.room_id as string;
    const list = byRoom.get(roomId) ?? [];
    list.push({ id: row.id as string, path: row.storage_path as string });
    byRoom.set(roomId, list);
  }

  for (const [roomId, attachments] of byRoom) {
    const { data: objects, error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .list(roomId, { limit: 200 });

    // A listing error is not evidence of absence. Recording findings from a
    // failed list would report every attachment in the room as orphaned the
    // first time Storage has a bad minute.
    if (error) continue;

    const present = new Set((objects ?? []).map((object) => `${roomId}/${object.name}`));
    for (const attachment of attachments) {
      if (present.has(attachment.path)) continue;
      dbWithoutObject += 1;
      findings.push({
        kind: 'db_without_object',
        room_ref: roomRef(roomId),
        // The attachment UUID is app-internal and carries no user data. The
        // storage path is deliberately not recorded: it embeds the room id.
        attachment_id: attachment.id,
      });
    }
  }

  const objectWithoutDb = findings.length - dbWithoutObject;

  // Record only drift that is not already on the books.
  //
  // Without this, a single orphaned object becomes one new row every night, and
  // the alert in docs/OPERATIONS.md — "open findings rising steadily" — fires on
  // the reconciler duplicating itself rather than on anything drifting. The
  // dedupe key is the finding, not the run: the same object, still orphaned
  // tomorrow, is the same fact.
  const recorded = findings.length > 0 ? await recordNewFindings(findings) : 0;

  log.info({
    event: 'reconcile.completed',
    outcome: 'success',
    findings: findings.length,
    pendingWork: objectWithoutDb,
  });

  return {
    scannedRooms: roomIds.length,
    dbWithoutObject,
    objectWithoutDb,
    recorded,
    hasMore: roomIds.length === batchSize || (rows ?? []).length === batchSize,
  };
}

type Finding = { kind: string; room_ref: string; attachment_id: string | null };

const identity = (finding: Finding) =>
  `${finding.kind}|${finding.room_ref}|${finding.attachment_id ?? ''}`;

/** Inserts the findings that are not already open, and reports how many that was. */
async function recordNewFindings(findings: Finding[]): Promise<number> {
  const supabase = createAdminClient();
  const refs = [...new Set(findings.map((finding) => finding.room_ref))];

  const { data: open, error: readErr } = await supabase
    .from('reconciliation_findings')
    .select('kind, room_ref, attachment_id')
    .is('resolved_at', null)
    .in('room_ref', refs);

  // A read failure must not turn into a duplicate write. Reporting nothing new
  // this run is recoverable; doubling the queue an operator is triaging is the
  // failure this whole function exists to prevent.
  if (readErr) {
    log.warn({ event: 'reconcile.write_failed', outcome: 'failure', findings: findings.length });
    return 0;
  }

  const known = new Set((open ?? []).map((row) => identity(row as Finding)));
  const fresh = findings.filter((finding) => !known.has(identity(finding)));
  if (fresh.length === 0) return 0;

  const { error } = await supabase.from('reconciliation_findings').insert(fresh);
  if (error) {
    log.warn({ event: 'reconcile.write_failed', outcome: 'failure', findings: fresh.length });
    return 0;
  }

  return fresh.length;
}

/**
 * How many findings are open in total.
 *
 * Separate from {@link openFindings} because the two answer different
 * questions and conflating them broke the alert: the ops endpoint used to
 * report the *length of the first page* as the open count, so the number an
 * operator watches for "rising steadily" saturated at the page size and never
 * moved again.
 */
export async function countOpenFindings(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from('reconciliation_findings')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null);

  if (error) throw error;
  return count ?? 0;
}

/** Open findings, newest first, for the protected ops endpoint. */
export async function openFindings(limit = 50): Promise<
  Array<{ kind: string; roomRef: string | null; detectedAt: string }>
> {
  const { data, error } = await createAdminClient()
    .from('reconciliation_findings')
    .select('kind, room_ref, detected_at')
    .is('resolved_at', null)
    .order('detected_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    kind: row.kind as string,
    roomRef: (row.room_ref as string | null) ?? null,
    detectedAt: row.detected_at as string,
  }));
}
