/**
 * Kept as an alias for /api/health/ready.
 *
 * Uptime monitors and the README already point here, and a health endpoint that
 * starts 404ing is a false alarm at 3am - the expand step is to add the new
 * paths and leave this one answering. The status code and the `status` field,
 * which is all a monitor actually evaluates, are unchanged; `checks` now
 * reports four subsystems instead of one.
 *
 * Liveness is deliberately not what this returns. This endpoint has always
 * consulted the database, so anything watching it is watching readiness.
 */
export { GET } from './ready/route';

// Declared literally rather than re-exported: Next reads these at build time by
// static analysis, and a re-exported binding is invisible to it — it warns and
// silently falls back to the default runtime, which is not the one the readiness
// checks run under.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
