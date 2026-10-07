-- Phase 6: provider refresh freshness tracking.
-- See docs/PRD.md section 21. One row per (user, provider, sport) rather than
-- a single global `lastUpdated`, so the UI can say "NFL updated 4:18 PM / MLB
-- failed" instead of hiding a partial failure behind one timestamp.

create table sports_refresh_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  provider_key text not null,
  sport text not null,

  -- In-flight lock (§22.1). Set at the start of a refresh, cleared on
  -- completion. A second refresh for this sport is ignored while it is held;
  -- a value older than 2 minutes is treated as stale by the caller.
  in_progress_since timestamptz,

  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,

  -- Quota accounting (§22.1). requests_today_date is compared against the
  -- current date to decide whether the count has rolled over.
  last_request_count integer,
  requests_today_count integer not null default 0 check (requests_today_count >= 0),
  requests_today_date date not null default current_date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Makes the lock an upsert rather than a read-then-write race.
  unique (user_id, provider_key, sport)
);

create trigger sports_refresh_state_set_updated_at
  before update on sports_refresh_state
  for each row execute function set_updated_at();

alter table sports_refresh_state enable row level security;

create policy "sports_refresh_state_owner" on sports_refresh_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
