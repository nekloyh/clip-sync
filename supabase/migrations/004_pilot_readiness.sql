-- Pilot readiness v1: telemetry, deletion lifecycle and operational visibility.
--
-- Forward-only and safe to re-run. Every column added here is nullable or has a
-- default, and every table is new, so a deployment running the previous build
-- against this schema keeps working unchanged (expand step). The contract step —
-- making `lifecycle_state` non-null without a default, dropping the tolerance in
-- `getRoom` — is deliberately NOT taken here.

-- ---------------------------------------------------------------------------
-- 1. Room deletion lifecycle
-- ---------------------------------------------------------------------------
--
-- Deletion used to be one irreversible step that removed the metadata first and
-- then tried storage, logging a failure it could not act on. The row was the
-- only thing that knew which objects belonged to the room, so a storage error
-- left images that nothing referenced and nothing would ever retry — in a
-- product whose promise is that data disappears on a schedule, that is a
-- retention bug, not untidiness.
--
-- These columns make deletion a state machine that a later run can resume:
--
--   active            normal.
--   deletion_pending  requested (owner pressed delete, or the TTL expired).
--                     Invisible to every read path; storage still intact.
--   deleting          a worker has claimed it for this run.
--   deleted           row is gone; this state exists only in transit.
--   deletion_failed   retry budget exhausted. Needs an operator, and is what
--                     the ops endpoint alerts on.
alter table public.rooms
  add column if not exists lifecycle_state text not null default 'active';

do $$
begin
  alter table public.rooms
    add constraint rooms_lifecycle_state_known
    check (lifecycle_state in ('active','deletion_pending','deleting','deleted','deletion_failed'));
exception when duplicate_object then
  null;
end $$;

alter table public.rooms
  add column if not exists deletion_requested_at timestamptz;

alter table public.rooms
  add column if not exists deletion_attempts integer not null default 0;

-- A stable code from src/lib/errors.ts, never a provider message: those carry
-- bucket names, object paths and request ids.
alter table public.rooms
  add column if not exists deletion_error_code text;

-- The cron's work queue. Partial, so it stays small on a healthy deployment.
create index if not exists idx_rooms_deletion_queue
  on public.rooms (deletion_requested_at, id)
  where lifecycle_state in ('deletion_pending','deleting');

-- The TTL sweep reads this; `idx_rooms_last_seen` alone made it scan rooms
-- already queued for deletion on every run.
create index if not exists idx_rooms_active_last_seen
  on public.rooms (last_seen_at)
  where lifecycle_state = 'active';

comment on column public.rooms.lifecycle_state is
  'active | deletion_pending | deleting | deleted | deletion_failed. Only `active` rooms are readable.';
comment on column public.rooms.deletion_error_code is
  'Stable ClipSync error code from the last failed deletion attempt. Never a raw provider message.';

-- ---------------------------------------------------------------------------
-- 2. Product analytics
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT a child of `rooms`:
--
--   * No foreign key. A funnel whose rows cascade away when the room is deleted
--     can never answer "how many rooms reached first_content_transferred",
--     because the successful ones are exactly the rooms that get deleted. The
--     absence of the FK is the feature.
--   * No slug, no content, no PIN, no filename, no IP, no user agent, no token.
--     `room_ref` is an HMAC of the room UUID under CLIPSYNC_AUTH_SECRET, so the
--     funnel can be joined to itself and to nothing else. Rotating that secret
--     severs old refs from new ones, which is the intended blast radius.
--
-- The allowlist is enforced in the application (src/lib/analytics/catalog.ts);
-- the column set here is the second half of that fence — there is physically
-- nowhere to put a slug or a filename.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_version integer not null default 1,
  -- Pseudonymous room tracking id. HMAC, not the id and not the slug.
  room_ref text,
  -- 'owner' | 'recipient' | 'system'. Capability *class*, never the capability.
  actor text,
  -- Bucketed, never the byte count: an exact size plus a timestamp is a
  -- fingerprint of a specific file.
  size_bucket text,
  -- 'image' | 'text' | 'other'. The top-level type only, never the subtype and
  -- never the filename.
  mime_category text,
  outcome text not null default 'success',
  error_code text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_occurred_at
  on public.analytics_events (occurred_at desc);

create index if not exists idx_analytics_events_name_time
  on public.analytics_events (event_name, occurred_at desc);

