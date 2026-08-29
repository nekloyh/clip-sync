import { describe, it, expect, vi } from 'vitest';
import { buildLogLine, LOG_FIELDS, log, setLogSink, requestIdFrom, classifyError } from './log';
import { ErrorCode, providerCodeOf } from './errors';

/**
 * The redaction tests.
 *
 * They assert against `buildLogLine` rather than scraping console output on
 * purpose: a test that greps stdout passes for the wrong reason the moment the
 * transport changes, and would keep passing if the allowlist were removed and
 * the console happened to be quiet.
 *
 * What is being pinned is not "these particular field names are stripped" but
 * "a field nobody allowlisted cannot appear". That distinction is the whole
 * design — a denylist has to be renewed every time somebody adds a field, and
 * the day a handler logs `{ body }` for a quick debug, no rule fires.
 */

/** Everything a log line must never carry, in the shapes it would arrive in. */
const FORBIDDEN = {
  content: 'khách hàng: nguyễn văn a, thẻ 4111 1111 1111 1111',
  pin: '4321',
  pinHash: 'scrypt$32768$8$1$AAAA$BBBB',
  pin_hash: 'scrypt$32768$8$1$AAAA$BBBB',
  cookie: 'cs_owner=quiet-fox.1.999.SECRET.SIG',
  cookies: 'cs_room_quiet-fox=abc',
  authorization: 'Bearer super-secret-cron-token',
  token: 'quiet-fox.1.9999999999999.rawsecret.signature',
  ownerToken: 'quiet-fox.1.9999999999999.rawsecret.signature',
  slug: 'quiet-fox-k3n8xq2p',
  roomSlug: 'quiet-fox-k3n8xq2p',
  filename: 'acme-prod-db-credentials.png',
  ip: '203.0.113.42',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)',
  fragment: '#key=aGVsbG8td29ybGQtc2VjcmV0',
  storagePath: 'b3f1c2d4-0000-4000-8000-000000000000/abc.png',
  body: { content: 'secret text' },
  error: new Error('duplicate key value violates unique constraint "rooms_slug_key"'),
};

describe('log field allowlist', () => {
  it('keeps every allowlisted field', () => {
    const line = buildLogLine('info', {
      event: 'room.created',
      requestId: 'req-1234abcd',
      route: 'POST /api/rooms',
      status: 200,
      outcome: 'success',
      errorCode: ErrorCode.NOT_FOUND,
      providerCode: '42703',
      durationMs: 12,
      roomRef: 'a1b2c3d4e5f60718',
      actor: 'owner',
      policy: 'create_room',
      subject: 'room_created',
      degraded: false,
      deletedRooms: 3,
    });

    expect(line.event).toBe('room.created');
    expect(line.roomRef).toBe('a1b2c3d4e5f60718');
    expect(line.deletedRooms).toBe(3);
    expect(line.level).toBe('info');
    expect(typeof line.timestamp).toBe('string');
  });

  it('drops every forbidden field, whatever it is called', () => {
    const line = buildLogLine('error', {
      event: 'room.saved',
      ...FORBIDDEN,
    } as never);

    for (const key of Object.keys(FORBIDDEN)) {
      expect(line).not.toHaveProperty(key);
    }
    expect(Object.keys(line)).toEqual(['timestamp', 'level', 'event']);
  });

  it('leaks no forbidden value through any other field', () => {
    // Stronger than the key check: a field could be renamed on its way in.
    const serialized = JSON.stringify(
      buildLogLine('error', { event: 'room.saved', ...FORBIDDEN } as never)
    );

    for (const value of Object.values(FORBIDDEN)) {
      if (typeof value !== 'string') continue;
      expect(serialized).not.toContain(value);
    }
  });

  it('never carries a room slug, even under an allowlisted name', () => {
    // The slug is the surprising one. It looks like an identifier, but for a
    // room with no PIN the URL *is* the credential, so a slug in a log line is
    // a password in a log line.
    expect(LOG_FIELDS).not.toContain('slug');
    expect(LOG_FIELDS).not.toContain('roomSlug');
    expect(LOG_FIELDS).not.toContain('filename');
    expect(LOG_FIELDS).not.toContain('ip');
    expect(LOG_FIELDS).not.toContain('userAgent');
  });
});

