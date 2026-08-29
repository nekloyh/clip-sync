import { describe, it, expect } from 'vitest';
import { isMissingOwnerColumn, describeSchemaError } from './schema-errors.mjs';

/**
 * Every payload below was captured verbatim from a live PostgREST 14.13 — the
 * same server Supabase runs hosted — rather than written from memory. The
 * capture is reproducible on demand with `npm run verify:supabase`, which
 * re-derives them against whatever project it is pointed at.
 *
 * The negative cases are the important half. Two ordinary constraint failures
 * on `owner_version` carry the column name in their message, so a rule that
 * only looked for the name would read them as a missing migration and drop a
 * healthy deployment into degraded mode, demoting every owner at once.
 */

// --- observed: SELECT naming a column that is not there ---------------------
const SELECT_MISSING = {
  code: '42703',
  details: null,
  hint: null,
  message: 'column rooms.owner_secret_hash does not exist',
};

// --- observed: INSERT/UPDATE whose payload names an unknown column ----------
const WRITE_MISSING = {
  code: 'PGRST204',
  details: null,
  hint: null,
  message: "Could not find the 'owner_version' column of 'rooms' in the schema cache",
};

/**
 * --- observed: the SAME pre-003 INSERT, but with a stale schema cache --------
 *
 * Which code a write gets back depends on what PostgREST has cached. If the
 * cache never knew the column it rejects the payload itself (PGRST204, above);
 * if the cache still remembers a column that has since been dropped it forwards
 * the write and Postgres rejects it (42703, here). Same cause, two codes — the
 * reason detection keys on both rather than on whichever one happens to show up
 * in a given environment.
 */
const WRITE_MISSING_STALE_CACHE = {
  code: '42703',
  details: null,
  hint: null,
  message: 'column "owner_secret_hash" of relation "rooms" does not exist',
};

// --- observed: ordinary failures that merely MENTION an owner column --------
const CHECK_VIOLATION = {
  code: '23514',
  details: 'Failing row contains (…, deadbeef, 0).',
  hint: null,
  message: 'new row for relation "rooms" violates check constraint "rooms_owner_version_positive"',
};

const NOT_NULL_VIOLATION = {
  code: '23502',
  details: 'Failing row contains (…, deadbeef, null).',
  hint: null,
  message: 'null value in column "owner_version" of relation "rooms" violates not-null constraint',
};

const UNIQUE_VIOLATION = {
  code: '23505',
  details: 'Key (slug)=(shape-probe) already exists.',
  hint: null,
  message: 'duplicate key value violates unique constraint "rooms_slug_key"',
};

const BAD_TYPE = {
  code: '22P02',
  details: null,
  hint: null,
  message: 'invalid input syntax for type integer: "not-a-number"',
};

describe('recognising a missing migration 003', () => {
  it('recognises the SELECT shape (Postgres 42703)', () => {
    expect(isMissingOwnerColumn(SELECT_MISSING)).toBe(true);
  });

  it('recognises the write shape (PostgREST PGRST204)', () => {
    // A code-only check on 42703 misses every INSERT and UPDATE, because
    // PostgREST answers those from its own schema cache with its own code.
    expect(isMissingOwnerColumn(WRITE_MISSING)).toBe(true);
  });

  it('recognises the write shape when the schema cache is stale (42703)', () => {
    // Quoted column name and a different sentence shape than the SELECT error.
    expect(isMissingOwnerColumn(WRITE_MISSING_STALE_CACHE)).toBe(true);
    expect((describeSchemaError(WRITE_MISSING_STALE_CACHE) as Error).message).toMatch(
      /003_room_owner\.sql/
    );
  });

  it('recognises both owner columns by name', () => {
    for (const column of ['owner_secret_hash', 'owner_version']) {
      expect(
        isMissingOwnerColumn({ code: '42703', message: `column rooms.${column} does not exist` })
      ).toBe(true);
    }
  });

  it('accepts an authoritative code with no message at all', () => {
    // These queries name no columns but ours, so there is nothing else it
    // could be, and refusing here would strand the deployment.
    expect(isMissingOwnerColumn({ code: '42703' })).toBe(true);
    expect(isMissingOwnerColumn({ code: 'PGRST204', message: '' })).toBe(true);
  });

  it('still recognises it from wording alone if the codes ever change', () => {
    expect(
      isMissingOwnerColumn({ code: 'PGRST999', message: "Could not find 'owner_version'" })
    ).toBe(true);
    expect(isMissingOwnerColumn({ message: 'unknown column owner_secret_hash' })).toBe(true);
  });
});

describe('refusing to blame migration 003 for something else', () => {
  it('does not treat a check-constraint violation as a missing column', () => {
    // The message contains "rooms_owner_version_positive" — the trap.
    expect(CHECK_VIOLATION.message).toContain('owner_version');
    expect(isMissingOwnerColumn(CHECK_VIOLATION)).toBe(false);
  });

  it('does not treat a not-null violation as a missing column', () => {
    expect(NOT_NULL_VIOLATION.message).toContain('owner_version');
    expect(isMissingOwnerColumn(NOT_NULL_VIOLATION)).toBe(false);
  });

  it('leaves unrelated failures alone', () => {
    expect(isMissingOwnerColumn(UNIQUE_VIOLATION)).toBe(false);
    expect(isMissingOwnerColumn(BAD_TYPE)).toBe(false);
    expect(isMissingOwnerColumn({ code: '08006', message: 'connection failure' })).toBe(false);
    expect(isMissingOwnerColumn({ code: '42501', message: 'permission denied for table rooms' })).toBe(
      false
    );
  });

  it('does not degrade for a different column going missing', () => {
    // A base column disappearing is a real problem that deserves to surface as
    // itself, not to be silently absorbed as "run migration 003".
    expect(
      isMissingOwnerColumn({ code: '42703', message: 'column rooms.content does not exist' })
    ).toBe(false);
  });

  it('survives junk input without throwing', () => {
    for (const junk of [null, undefined, '', 0, [], { code: 42703 }, { message: null }]) {
      expect(isMissingOwnerColumn(junk as never)).toBe(false);
    }
  });
});

describe('describeSchemaError', () => {
  it('rewrites a missing-column failure into an instruction', () => {
    const described = describeSchemaError(SELECT_MISSING) as Error;

    expect(described).toBeInstanceOf(Error);
    expect(described.message).toMatch(/003_room_owner\.sql/);
    // Keeps what Postgres actually said, so the log is still diagnosable.
    expect(described.message).toContain('column rooms.owner_secret_hash does not exist');
  });

  it('rewrites the write shape too', () => {
    expect((describeSchemaError(WRITE_MISSING) as Error).message).toMatch(/003_room_owner\.sql/);
  });

  it('returns every other error untouched, by identity', () => {
    // Identity matters: callers re-throw this, and wrapping would lose the
    // PostgREST code that other branches switch on (23505 → slug taken).
    expect(describeSchemaError(UNIQUE_VIOLATION)).toBe(UNIQUE_VIOLATION);
    expect(describeSchemaError(CHECK_VIOLATION)).toBe(CHECK_VIOLATION);
  });
});
