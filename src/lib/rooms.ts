import 'server-only';
import { createAdminClient } from './supabase/server';
import { missingColumnFamily, describeSchemaError } from './schema-errors.mjs';
import type { Attachment, RoomRecord } from './types';

export const ATTACHMENTS_BUCKET = 'clipsync-attachments';

// Everything the owner feature does not need. Kept as its own constant because
// it is also the fallback column set when migration 003 has not run yet.
const BASE_ROOM_COLUMNS = 'id, slug, pin_hash, content, created_at, updated_at, last_seen_at';

// `owner_secret_hash` is selected because authorization needs it; it is a
// digest, never the capability itself, and never leaves the server.
const OWNER_ROOM_COLUMNS = `${BASE_ROOM_COLUMNS}, owner_secret_hash, owner_version`;

// Migration 004's deletion state. Read on every room load because a room that
// has been queued for deletion must stop being readable immediately, long
// before the cron gets to it.
const ROOM_COLUMNS = `${OWNER_ROOM_COLUMNS}, lifecycle_state, deletion_requested_at, deletion_attempts, deletion_error_code`;

/** Exported for the readiness probe, which asserts the columns exist. */
export { ROOM_COLUMNS };

/**
 * Attachments are served through an authenticated route rather than a public
 * storage URL, so a PIN-locked room's images stay locked too.
 */
export function attachmentUrl(slug: string, attachmentId: string): string {
  return `/api/rooms/${encodeURIComponent(slug)}/attachments/${encodeURIComponent(attachmentId)}`;
}

/**
 * Whether the owner columns are known to be missing, and when that was last
 * established.
 *
 * Re-checked rather than latched: once the operator runs the migration the
 * process must pick it up without a redeploy, and a long-lived serverless
 * instance may outlive the fix by hours. The TTL bounds how long a healthy
 * deployment keeps paying for one extra failed query.
 */
const SCHEMA_RECHECK_MS = 60_000;
let ownerColumnsMissingUntil = 0;
let lifecycleColumnsMissingUntil = 0;

function ownerColumnsPresumedMissing(now = Date.now()): boolean {
  return now < ownerColumnsMissingUntil;
}

function lifecycleColumnsPresumedMissing(now = Date.now()): boolean {
  return now < lifecycleColumnsMissingUntil;
}

/** Test seam, and the thing the health check resets after a successful probe. */
export function resetSchemaState(): void {
  ownerColumnsMissingUntil = 0;
  lifecycleColumnsMissingUntil = 0;
}

export function ownerColumnsDegraded(): boolean {
  return ownerColumnsPresumedMissing();
}

export function lifecycleColumnsDegraded(): boolean {
  return lifecycleColumnsPresumedMissing();
}

function noteOwnerColumnsMissing(error: { message?: string }): void {
  const first = !ownerColumnsPresumedMissing();
  ownerColumnsMissingUntil = Date.now() + SCHEMA_RECHECK_MS;
  if (first) {
    console.error(
      '[clipsync] DEGRADED: the `rooms` table has no owner_secret_hash/owner_version column. ' +
        'Run supabase/migrations/003_room_owner.sql. Until then every room is treated as ' +
        'ownerless: reading, saving and uploading still work, but no room can be ' +
        'administered and no new room can be created. ' +
        `Postgres said: ${error.message ?? 'undefined column'}`
    );
  }
}

function noteLifecycleColumnsMissing(error: { message?: string }): void {
  const first = !lifecycleColumnsPresumedMissing();
  lifecycleColumnsMissingUntil = Date.now() + SCHEMA_RECHECK_MS;
  if (first) {
    console.error(
      '[clipsync] DEGRADED: the `rooms` table has no lifecycle_state column. ' +
        'Run supabase/migrations/004_pilot_readiness.sql. Until then every room reads as ' +
        'active, deletion cannot be queued, and the cleanup worker has no queue to drain. ' +
        `Postgres said: ${error.message ?? 'undefined column'}`
    );
  }
}

/**
 * The three column sets, widest first.
 *
 * A room read walks this list and stops at the first one the database accepts.
 * Selecting a column that is not there fails the *whole* query rather than
 * omitting the column, so without this a forgotten migration is a total
 * outage — every route down, including reading a room, which has nothing to do
 * with either feature. Walking down instead turns that into a narrow, named
 * degradation, and each missing field is synthesised as the value a genuinely
 * old row would have had.
 *
 * Both directions of that synthesis are the safe one: a room with no owner
 * becomes unmanageable rather than claimable, and a room with no lifecycle
 * column reads as `active` rather than as deleted — losing the ability to queue
 * a deletion is recoverable, showing a 404 for every live room is not.
 */
