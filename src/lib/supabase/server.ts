import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseServiceRoleKey } from '../env';

/**
 * Service-role client. This is the *only* way the app touches the database —
 * the browser's anon key has no table privileges at all (see migration 002),
 * so every read and write goes through a route handler that can authorize it.
 *
 * No placeholder fallbacks: a missing variable throws here rather than
 * producing an opaque Supabase error later.
 */
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Next patches global fetch and caches GETs in its Data Cache. PostgREST
    // reads go out as GETs, so without this a query can be answered from a
    // cache instead of the database — which is never what this app wants, and
    // which silently broke the schema health probe: it kept reporting `ok`
    // from a cached response after the owner columns had been dropped.
    //
    // Route-level `dynamic = 'force-dynamic'` does not cover it; that governs
    // the route's own rendering, not the fetches it makes. Opting out here
    // makes it a property of the client rather than something every future
    // caller has to remember.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}
