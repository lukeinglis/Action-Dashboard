-- Phase 1: Foundation schema.
-- Shared identity layer (Team, Participant, Event, ProviderMapping) plus
-- per-user preferences. See docs/PRD.md sections 6-20.1.

create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 6. User preferences (timezone, day-rollover hour).
create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'America/New_York',
  rollover_hour smallint not null default 4 check (rollover_hour between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on user_preferences
  for each row execute function set_updated_at();

-- 18. Shared Team model.
create table teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sport text not null,
  league text not null,
  name text not null,
  abbreviation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teams_user_sport_idx on teams (user_id, sport, league);

create trigger teams_set_updated_at
  before update on teams
  for each row execute function set_updated_at();

-- 19. Shared Participant model.
create table participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('player', 'golfer', 'driver', 'fighter', 'other')),
  sport text not null,
  league text,
  name text not null,
  team_id uuid references teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index participants_user_sport_idx on participants (user_id, sport);
create index participants_team_idx on participants (team_id);

create trigger participants_set_updated_at
  before update on participants
  for each row execute function set_updated_at();

-- 20. Shared Event model.
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  sport text not null,
  league text,
  name text not null,

  start_time_utc timestamptz,
  start_time_tbd boolean not null default false,
  end_time_utc timestamptz,

  home_team_id uuid references teams(id) on delete set null,
  away_team_id uuid references teams(id) on delete set null,

  source text not null check (source in ('manual', 'provider')),

  -- Written only by provider refresh (Phase 6+).
  automatic_status text check (automatic_status in
    ('scheduled', 'in_progress', 'final', 'postponed', 'cancelled', 'suspended', 'unknown')),
  automatic_home_score integer,
  automatic_away_score integer,
  automatic_period text,
  automatic_clock text,
  automatic_changed_at timestamptz,

  -- Written only by the user.
  manual_status text check (manual_status in
    ('scheduled', 'in_progress', 'final', 'postponed', 'cancelled', 'suspended', 'unknown')),
  manual_home_score integer,
  manual_away_score integer,
  manual_period text,
  manual_clock text,
  manual_set_at timestamptz,

  is_pinned boolean not null default false,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_user_sport_start_idx on events (user_id, sport, start_time_utc);
create index events_user_teams_idx on events (user_id, home_team_id, away_team_id);
create index events_user_pinned_idx on events (user_id) where is_pinned;

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

-- 20.1 Provider mappings.
create table provider_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  entity_type text not null check (entity_type in ('event', 'team', 'participant')),
  entity_id uuid not null,

  provider_key text not null,
  provider_id text not null,

  match_method text not null check (match_method in ('auto', 'manual')),
  locked boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, entity_type, provider_key, provider_id),
  unique (user_id, entity_type, entity_id, provider_key)
);

create index provider_mappings_entity_idx on provider_mappings (user_id, entity_type, entity_id);

create trigger provider_mappings_set_updated_at
  before update on provider_mappings
  for each row execute function set_updated_at();

-- Row-level security: every table is scoped to auth.uid().
alter table user_preferences enable row level security;
alter table teams enable row level security;
alter table participants enable row level security;
alter table events enable row level security;
alter table provider_mappings enable row level security;

create policy "user_preferences_owner" on user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "teams_owner" on teams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "participants_owner" on participants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "events_owner" on events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "provider_mappings_owner" on provider_mappings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
