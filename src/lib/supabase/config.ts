export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return false;
  if (!url.startsWith('http')) return false;
  if (url.includes('your-supabase-project') || url.includes('placeholder.supabase.co')) return false;

  return true;
}
