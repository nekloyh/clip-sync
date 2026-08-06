-- ClipSync Initial Database Schema
--
-- Tables, indexes and TTL helper only. Access control lives in
-- 002_lockdown.sql: the browser never talks to Postgres directly, so no role
-- other than service_role gets any privilege here.

-- 1. Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- 2. Create Rooms table
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  pin_hash text null,
  content text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- 3. Create Attachments table
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  mime text not null,
  size integer not null,
  created_at timestamptz not null default now()
);

-- 4. Performance & Lookup Indexes
-- (no idx_rooms_slug: the UNIQUE constraint on slug already provides one)
create index if not exists idx_attachments_room_id on public.attachments(room_id);
create index if not exists idx_rooms_last_seen on public.rooms(last_seen_at);

-- 5. Auto-update updated_at timestamp trigger
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_rooms_updated_at on public.rooms;
create trigger set_rooms_updated_at
  before update on public.rooms
  for each row
  execute function public.update_updated_at_column();

-- 6. Cleanup helper for rooms inactive for > 7 days (TTL).
--
-- Note: this only removes database rows. Storage objects are purged by
-- /api/cron/cleanup, which is the endpoint the scheduler should actually call.
create or replace function public.delete_expired_rooms()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from public.rooms
  where last_seen_at < (now() - interval '7 days');

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer
   set search_path = public;

revoke all on function public.delete_expired_rooms() from public, anon, authenticated;