function columnSets(): string[] {
  if (ownerColumnsPresumedMissing()) return [BASE_ROOM_COLUMNS];
  if (lifecycleColumnsPresumedMissing()) return [OWNER_ROOM_COLUMNS, BASE_ROOM_COLUMNS];
  return [ROOM_COLUMNS, OWNER_ROOM_COLUMNS, BASE_ROOM_COLUMNS];
}

/** Fills in whatever the accepted column set could not provide. */
function normalizeRoomRow(row: object): RoomRecord {
  const record = row as Partial<RoomRecord>;
  return {
    ...(row as object),
    owner_secret_hash: record.owner_secret_hash ?? null,
    owner_version: record.owner_version ?? 1,
    lifecycle_state: record.lifecycle_state ?? 'active',
    deletion_attempts: record.deletion_attempts ?? 0,
    deletion_requested_at: record.deletion_requested_at ?? null,
    deletion_error_code: record.deletion_error_code ?? null,
  } as RoomRecord;
}

/**
 * Reads a room, tolerating a database one or two migrations behind this build.
 *
 * Returns null for a room that is not `active`. A room whose deletion has been
 * requested must stop being readable at the moment of the request, not when the
 * cron eventually drains the queue: the owner pressed delete, and "deleted"
 * that still serves content for up to a day is not deleted. Reporting it as
 * absent — rather than as a distinct "being deleted" state — is also what keeps
 * the deletion queue from being an enumeration oracle.
 */
export async function getRoom(slug: string): Promise<RoomRecord | null> {
  const record = await readRoomRow('slug', slug);
  if (!record) return null;
  return record.lifecycle_state === 'active' ? record : null;
}

/**
 * The same read without the lifecycle filter, for the deletion worker — which
 * by definition only ever wants the rooms {@link getRoom} hides.
 */
export async function getRoomIncludingDeleted(slug: string): Promise<RoomRecord | null> {
  return readRoomRow('slug', slug);
}

async function readRoomRow(column: string, value: string): Promise<RoomRecord | null> {
  const supabase = createAdminClient();
  const sets = columnSets();

  for (let i = 0; i < sets.length; i++) {
    const { data, error } = await supabase
      .from('rooms')
      .select(sets[i])
      .eq(column, value)
      .maybeSingle();

    if (!error) return data ? normalizeRoomRow(data as object) : null;

    // Which set to fall to is read off the error, not stepped through one at a
    // time: with three sets, stepping costs a guaranteed-to-fail extra query
    // every time it is the owner columns that are missing.
    const family = missingColumnFamily(error);
    const next =
      family === 'owner'
        ? sets.indexOf(BASE_ROOM_COLUMNS)
        : family === 'lifecycle'
          ? sets.indexOf(OWNER_ROOM_COLUMNS)
          : -1;

    if (next <= i) throw describeSchemaError(error);

    if (family === 'owner') noteOwnerColumnsMissing(error);
    else noteLifecycleColumnsMissing(error);

    i = next - 1;
  }

  return null;
}

/**
 * The only way a room comes into existence. There is deliberately no
 * fetch-or-create any more: visiting an unknown URL used to mint a room, which
 * meant the first visitor to any guessed slug became indistinguishable from its
 * creator. Creation now happens in exactly one place, always with a
 * server-generated locator and always with an owner.
 *
 * Returns null when the slug is already taken, so the caller can pick another
 * rather than silently handing back somebody else's room.
 */
export async function createRoom(
  slug: string,
  ownerSecretHash: string
): Promise<RoomRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('rooms')
    .insert([{ slug, content: '', owner_secret_hash: ownerSecretHash }])
    .select(OWNER_ROOM_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') return null; // unique violation on slug
    throw describeSchemaError(error);
  }

  return data as unknown as RoomRecord;
}

export async function listAttachments(roomId: string, slug: string): Promise<Attachment[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('attachments')
    .select('id, room_id, storage_path, filename, mime, size, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((att) => ({
    id: att.id,
    room_id: att.room_id,
    filename: att.filename,
    mime: att.mime,
    size: att.size,
    created_at: att.created_at,
    url: attachmentUrl(slug, att.id),
  }));
}

/**
 * Refreshes the 7-day TTL clock. Awaited on purpose: a fire-and-forget promise
 * in a serverless handler is frequently killed the moment the response is sent.
 */
export async function touchRoom(roomId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('rooms')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', roomId);

  if (error) console.error('[clipsync] failed to touch room', error);
}
