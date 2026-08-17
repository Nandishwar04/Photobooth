-- Photobooth schema
-- Two-device, no-account, link-scoped photobooth sessions.
--
-- Security model: there are no user accounts, so the capability to act on
-- a session is a possession secret, not an identity. `room_id` (shared via
-- the invite link) is a high-entropy public identifier used only for
-- lookups; `session_secrets.host_token` / `guest_token` are the actual
-- bearer secrets and are NEVER exposed to anon/authenticated roles or to
-- Realtime. All writes happen through Next.js API routes using the
-- service-role key, which validates a caller's token before doing
-- anything. The browser's anon key is only ever used for a read-only
-- Realtime subscription to the `sessions` table.

create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  room_id text not null unique,
  status text not null default 'WAITING_FOR_GUEST' check (
    status in (
      'WAITING_FOR_GUEST', 'READY', 'COUNTDOWN', 'CAPTURING',
      'PHOTO_SAVED', 'NEXT_SHOT', 'FINALIZING', 'RESULTS_READY',
      'EXPIRED', 'ERROR'
    )
  ),
  host_connected boolean not null default false,
  guest_connected boolean not null default false,
  current_shot int not null default 1 check (current_shot between 1 and 4),
  total_shots int not null default 4,
  round int not null default 0,
  capture_at timestamptz,
  capture_seq int not null default 0,
  host_shot_uploaded boolean not null default false,
  guest_shot_uploaded boolean not null default false,
  final_strip_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sessions_room_id on sessions (room_id);
create index if not exists idx_sessions_expires_at on sessions (expires_at);

create table if not exists session_secrets (
  session_id uuid primary key references sessions (id) on delete cascade,
  host_token uuid not null default gen_random_uuid(),
  guest_token uuid
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  round int not null default 0,
  participant_role text not null check (participant_role in ('HOST', 'GUEST')),
  shot_number int not null check (shot_number between 1 and 4),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (session_id, round, participant_role, shot_number)
);

create index if not exists idx_photos_session_round_shot
  on photos (session_id, round, shot_number);

-- Keep updated_at current on every row change; also what Realtime
-- consumers key off of to know something changed.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sessions_updated_at on sessions;
create trigger trg_sessions_updated_at
  before update on sessions
  for each row execute function set_updated_at();

-- Row Level Security -------------------------------------------------------

alter table sessions enable row level security;
alter table session_secrets enable row level security;
alter table photos enable row level security;

-- The browser's anon key is allowed to SELECT sessions (needed for the
-- Realtime subscription + initial state fetch) but the room_id itself is
-- the secret required to find a row in the first place — there is no
-- listing endpoint and no way to enumerate rooms. No INSERT/UPDATE/DELETE
-- grants exist for anon/authenticated; every mutation goes through API
-- routes using the service-role key, which bypasses RLS entirely.
drop policy if exists "public can read sessions" on sessions;
create policy "public can read sessions"
  on sessions for select
  to anon, authenticated
  using (true);

-- session_secrets and photos are never read directly by the browser.
-- No policies are created for anon/authenticated, which combined with
-- RLS being enabled means all access is denied by default for those
-- roles; only the service role (which bypasses RLS) can touch them.

-- Storage --------------------------------------------------------------
-- Bucket is created as private. All object access (upload, signed URL
-- generation) happens server-side via the service role key, so no
-- anon/authenticated storage policies are required. Run once:
--
--   insert into storage.buckets (id, name, public)
--   values ('photobooth', 'photobooth', false)
--   on conflict (id) do nothing;
--
-- (Also included as an idempotent statement below so the migration is
-- fully self-contained.)
insert into storage.buckets (id, name, public)
values ('photobooth', 'photobooth', false)
on conflict (id) do nothing;

-- Housekeeping -----------------------------------------------------------
-- Mark sessions past their expiry as EXPIRED. Intended to be invoked
-- periodically (e.g. a Vercel Cron hitting an API route that calls this),
-- since there is no long-running server process in this deployment model.
create or replace function expire_stale_sessions()
returns void as $$
begin
  update sessions
    set status = 'EXPIRED'
    where expires_at < now()
      and status not in ('EXPIRED');
end;
$$ language plpgsql;