describe('log value constraints', () => {
  it('refuses an object in an allowlisted string field', () => {
    // An allowlisted key with an unconstrained value is only half a fence: a
    // whole database row arrives as a nested object under a benign name.
    const line = buildLogLine('info', {
      event: 'x',
      roomRef: { id: 'r1', content: 'secret' },
    } as never);

    expect(line).not.toHaveProperty('roomRef');
  });

  it('flattens newlines so a value cannot forge a second log line', () => {
    const line = buildLogLine('info', {
      event: 'x',
      route: 'GET /a\n{"level":"info","event":"admin.granted"}',
    });

    expect(String(line.route)).not.toContain('\n');
  });

  it('caps a long string rather than emitting it whole', () => {
    const line = buildLogLine('info', { event: 'x', route: 'a'.repeat(5000) });
    expect(String(line.route).length).toBeLessThanOrEqual(200);
  });

  it('omits empty and non-finite values instead of writing null', () => {
    const line = buildLogLine('info', {
      event: 'x',
      route: '   ',
      durationMs: Number.NaN,
    });

    expect(line).not.toHaveProperty('route');
    expect(line).not.toHaveProperty('durationMs');
  });
});

describe('the sink', () => {
  it('emits through the configured sink', () => {
    const lines: Record<string, unknown>[] = [];
    const previous = setLogSink((_, line) => lines.push(line));

    log.info({ event: 'room.created', roomRef: 'abc123abc123abc1' });

    setLogSink(previous);
    expect(lines).toHaveLength(1);
    expect(lines[0].event).toBe('room.created');
  });

  it('never lets a broken sink fail the request that logged', () => {
    const previous = setLogSink(() => {
      throw new Error('shipper is down');
    });

    expect(() => log.error({ event: 'x' })).not.toThrow();
    setLogSink(previous);
  });
});

describe('request correlation', () => {
  it('reuses a well-formed inbound request id', () => {
    const id = requestIdFrom(new Headers({ 'x-request-id': 'abc123-def456' }));
    expect(id).toBe('abc123-def456');
  });

  it('refuses an inbound id that could forge a log line', () => {
    // The header is attacker-controlled. An unvalidated one is a free field in
    // every line this request produces. `Headers` itself rejects a raw newline,
    // so the value is injected the way a non-conforming proxy would deliver it.
    const hostile = { get: () => 'ok\r\n{"level":"info","event":"admin.granted"}' };

    const id = requestIdFrom(hostile);
    expect(id).not.toContain('\n');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses an id that is too long or oddly shaped', () => {
    expect(requestIdFrom({ get: () => 'x'.repeat(200) })).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFrom({ get: () => 'has spaces' })).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFrom({ get: () => 'short' })).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates one when there is no inbound header', () => {
    expect(requestIdFrom(new Headers())).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error classification', () => {
  it('keeps the provider code and discards everything else', () => {
    const supabaseError = {
      code: '42703',
      message: 'column rooms.owner_secret_hash does not exist',
      details: 'Perhaps you meant to reference the column "rooms.owner_version".',
      hint: 'the value was 4321',
    };

    const classified = classifyError(supabaseError, ErrorCode.DB_ERROR);

    expect(classified).toEqual({ errorCode: 'db_error', providerCode: '42703' });
    // The message, the details and the hint stop here. `hint` in particular
    // reads like help and is frequently a verbatim echo of the failing value.
    expect(JSON.stringify(classified)).not.toContain('owner_secret_hash');
    expect(JSON.stringify(classified)).not.toContain('4321');
  });

  it('refuses a "code" that is really a sentence', () => {
    expect(providerCodeOf({ code: 'could not find column rooms.pin_hash' })).toBeUndefined();
    expect(providerCodeOf({ code: 'PGRST204' })).toBe('PGRST204');
  });

  it('falls back to the given code for a plain thrown error', () => {
    expect(classifyError(new Error('boom'), ErrorCode.INTERNAL).errorCode).toBe('internal');
  });
});
