-- ClipSync Initial Database Schema & RLS Setup

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
create index if not exists idx_rooms_slug on public.rooms(slug);
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

-- 6. Cleanup function for rooms inactive for > 7 days (TTL)
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
$$ language plpgsql security definer;

-- 7. Enable Row Level Security (RLS)
alter table public.rooms enable row level security;
alter table public.attachments enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Allow public read access to rooms" on public.rooms;
drop policy if exists "Allow public insert access to rooms" on public.rooms;
drop policy if exists "Allow public update access to rooms" on public.rooms;
drop policy if exists "Allow public delete access to rooms" on public.rooms;

drop policy if exists "Allow public select attachments" on public.attachments;
drop policy if exists "Allow public insert attachments" on public.attachments;
drop policy if exists "Allow public delete attachments" on public.attachments;

-- RLS Policies
create policy "Allow public read access to rooms"
  on public.rooms for select
  using (true);

create policy "Allow public insert access to rooms"
  on public.rooms for insert
  with check (true);

create policy "Allow public update access to rooms"
  on public.rooms for update
  using (true);

create policy "Allow public delete access to rooms"
  on public.rooms for delete
  using (true);

create policy "Allow public select attachments"
  on public.attachments for select
  using (true);

create policy "Allow public insert attachments"
  on public.attachments for insert
  with check (true);

create policy "Allow public delete attachments"
  on public.attachments for delete
  using (true);

-- 8. Add tables to Supabase Realtime publication
begin;
  -- Drop publication table membership if already added to avoid errors
  alter publication supabase_realtime add table public.rooms;
  alter publication supabase_realtime add table public.attachments;
exception when others then
  -- In case publication or table exists, ignore duplicate add error
  null;
end;
