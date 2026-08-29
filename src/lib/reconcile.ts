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
  dbWithoutObject: number;
  objectWithoutDb: number;
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

  const { data: folders } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .list('', { limit: batchSize, sortBy: { column: 'name', order: 'asc' } });

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
  const { data: rows } = await supabase
    .from('attachments')
    .select('id, room_id, storage_path')
    .order('created_at', { ascending: true })
    .limit(batchSize);

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

  if (findings.length > 0) {
    const { error } = await supabase.from('reconciliation_findings').insert(findings);
    if (error) {
      log.warn({ event: 'reconcile.write_failed', outcome: 'failure', findings: findings.length });
    }
  }

  const objectWithoutDb = findings.length - dbWithoutObject;

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
    hasMore: roomIds.length === batchSize || (rows ?? []).length === batchSize,
  };
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
