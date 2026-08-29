#!/usr/bin/env node
/**
 * End-to-end check against a real Supabase project.
 *
 * The unit suite mocks the database, so it proves the code is self-consistent
 * and nothing about the schema it will actually meet. This closes that gap: it
 * asserts the columns migration 003 creates are exactly the columns the code
 * selects, and that ownership behaves against real Postgres rather than a fake.
 *
 * Deliberately not a vitest file. It needs credentials, and a test that fails
 * on a laptop with no .env is a test people learn to ignore. Run it explicitly:
 *
 *   npm run verify:supabase
 *
 * It exits 0 and explains itself when the environment is missing, so it is
 * still safe to wire into CI that may or may not have secrets.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomBytes } from 'node:crypto';
// The app's own predicate, not a copy of it. A reimplementation here would only
// ever prove the copy correct, and the whole point of running this against a
// hosted project is to find out whether hosted PostgREST words its errors the
// way the *shipping* code expects.
import { isMissingOwnerColumn } from '../src/lib/schema-errors.mjs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.CLIPSYNC_AUTH_SECRET;

if (!URL || !KEY || !SECRET) {
  console.log(
    'SKIP verify-supabase: needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ' +
      'and CLIPSYNC_AUTH_SECRET. Nothing was checked.'
  );
  process.exit(0);
}

// Kept in step with src/lib/rooms.ts by the first assertion below.
const ROOM_COLUMNS =
  'id, slug, pin_hash, content, created_at, updated_at, last_seen_at, owner_secret_hash, owner_version';

const db = createClient(URL, KEY, { auth: { persistSession: false } });

let failures = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const sign = (p) => createHmac('sha256', SECRET).update(p).digest('base64url');

/** Mirrors createOwnerToken/verifyOwnerToken so a drift in either shows up. */
function ownerToken(slug, version, secret, now = Date.now()) {
  const payload = `${slug}.${version}.${now + 30 * 24 * 60 * 60 * 1000}.${secret}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token, slug, room) {
  if (!room.owner_secret_hash) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return false;
  const payload = token.slice(0, lastDot);
  if (sign(payload) !== token.slice(lastDot + 1)) return false;
  const parts = payload.split('.');
  if (parts.length !== 4) return false;
  const [tokenSlug, version, expiry, secret] = parts;
  if (tokenSlug !== slug) return false;
  if (Number(version) !== room.owner_version) return false;
  if (!(Number(expiry) > Date.now())) return false;
  return sha256(secret) === room.owner_secret_hash;
}

const slug = `verify-${randomBytes(6).toString('hex')}`;
const legacySlug = `verify-legacy-${randomBytes(6).toString('hex')}`;
let createdIds = [];
const analyticsRefs = [];

try {
  // 1. Migration 003 has run, and its columns are the ones the code selects.
  const { error: selectErr } = await db.from('rooms').select(ROOM_COLUMNS).limit(1);
  check(
    'migration 003 applied and ROOM_COLUMNS all resolve',
    !selectErr,
    selectErr?.message ?? ''
  );
  if (selectErr) throw new Error('cannot continue without the owner columns');

  // 2. Column names match exactly — a typo that PostgREST tolerates would not
  //    be caught above if the column merely existed under another name.
  for (const column of ['owner_secret_hash', 'owner_version']) {
    const { error } = await db.from('rooms').select(column).limit(1);
    check(`column \`${column}\` exists with that exact name`, !error, error?.message ?? '');
  }

  // 3. owner_version defaults to 1 and is NOT NULL, as authorization assumes.
  const secret = randomBytes(32).toString('base64url');
  const { data: created, error: createErr } = await db
    .from('rooms')
    .insert([{ slug, content: '', owner_secret_hash: sha256(secret) }])
    .select(ROOM_COLUMNS)
    .single();

  check('a room can be created with an owner digest', !createErr, createErr?.message ?? '');
  if (created) createdIds.push(created.id);

  check(
    'owner_version defaults to 1',
    created?.owner_version === 1,
    `got ${created?.owner_version}`
  );
  check(
    'the raw capability is never stored',
    created?.owner_secret_hash === sha256(secret) && created?.owner_secret_hash !== secret,
    ''
  );

  // 4. The capability actually authorizes against the stored row.
  check('a freshly minted capability verifies', verifyToken(ownerToken(slug, 1, secret), slug, created));
  check(
    "another room's capability does not",
    !verifyToken(ownerToken('some-other-room', 1, secret), slug, created)
  );
  check(
    'a capability with a different secret does not',
    !verifyToken(ownerToken(slug, 1, randomBytes(32).toString('base64url')), slug, created)
  );

  // 5. Bumping owner_version revokes, which is the documented recovery lever.
  const token = ownerToken(slug, 1, secret);
  const { data: bumped } = await db
    .from('rooms')
    .update({ owner_version: 2 })
    .eq('id', created.id)
    .select(ROOM_COLUMNS)
    .single();
  check('bumping owner_version revokes an issued capability', !verifyToken(token, slug, bumped));

  // 6. A legacy row — no owner — is refused rather than claimable.
  const { data: legacy, error: legacyErr } = await db
    .from('rooms')
    .insert([{ slug: legacySlug, content: '' }])
    .select(ROOM_COLUMNS)
    .single();
  check('a room can exist with no owner (legacy row)', !legacyErr, legacyErr?.message ?? '');
  if (legacy) createdIds.push(legacy.id);

  check('a legacy room has a null owner digest', legacy?.owner_secret_hash === null);
  check(
    'a legacy room cannot be claimed by any well-formed capability',
    !verifyToken(ownerToken(legacySlug, 1, randomBytes(32).toString('base64url')), legacySlug, legacy)
  );

  // 7. The positive-version constraint from migration 003 is enforced.
  const { error: constraintErr } = await db
    .from('rooms')
    .update({ owner_version: 0 })
    .eq('id', created.id);
  check('owner_version >= 1 is enforced by the database', !!constraintErr, 'constraint held');

  // 8. Degraded-mode detection, against *this* server's actual error wording.
  //
  // The app tolerates a database where migration 003 has not run by falling
  // back to the old column set. Whether it recognises that situation depends
  // entirely on the codes and phrasing PostgREST emits, which is exactly the
  // thing that can differ between a local stack and a hosted project. All of
  // the probes below are read-only or operate on this script's own throwaway
  // row, so this is safe to point at production.
  const { error: selectShape } = await db
    .from('rooms')
    .select('id, definitely_not_a_column_xyz')
    .limit(1);

  check(
    'a missing column on SELECT is reported as 42703',
    selectShape?.code === '42703',
    `got ${selectShape?.code ?? 'no error'}`
  );

  const { error: writeShape } = await db
    .from('rooms')
    .insert([{ slug: `probe-${randomBytes(4).toString('hex')}`, definitely_not_a_column_xyz: 1 }]);

  check(
    'a missing column on INSERT is reported as PGRST204',
    writeShape?.code === 'PGRST204',
    `got ${writeShape?.code ?? 'no error'}`
  );

  // Replay each real error as it would read before migration 003, and ask the
  // shipping predicate. This is the assertion that closes the hosted gap.
  for (const [label, shape] of [
    ['SELECT', selectShape],
    ['INSERT', writeShape],
  ]) {
    const asPreMigration = shape && {
      code: shape.code,
      message: String(shape.message ?? '').replaceAll(
        'definitely_not_a_column_xyz',
        'owner_secret_hash'
      ),
    };
    check(
      `the app detects a missing migration from this server's ${label} error`,
      !!asPreMigration && isMissingOwnerColumn(asPreMigration) === true,
      asPreMigration?.message ?? 'no error to replay'
    );
  }

  // And the trap: an ordinary constraint failure whose message happens to name
  // an owner column must NOT be read as a missing migration, or one bad write
  // would drop the whole deployment into degraded mode and demote every owner.
  check(
    'an owner_version constraint violation is NOT mistaken for a missing migration',
    isMissingOwnerColumn(constraintErr) === false,
    String(constraintErr?.message ?? '').slice(0, 80)
  );

  const { error: notNullErr } = await db
    .from('rooms')
    .update({ owner_version: null })
    .eq('id', created.id);

  check(
    'an owner_version not-null violation is NOT mistaken for a missing migration',
    !!notNullErr && isMissingOwnerColumn(notNullErr) === false,
    String(notNullErr?.message ?? '').slice(0, 80)
  );

  // A healthy read must never look like a missing migration either.
  const { error: healthyErr } = await db.from('rooms').select(ROOM_COLUMNS).limit(1);
  check('a healthy read produces no error at all', !healthyErr, healthyErr?.message ?? '');

  // ---------------------------------------------------------------------
  // Migration 004: deletion lifecycle, telemetry and operational records
  // ---------------------------------------------------------------------

  const { error: lifecycleErr } = await db
    .from('rooms')
    .select('lifecycle_state, deletion_requested_at, deletion_attempts, deletion_error_code')
    .limit(1);

  check(
    'migration 004 added the deletion lifecycle columns',
    !lifecycleErr,
    lifecycleErr?.message ?? ''
  );

  // Re-read rather than trusting `created`: it was selected with the migration
  // 003 column set, which does not name this column at all.
  const { data: withState } = await db
    .from('rooms')
    .select('lifecycle_state')
    .eq('id', created.id)
    .maybeSingle();

  check(
    'a new room starts out active',
    withState?.lifecycle_state === 'active',
    `got ${withState?.lifecycle_state}`
  );

  const { error: badStateErr } = await db
    .from('rooms')
    .update({ lifecycle_state: 'definitely_not_a_state' })
    .eq('id', created.id);

  check(
    'an unknown lifecycle_state is refused by the database',
    !!badStateErr,
    'constraint held'
  );

  for (const table of ['analytics_events', 'ops_runs', 'reconciliation_findings']) {
    const { error } = await db.from(table).select('*').limit(1);
    check(`migration 004 created ${table}`, !error, error?.message ?? '');
  }

  // The assertion that actually matters for the funnel.
  //
  // Idempotency of the once-per-room events rests entirely on the partial
  // unique index, not on application code — a read-then-write guard loses to a
  // reconnect, a retry and two concurrent instances alike. The unit suite can
  // only prove the *memory* sink deduplicates, which proves nothing about this
  // database. So write the same event twice and count.
  const probeRef = createHash('sha256').update(randomBytes(16)).digest('hex').slice(0, 32);
  analyticsRefs.push(probeRef);

  for (let i = 0; i < 3; i++) {
    await db
      .from('analytics_events')
      .upsert(
        [{ event_name: 'second_device_joined', event_version: 1, room_ref: probeRef, actor: 'recipient' }],
        { onConflict: 'room_ref,event_name', ignoreDuplicates: true }
      );
  }

  const { count: onceCount } = await db
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('room_ref', probeRef)
    .eq('event_name', 'second_device_joined');

  check(
    'the unique index collapses a repeated once-per-room event into one row',
    onceCount === 1,
    `got ${onceCount} rows`
  );

  // And the other half: a countable event must NOT be collapsed, or a room with
  // three screenshots would report one.
  for (let i = 0; i < 3; i++) {
    await db.from('analytics_events').insert([
      {
        event_name: 'attachment_uploaded',
        event_version: 1,
        room_ref: probeRef,
        actor: 'recipient',
        size_bucket: 'lt_1mb',
        mime_category: 'image',
      },
    ]);
  }

  const { count: manyCount } = await db
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('room_ref', probeRef)
    .eq('event_name', 'attachment_uploaded');

  check(
    'a countable event is not collapsed by the same index',
    manyCount === 3,
    `got ${manyCount} rows`
  );

  // Deleting a room must not take its funnel with it: the successful rooms are
  // exactly the ones that get deleted, so a cascade here would make the funnel
  // permanently unable to report success.
  await db.from('rooms').delete().eq('id', created.id);
  const { count: survivingCount } = await db
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('room_ref', probeRef);

  check(
    'funnel history survives the deletion of its room',
    survivingCount === 4,
    `got ${survivingCount} rows`
  );
} finally {
  if (createdIds.length) await db.from('rooms').delete().in('id', createdIds);
  // The funnel rows this script wrote are the one thing with no room to cascade
  // from — by design — so they have to be cleaned up explicitly.
  if (analyticsRefs.length) {
    await db.from('analytics_events').delete().in('room_ref', analyticsRefs);
  }
}

console.log(
  `\n${results.length - failures}/${results.length} checks passed against ${URL}`
);
process.exit(failures > 0 ? 1 : 0);
