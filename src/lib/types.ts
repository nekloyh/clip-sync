/** Full row as stored. Server-side only — `pin_hash` must never cross to the client. */
export interface RoomRecord {
  id: string;
  slug: string;
  pin_hash: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

/** What the client is allowed to see: whether a PIN exists, never its hash. */
export interface Room {
  id: string;
  slug: string;
  hasPin: boolean;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  room_id: string;
  filename: string;
  mime: string;
  size: number;
  created_at: string;
  /** Authenticated route, not a public storage URL. */
  url: string;
}

export interface SyncTextPayload {
  clientId: string;
  content: string;
  updated_at: string;
}

export type AttachmentBroadcast =
  | { clientId: string; action: 'add'; attachment: Attachment }
  | { clientId: string; action: 'delete'; attachmentId: string };

export interface PresenceUser {
  clientId: string;
  onlineAt: string;
}

export function toPublicRoom(record: RoomRecord): Room {
  return {
    id: record.id,
    slug: record.slug,
    hasPin: !!record.pin_hash,
    content: record.content || '',
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}
