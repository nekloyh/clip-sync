-- Owner-controlled room lifecycle (v1).
--
-- Until now every visitor holding a room URL had the same powers as the person
-- who created it: delete the room, change or remove the PIN, delete evidence.
-- This migration adds the two columns that let the app tell those two people
-- apart. There is still no account, no workspace and no RBAC — ownership is a
-- capability the creator's browser holds in an httpOnly cookie.
--
-- Expand-compatible and safe to re-run: both columns are additive, existing
-- rows keep working, and code that predates them ignores them.

-- sha256 of the owner capability secret. The raw secret exists only inside the
-- creator's cookie and is never written here, so a database dump does not hand
-- anyone ownership of a room.
--
-- NULL means "legacy room, created before ownership existed". Such rooms have
-- no owner and never gain one: nobody can claim them by visiting.
alter table public.rooms
  add column if not exists owner_secret_hash text;

-- Bumping this invalidates every owner cookie previously issued for the room,
-- without touching the secret itself. This is the revocation lever.
alter table public.rooms
  add column if not exists owner_version integer not null default 1;

do $$
begin
  alter table public.rooms
    add constraint rooms_owner_version_positive check (owner_version >= 1);
exception when duplicate_object then
  null;
end $$;

comment on column public.rooms.owner_secret_hash is
  'sha256 of the owner capability secret; NULL = legacy room with no owner. Never stores the raw secret.';
comment on column public.rooms.owner_version is
  'Increment to revoke all owner cookies issued for this room.';

-- No index: the column is never a lookup key. Ownership is always checked on a
-- row already fetched by slug.
