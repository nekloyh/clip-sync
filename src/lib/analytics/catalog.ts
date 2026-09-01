/**
 * The event dictionary. This file is the contract; the table is its storage.
 *
 * Written as data rather than prose so the privacy rules are enforced by the
 * same thing that documents them: {@link buildEventRow} projects an event onto
 * {@link EVENT_FIELDS} and drops everything else, so a future caller who passes
 * `{ slug }` or `{ filename }` produces a row without them rather than a
 * violation nobody notices until an audit.
 *
 * See docs/ANALYTICS.md for the field-by-field rationale and the retention
 * policy. The short version:
 *
 *   RECORDED   event name and version, a pseudonymous room ref, an actor class,
 *              a size bucket, a coarse MIME category, a timestamp, and a
 *              success/failure code.
 *   NEVER      room content or ciphertext, PIN or PIN hash, owner or access
 *              capability, room slug or any URL locator, filename, raw IP, raw
 *              user agent, URL fragment or decryption key.
 *
 * Versioning: `EVENT_VERSION` is stamped on every row. Changing what a field
 * means - not adding a new one - means bumping it, so a query can exclude rows
 * written under the old meaning instead of silently averaging two definitions
 * together.
 */

export const EVENT_VERSION = 1;

export const EVENTS = {
  /** A room row was created. Actor is always the owner. */
  ROOM_CREATED: 'room_created',
  /**
   * A second participant reached the room.
   *
   * Named for the funnel question it answers - "did the handoff have another
   * end?" - and recorded once per room for its lifetime, not once per
   * connection. A phone that wakes, reconnects and re-reads the room five times
   * is one recipient, and counting it five times would inflate the single
   * number this pilot exists to measure.
   */
  SECOND_DEVICE_JOINED: 'second_device_joined',
  /** The room first held content: a non-empty save, or a first attachment. */
  FIRST_CONTENT_TRANSFERRED: 'first_content_transferred',
  /** One attachment stored successfully. Repeatable by design. */
  ATTACHMENT_UPLOADED: 'attachment_uploaded',
  /** The owner deliberately closed the room. */
  ROOM_COMPLETED: 'room_completed',
  /** A room's data is gone. Emitted when deletion finishes, not when requested. */
  ROOM_DELETED: 'room_deleted',
  /** The 7-day TTL claimed the room rather than a person. */
  ROOM_EXPIRED: 'room_expired',
  /**
   * Cleanup could not finish. Two shapes, both countable: one per room the
   * worker failed to delete (carries `room_ref`), and one for a run that
   * collapsed before reaching any room at all (no `room_ref`, because no
   * room is what that one is about). See docs/ANALYTICS.md §2.
   */
  CLEANUP_FAILED: 'cleanup_failed',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Events that describe a state a room reaches once.
 *
 * Recorded with `on conflict do nothing` against a unique index on
 * `(room_ref, event_name)`, which is what makes them idempotent under the three
 * things that actually cause duplicates: a client reconnecting, a request being
 * retried, and two serverless instances handling concurrent requests for the
 * same room. A read-then-write guard in the application would lose all three
 * races; the constraint cannot.
 *
 * `attachment_uploaded`, `room_deleted` and `cleanup_failed` are deliberately
 * absent - each is a countable occurrence, not a stage.
 */
export const ONCE_PER_ROOM: ReadonlySet<EventName> = new Set([
  EVENTS.ROOM_CREATED,
  EVENTS.SECOND_DEVICE_JOINED,
  EVENTS.FIRST_CONTENT_TRANSFERRED,
  EVENTS.ROOM_COMPLETED,
  EVENTS.ROOM_EXPIRED,
]);

/** Who caused the event, as a class. Never a capability, never an identity. */
export type Actor = 'owner' | 'recipient' | 'system';

/**
 * Size as a bucket.
 *
 * An exact byte count is a fingerprint: paired with a timestamp it identifies a
 * specific file well enough to confirm a guess about which one it was. Buckets
 * answer the only question the pilot has - "are people sending screenshots or
 * multi-megabyte photos" - and answer nothing else.
 */
export type SizeBucket = 'lt_64kb' | 'lt_256kb' | 'lt_1mb' | 'lt_5mb' | 'gte_5mb';

export function sizeBucket(bytes: number): SizeBucket {
  if (!Number.isFinite(bytes) || bytes < 64 * 1024) return 'lt_64kb';
  if (bytes < 256 * 1024) return 'lt_256kb';
  if (bytes < 1024 * 1024) return 'lt_1mb';
  if (bytes < 5 * 1024 * 1024) return 'lt_5mb';
  return 'gte_5mb';
}

/**
 * The top-level MIME type only.
 *
 * `image/png` becomes `image`. The subtype is dropped because it is a step
 * toward identifying the file and answers no question the funnel asks, and
 * anything unrecognised becomes `other` rather than passing through - a
 * pass-through would let an attacker-supplied Content-Type reach the table.
 */
export type MimeCategory = 'image' | 'text' | 'other';

export function mimeCategory(mime: string | null | undefined): MimeCategory {
  if (typeof mime !== 'string') return 'other';
  const top = mime.split('/')[0]?.trim().toLowerCase();
  if (top === 'image') return 'image';
  if (top === 'text') return 'text';
  return 'other';
}

/**
 * Every column an event may fill. The allowlist, and the reason a stray field
 * cannot be persisted even if a caller passes one.
 */
export const EVENT_FIELDS = [
  'event_name',
  'event_version',
  'room_ref',
  'actor',
  'size_bucket',
  'mime_category',
  'outcome',
  'error_code',
] as const;

export type EventField = (typeof EVENT_FIELDS)[number];

/** What a call site hands in. Deliberately small. */
export interface AnalyticsEvent {
  name: EventName;
  /** HMAC of the room UUID. Absent for events with no room (none today). */
  roomRef?: string;
  actor?: Actor;
  sizeBucket?: SizeBucket;
  mimeCategory?: MimeCategory;
  outcome?: 'success' | 'failure';
  /** A stable code from src/lib/errors.ts. Never a provider message. */
  errorCode?: string;
}

const ACTORS: ReadonlySet<string> = new Set(['owner', 'recipient', 'system']);
const BUCKETS: ReadonlySet<string> = new Set([
  'lt_64kb',
  'lt_256kb',
  'lt_1mb',
  'lt_5mb',
  'gte_5mb',
]);
const CATEGORIES: ReadonlySet<string> = new Set(['image', 'text', 'other']);
const EVENT_NAMES: ReadonlySet<string> = new Set(Object.values(EVENTS));

/**
 * The event as a row, with the allowlist applied.
 *
 * Values are validated against closed sets rather than merely copied. An
 * allowlisted key whose value is unconstrained is only half a fence - the
 * shortest path from here to room content in the analytics table is an
 * `actor` field that accepts any string. Anything unrecognised is dropped, not
 * coerced, so a bad value costs one dimension and never becomes a payload.
 *
 * Returns null for an unknown event name: an event that is not in the catalog
 * has no documented meaning, and writing it would produce a column of numbers
 * nobody can interpret.
 */
export function buildEventRow(event: AnalyticsEvent): Record<string, unknown> | null {
  if (!EVENT_NAMES.has(event.name)) return null;

  const row: Record<string, unknown> = {
    event_name: event.name,
    event_version: EVENT_VERSION,
    outcome: event.outcome === 'failure' ? 'failure' : 'success',
  };

  if (typeof event.roomRef === 'string' && /^[0-9a-f]{16,64}$/.test(event.roomRef)) {
    row.room_ref = event.roomRef;
  }
  if (event.actor && ACTORS.has(event.actor)) row.actor = event.actor;
  if (event.sizeBucket && BUCKETS.has(event.sizeBucket)) row.size_bucket = event.sizeBucket;
  if (event.mimeCategory && CATEGORIES.has(event.mimeCategory)) {
    row.mime_category = event.mimeCategory;
  }
  if (typeof event.errorCode === 'string' && /^[a-z0-9_]{1,40}$/.test(event.errorCode)) {
    row.error_code = event.errorCode;
  }

  return row;
}