-- Idempotency, enforced by the database rather than by a read-then-write race.
--
-- These five events answer "did this room ever reach this stage", so a second
-- occurrence is not a second fact — it is a reconnect, a retry, a second cron
-- pass, or two serverless instances racing. The unique index turns all of those
-- into a no-op insert (`on conflict do nothing`) instead of a funnel that
-- over-counts rooms with flaky wifi.
create unique index if not exists uq_analytics_once_per_room
  on public.analytics_events (room_ref, event_name)
  where event_name in (
    'room_created',
    'second_device_joined',
    'first_content_transferred',
    'room_completed',
    'room_expired'
  );

comment on table public.analytics_events is
  'Privacy-safe product funnel. No FK to rooms on purpose: deleting a room must not erase its funnel history. Contains no content, slug, PIN, filename, IP or user agent.';
comment on column public.analytics_events.room_ref is
  'HMAC-SHA256(CLIPSYNC_AUTH_SECRET, room uuid), truncated. Pseudonymous and not reversible to a slug.';

-- Retention: 180 days, enforced by /api/cron/cleanup on every run. Kept as a
-- function so the policy has one definition and can also be run by hand.
create or replace function public.prune_analytics_events(retain_days integer default 180)
returns integer as $$
declare
  deleted_count integer;
begin
  delete from public.analytics_events
  where occurred_at < (now() - make_interval(days => retain_days));

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer
   set search_path = public;

revoke all on function public.prune_analytics_events(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Operational run records
-- ---------------------------------------------------------------------------
--
-- One row per background job, overwritten each run. This is what makes "the
-- cron stopped firing three days ago" visible without reading logs: the alert
-- is on `last_completed_at` falling behind, and `pending_work` shows a backlog
-- building even while every individual run reports success.
create table if not exists public.ops_runs (
  job text primary key,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_outcome text,
  last_error_code text,
  deleted_rooms integer not null default 0,
  deleted_objects integer not null default 0,
  failed_objects integer not null default 0,
  pending_work integer not null default 0,
  has_more boolean not null default false,
  duration_ms integer
);

comment on table public.ops_runs is
  'Latest run of each background job. Counters only; no slugs, paths or provider errors.';

-- ---------------------------------------------------------------------------
-- 4. Reconciliation findings
-- ---------------------------------------------------------------------------
--
-- Report-only by design. The reconciler records what looks wrong and stops;
-- nothing here is deleted automatically, because "a storage object with no
-- database row" is indistinguishable from "an upload that is still in flight"
-- and from "an object this app did not create", and the cost of being wrong is
-- destroying a customer's evidence.
--
--   db_without_object  attachment row whose storage object is gone (download
--                      would 404). Safe to act on, still not automatic.
--   object_without_db  storage object no live room claims. Candidate only.
create table if not exists public.reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  -- Same HMAC as analytics. Enough to correlate, not enough to locate.
  room_ref text,
  -- Attachment UUID: app-internal, carries no user data. The storage path is
  -- deliberately absent — it embeds the room id.
  attachment_id uuid,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

do $$
begin
  alter table public.reconciliation_findings
    add constraint reconciliation_findings_kind_known
    check (kind in ('db_without_object','object_without_db'));
exception when duplicate_object then
  null;
end $$;

create index if not exists idx_reconciliation_open
  on public.reconciliation_findings (detected_at desc)
  where resolved_at is null;

-- ---------------------------------------------------------------------------
-- 5. Lockdown for the new tables (mirrors 002)
-- ---------------------------------------------------------------------------
-- The anon key ships in the browser bundle. These tables hold operational data,
-- so they get the same posture as every other table: RLS on, no policies, no
-- grants, and out of the Realtime publication.
alter table public.analytics_events        enable row level security;
alter table public.ops_runs                enable row level security;
alter table public.reconciliation_findings enable row level security;

alter table public.analytics_events        force row level security;
alter table public.ops_runs                force row level security;
alter table public.reconciliation_findings force row level security;

revoke all on public.analytics_events        from anon, authenticated;
revoke all on public.ops_runs                from anon, authenticated;
revoke all on public.reconciliation_findings from anon, authenticated;

do $$
begin
  alter publication supabase_realtime drop table public.analytics_events;
exception when others then
  null;
end $$;
