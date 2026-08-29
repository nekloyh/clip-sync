/**
 * Deciding whether a database error means "migration 003 has not run".
 *
 * This lives in its own `.mjs` module, apart from the rest of `src/lib`, for
 * one reason: `scripts/verify-supabase.mjs` has to exercise *this* function
 * against a real hosted project. A script that reimplemented the rules would
 * only ever prove the copy correct, which is worthless — the whole risk being
 * covered here is that hosted PostgREST words things differently than the local
 * stack does. One definition, imported by both, or the check means nothing.
 *
 * Every code and phrase below was read off a live PostgREST (14.13), not
 * recalled. See `npm run verify:supabase`, which re-derives them on demand.
 */

/** The columns migration 003 adds. */
export const OWNER_COLUMNS = ['owner_secret_hash', 'owner_version'];

/**
 * The room columns migration 004 adds.
 *
 * Same tolerance, same reason, one release later: deploy order is supposed to
 * be migration-first, and "supposed to" is still not a safety property. A room
 * read that selects `lifecycle_state` against a database that has not run 004
 * fails the entire query, which would take down reading rooms - a path that has
 * nothing to do with deletion.
 */
export const LIFECYCLE_COLUMNS = ['lifecycle_state', 'deletion_requested_at', 'deletion_attempts'];

/**
 * Authoritative "a column is missing" codes.
 *
 *   42703     Postgres `undefined_column`, returned for a SELECT naming a
 *             column that is not there.
 *   PGRST204  PostgREST's own code for a write whose payload names a column
 *             absent from its schema cache. Different path, different code,
 *             same cause — and the reason a code-only check on 42703 misses
 *             every INSERT and UPDATE.
 */
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);

/**
 * Wording that means "missing", used only as a fallback if a future PostgREST
 * changes its codes. Deliberately narrow: it must say the column is *absent*,
 * not merely mention it.
 */
const MISSING_PHRASE = /does not exist|could not find|schema cache|unknown column|no such column/i;

/**
 * True when `error` means the owner columns are not in the database.
 *
 * The negative cases matter more than the positive ones here. A check-constraint
 * violation (23514) carries `rooms_owner_version_positive` in its message, and a
 * not-null violation (23502) carries `owner_version` — so a rule that merely
 * looked for the column name would read an ordinary constraint failure as a
 * missing migration and drop a perfectly healthy deployment into degraded mode,
 * demoting every owner at once. Requiring either an authoritative code or an
 * explicit statement of absence is what keeps those apart.
 *
 * @param {{ code?: unknown, message?: unknown } | null | undefined} error
 * @returns {boolean}
 */
export function isMissingOwnerColumn(error) {
  return isMissingColumn(error, OWNER_COLUMNS);
}

/**
 * True when `error` means migration 004's room columns are not there.
 *
 * @param {{ code?: unknown, message?: unknown } | null | undefined} error
 * @returns {boolean}
 */
export function isMissingLifecycleColumn(error) {
  return isMissingColumn(error, LIFECYCLE_COLUMNS);
}

/**
 * The shared rule, parameterised by which columns count.
 *
 * @param {{ code?: unknown, message?: unknown } | null | undefined} error
 * @param {readonly string[]} columns
 * @returns {boolean}
 */
export function isMissingColumn(error, columns) {
  if (!error || typeof error !== 'object') return false;

  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';
  const namesOurColumn = columns.some((column) => message.includes(column));

  if (MISSING_COLUMN_CODES.has(code)) {
    // The code already says a column is missing. Insist it is one of ours, so
    // an unrelated schema problem surfaces as itself instead of being blamed
    // on our migration forever. An empty message leaves nothing to check, and
    // an empty message on one of these queries can only be about our columns.
    return namesOurColumn || message === '';
  }

  return namesOurColumn && MISSING_PHRASE.test(message);
}

/**
 * Which family of columns a missing-column error is about.
 *
 * `getRoom` walks a list of progressively narrower column sets, and needs to
 * know *which* narrower set to jump to rather than trying each in turn: with
 * three sets, stepping one at a time costs a guaranteed-to-fail extra query
 * every time the owner columns are the missing ones.
 *
 * The message decides, because it names the column. When an authoritative code
 * arrives with no usable message, the answer is 'owner' - the widest fallback,
 * the only one guaranteed to succeed. Guessing 'lifecycle' there would risk a
 * second failed query for no benefit.
 *
 * @param {{ code?: unknown, message?: unknown } | null | undefined} error
 * @returns {'owner' | 'lifecycle' | null}
 */
export function missingColumnFamily(error) {
  if (!isMissingColumn(error, [...OWNER_COLUMNS, ...LIFECYCLE_COLUMNS])) return null;

  const message = error && typeof error.message === 'string' ? error.message : '';
  if (LIFECYCLE_COLUMNS.some((column) => message.includes(column))) {
    return OWNER_COLUMNS.some((column) => message.includes(column)) ? 'owner' : 'lifecycle';
  }
  return 'owner';
}

/**
 * The same failure, rewritten as something an operator can act on. Returns the
 * original error untouched when it is not a missing-column failure.
 *
 * @param {{ code?: unknown, message?: unknown }} error
 * @returns {unknown}
 */
export function describeSchemaError(error) {
  const owner = isMissingOwnerColumn(error);
  const lifecycle = isMissingLifecycleColumn(error);
  if (!owner && !lifecycle) return error;

  const detail =
    error && typeof error.message === 'string' ? error.message : 'undefined column';

  // An empty message satisfies both checks, so name both migrations rather than
  // send an operator to the wrong file with confident-sounding precision.
  const migration = owner
    ? 'supabase/migrations/003_room_owner.sql'
    : 'supabase/migrations/004_pilot_readiness.sql';

  return new Error(
    'The `rooms` table is missing a column this build requires. ' +
      `Run ${migration} before deploying this version. ` +
      `Postgres said: ${detail}`
  );
}
