/**
 * Full row as stored. Server-side only — neither `pin_hash` nor
 * `owner_secret_hash` may ever cross to the client.
 */
export interface RoomRecord {
  id: string;
  slug: string;
  pin_hash: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  /** sha256 of the owner capability. NULL for rooms created before ownership. */
  owner_secret_hash: string | null;
  /** Bumped to revoke every owner cookie issued for this room. */
  owner_version: number;
  /**
   * Where this room is in its deletion lifecycle. Only `active` rooms are
   * readable; everything else is reported to callers as a 404.
   */
  lifecycle_state: RoomLifecycleState;
  /**
   * When the room became available to a deletion worker: the moment deletion
   * was requested, then the moment of each claim. It is both the queue order
   * and the worker's visibility timeout, which is what stops a second worker
   * from taking a room off the first one.
   */
  deletion_requested_at: string | null;
  /** How many times the worker has tried and failed to finish the deletion. */
  deletion_attempts: number;
  /** Stable ClipSync error code from the last failure. Never a provider message. */
  deletion_error_code: string | null;
}

/**
 * The deletion state machine.
 *
 * `deletion_pending` exists because deletion spans two systems that cannot be
 * committed together: the metadata in Postgres and the objects in Storage.
 * Whichever is destroyed first, a crash in between leaves the other stranded —
 * and the previous implementation destroyed the metadata first, which is the
 * unrecoverable order: the row is the only record of which objects belonged to
 * the room, so losing it turns every one of those images into an orphan nothing
 * can ever attribute or retry.
 *
 * Marking intent first inverts that. The row survives until the objects are
 * actually gone, so a failure is resumable, and the room is already invisible
 * to every reader from the instant the request lands.
 */
export type RoomLifecycleState =
  | 'active'
  | 'deletion_pending'
  | 'deleting'
  | 'deleted'
  | 'deletion_failed';

/**
 * What a caller is allowed to do, as reported to the client. Booleans only:
 * nothing here can be replayed as proof of anything.
 */
export interface RoomCapabilities {
  canManage: boolean;
  canDeleteEvidence: boolean;
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
