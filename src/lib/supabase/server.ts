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
  });
}
