import 'server-only';
import { createAdminClient } from './supabase/server';
import type { Attachment, RoomRecord } from './types';

export const ATTACHMENTS_BUCKET = 'clipsync-attachments';

/**
 * Attachments are served through an authenticated route rather than a public
 * storage URL, so a PIN-locked room's images stay locked too.
 */
export function attachmentUrl(slug: string, attachmentId: string): string {
  return `/api/rooms/${encodeURIComponent(slug)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export async function getRoom(slug: string): Promise<RoomRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('rooms')
    .select('id, slug, pin_hash, content, created_at, updated_at, last_seen_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return (data as RoomRecord) ?? null;
}

/**
 * Fetch-or-create. Two devices opening the same fresh URL simultaneously both
 * miss the select and both insert; the unique index on `slug` makes one of them
 * fail with 23505, and that loser simply re-reads the winner's row.
 */
export async function getOrCreateRoom(slug: string): Promise<RoomRecord> {
  const existing = await getRoom(slug);
  if (existing) return existing;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('rooms')
    .insert([{ slug, content: '' }])
    .select('id, slug, pin_hash, content, created_at, updated_at, last_seen_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      const raced = await getRoom(slug);
      if (raced) return raced;
    }
    throw error;
  }

  return data as RoomRecord;
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

/**
 * Deletes storage objects first, then the row. The DB cascade removes
 * attachment rows but knows nothing about the storage bucket, so doing it in
 * this order is what keeps the bucket from accumulating orphans.
 */
export async function deleteRoomCascade(roomId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: attachments } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('room_id', roomId);

  const paths = (attachments ?? []).map((a) => a.storage_path).filter(Boolean);
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths);
    if (error) console.error('[clipsync] failed to remove storage objects', error);
  }

  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) throw error;
}
