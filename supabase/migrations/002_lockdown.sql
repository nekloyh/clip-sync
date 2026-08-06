-- ClipSync access lockdown.
--
-- Why this exists: NEXT_PUBLIC_SUPABASE_ANON_KEY ships inside the browser
-- bundle, so it is public knowledge. The original schema enabled RLS and then
-- granted every operation with `using (true)`, which meant anyone holding that
-- public key could run
--     select * from rooms           -- every room's content and pin_hash
--     delete from rooms             -- wipe the database
-- without knowing a single slug.
--
-- The app does not need table access from the browser at all: all reads and
-- writes go through Next.js route handlers using the service-role key, and
-- Realtime is used only for Broadcast + Presence, neither of which touches a
-- table. So the correct posture is zero privileges for anon/authenticated.
--
-- Safe to run on an existing database, and safe to re-run.

-- 1. Drop the permissive policies.
drop policy if exists "Allow public read access to rooms"    on public.rooms;
drop policy if exists "Allow public insert access to rooms"  on public.rooms;
drop policy if exists "Allow public update access to rooms"  on public.rooms;
drop policy if exists "Allow public delete access to rooms"  on public.rooms;

drop policy if exists "Allow public select attachments" on public.attachments;
drop policy if exists "Allow public insert attachments" on public.attachments;
drop policy if exists "Allow public delete attachments" on public.attachments;

-- 2. Keep RLS on. With no policies, every non-service role is denied by
--    default; service_role bypasses RLS entirely.
alter table public.rooms       enable row level security;
alter table public.attachments enable row level security;
alter table public.rooms       force row level security;
alter table public.attachments force row level security;

-- 3. Revoke the table grants themselves, so the failure is a hard permission
--    error rather than an empty result set.
revoke all on public.rooms       from anon, authenticated;
revoke all on public.attachments from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;

-- 4. Remove the tables from the Realtime publication.
--    The client subscribes to Broadcast and Presence only; leaving the tables
--    published would stream row changes (including pin_hash) to any anon
--    listener the moment table access were ever restored.
do $$
begin
  alter publication supabase_realtime drop table public.rooms;
exception when others then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime drop table public.attachments;
exception when others then
  null;
end $$;

-- 5. Storage: the `clipsync-attachments` bucket must be PRIVATE.
--    Attachments are streamed through /api/rooms/[slug]/attachments/[id],
--    which enforces the room's PIN. A public bucket would leave every image in
--    a locked room readable by URL.
update storage.buckets set public = false where id = 'clipsync-attachments';

drop policy if exists "Allow public upload and read" on storage.objects;
drop policy if exists "Allow public read"            on storage.objects;
drop policy if exists "Allow public upload"          on storage.objects;
