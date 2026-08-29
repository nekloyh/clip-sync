import { describe, it, expect } from 'vitest';
import {
  EVENTS,
  EVENT_FIELDS,
  EVENT_VERSION,
  ONCE_PER_ROOM,
  buildEventRow,
  sizeBucket,
  mimeCategory,
} from './catalog';

/**
 * The privacy tests for the funnel.
 *
 * `buildEventRow` is the only path from a call site to the analytics table, so
 * pinning it here pins every event. The tests are written against the *shape*
 * of the output rather than against a list of banned words, because the risk is
 * not that somebody deliberately logs a PIN — it is that somebody adds a field
 * in a hurry and nothing stops it.
 */

const ROOM_REF = 'a1b2c3d4e5f60718a1b2c3d4e5f60718';

/** Everything a call site might pass that must never reach a column. */
const FORBIDDEN = {
  slug: 'quiet-fox-k3n8xq2p',
  content: 'khách hàng: nguyễn văn a',
  pin: '4321',
  pinHash: 'scrypt$32768$8$1$AAAA$BBBB',
  filename: 'acme-prod-db-credentials.png',
  ip: '203.0.113.42',
  userAgent: 'Mozilla/5.0 (iPhone)',
  ownerToken: 'quiet-fox.1.999.rawsecret.sig',
  fragment: '#key=aGVsbG8',
  size: 4_193_112,
  mime: 'image/png',
  roomId: 'b3f1c2d4-0000-4000-8000-000000000000',
};

describe('the event row allowlist', () => {
  it('writes only allowlisted columns', () => {
    const row = buildEventRow({
      name: EVENTS.ATTACHMENT_UPLOADED,
      roomRef: ROOM_REF,
      actor: 'recipient',
      sizeBucket: 'lt_1mb',
      mimeCategory: 'image',
    })!;

    for (const key of Object.keys(row)) {
      expect(EVENT_FIELDS).toContain(key as never);
    }
  });

  it('drops every forbidden field a caller might pass', () => {
    const row = buildEventRow({
      name: EVENTS.ATTACHMENT_UPLOADED,
      roomRef: ROOM_REF,
      actor: 'owner',
      ...FORBIDDEN,
    } as never)!;

    for (const key of Object.keys(FORBIDDEN)) {
      expect(row).not.toHaveProperty(key);
    }

    const serialized = JSON.stringify(row);
    for (const value of Object.values(FORBIDDEN)) {
      if (typeof value !== 'string') continue;
      expect(serialized).not.toContain(value);
    }
  });

  it('has no column that could hold a locator, a filename or an address', () => {
    // The second half of the fence: even if the application layer were
    // bypassed, there is physically nowhere to put these.
    for (const forbidden of [
      'slug',
      'url',
      'locator',
      'filename',
      'content',
      'pin',
      'pin_hash',
      'ip',
      'user_agent',
      'token',
      'room_id',
    ]) {
      expect(EVENT_FIELDS).not.toContain(forbidden as never);
    }
  });

  it('stamps a version on every row', () => {
    const row = buildEventRow({ name: EVENTS.ROOM_CREATED, roomRef: ROOM_REF })!;
    expect(row.event_version).toBe(EVENT_VERSION);
  });

  it('refuses an event that is not in the catalog', () => {
    // An event with no documented meaning produces a column of numbers nobody
    // can interpret, so it is not written at all.
    expect(buildEventRow({ name: 'room_content_snapshot' } as never)).toBeNull();
  });
});

describe('value validation', () => {
  it('refuses an actor outside the closed set', () => {
    // The shortest path from here to room content in the analytics table is an
    // `actor` field that accepts any string.
    const row = buildEventRow({
      name: EVENTS.ROOM_CREATED,
      roomRef: ROOM_REF,
      actor: 'nguyễn văn a' as never,
    })!;

    expect(row).not.toHaveProperty('actor');
  });

  it('refuses a room ref that is not a hex digest', () => {
    // Which is what a raw slug or a raw UUID would look like arriving here.
    for (const bad of ['quiet-fox-k3n8xq2p', 'b3f1c2d4-0000-4000-8000-000000000000', '']) {
      expect(buildEventRow({ name: EVENTS.ROOM_CREATED, roomRef: bad })).not.toHaveProperty(
        'room_ref'
      );
    }
  });

  it('refuses a size bucket or MIME category it does not recognise', () => {
    const row = buildEventRow({
      name: EVENTS.ATTACHMENT_UPLOADED,
      roomRef: ROOM_REF,
      sizeBucket: '4193112 bytes' as never,
      mimeCategory: 'image/png' as never,
    })!;

    expect(row).not.toHaveProperty('size_bucket');
    expect(row).not.toHaveProperty('mime_category');
  });

  it('refuses an error code that is really a provider message', () => {
    const row = buildEventRow({
      name: EVENTS.CLEANUP_FAILED,
      roomRef: ROOM_REF,
      outcome: 'failure',
      errorCode: 'Bucket not found: clipsync-attachments/b3f1c2d4/x.png',
    })!;

    expect(row).not.toHaveProperty('error_code');
    expect(row.outcome).toBe('failure');
  });
});

describe('size buckets', () => {
  it('buckets rather than recording the byte count', () => {
    // An exact size plus a timestamp identifies a specific file well enough to
    // confirm a guess about which one it was.
    expect(sizeBucket(1024)).toBe('lt_64kb');
    expect(sizeBucket(200 * 1024)).toBe('lt_256kb');
    expect(sizeBucket(900 * 1024)).toBe('lt_1mb');
    expect(sizeBucket(4 * 1024 * 1024)).toBe('lt_5mb');
    expect(sizeBucket(6 * 1024 * 1024)).toBe('gte_5mb');
  });

  it('survives a nonsense size', () => {
    expect(sizeBucket(Number.NaN)).toBe('lt_64kb');
  });
});

describe('MIME categories', () => {
  it('keeps the top-level type and drops the subtype', () => {
    expect(mimeCategory('image/png')).toBe('image');
    expect(mimeCategory('image/svg+xml')).toBe('image');
    expect(mimeCategory('text/plain')).toBe('text');
  });

  it('maps anything unrecognised to `other` rather than passing it through', () => {
    // The declared content type is attacker-supplied; passing it through would
    // let it reach the table verbatim.
    expect(mimeCategory('application/x-secret-plan.pdf')).toBe('other');
    expect(mimeCategory(null)).toBe('other');
    expect(mimeCategory(undefined)).toBe('other');
    expect(mimeCategory(12 as never)).toBe('other');
  });
});

describe('the once-per-room set', () => {
  it('covers exactly the events that describe a stage, not an occurrence', () => {
    expect([...ONCE_PER_ROOM].sort()).toEqual(
      [
        'first_content_transferred',
        'room_completed',
        'room_created',
        'room_expired',
        'second_device_joined',
      ].sort()
    );
  });

  it('leaves countable occurrences out of it', () => {
    // Deduplicating these would undercount: a room with five attachments has
    // five uploads, and a cleanup that fails on three runs failed three times.
    expect(ONCE_PER_ROOM.has(EVENTS.ATTACHMENT_UPLOADED)).toBe(false);
    expect(ONCE_PER_ROOM.has(EVENTS.CLEANUP_FAILED)).toBe(false);
    expect(ONCE_PER_ROOM.has(EVENTS.ROOM_DELETED)).toBe(false);
  });
});
