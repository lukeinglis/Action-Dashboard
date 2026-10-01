-- Phase 5: Fantasy and DFS.
-- FantasyLeague, FantasyMatchup, FantasyRosterSlot, DFSLineup,
-- DFSLineupSlot, DFSEntry. See docs/PRD.md sections 34-45, 63, 63.1.

-- 35. FantasyLeague.
create table fantasy_leagues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  platform text,

  sport text not null,
  season text not null,

  user_team_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fantasy_leagues_user_idx on fantasy_leagues (user_id);

create trigger fantasy_leagues_set_updated_at
  before update on fantasy_leagues
  for each row execute function set_updated_at();

-- 36. FantasyMatchup.
create table fantasy_matchups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fantasy_league_id uuid not null references fantasy_leagues(id) on delete cascade,

  week integer,

  user_team_name text not null,
  opponent_team_name text not null,

  automatic_user_score numeric,
  automatic_opponent_score numeric,

  manual_user_score numeric,
  manual_opponent_score numeric,

  user_projected_score numeric,
  opponent_projected_score numeric,

  automatic_changed_at timestamptz,
  manual_set_at timestamptz,

  status text not null check (status in ('upcoming', 'live', 'final')),
  finalized_at timestamptz,

  sort_key text not null,

  import_record_id uuid references import_records(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fantasy_matchups_league_idx on fantasy_matchups (fantasy_league_id);
create index fantasy_matchups_user_sort_idx on fantasy_matchups (user_id, sort_key);
create index fantasy_matchups_import_record_idx on fantasy_matchups (import_record_id);

create trigger fantasy_matchups_set_updated_at
  before update on fantasy_matchups
  for each row execute function set_updated_at();

-- 37. FantasyRosterSlot. Only starters/opponent starters are required for MVP.
create table fantasy_roster_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fantasy_matchup_id uuid not null references fantasy_matchups(id) on delete cascade,

  side text not null check (side in ('user', 'opponent')),
  slot text not null,

  participant_id uuid references participants(id) on delete set null,
  participant_match_method text check (participant_match_method in ('auto', 'manual')),

  player_name text not null,

  projected_points numeric,

  automatic_actual_points numeric,
  manual_actual_points numeric,

  automatic_changed_at timestamptz,
  manual_set_at timestamptz,

  event_id uuid references events(id) on delete set null,
  event_match_method text check (event_match_method in ('auto', 'manual')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fantasy_roster_slots_matchup_idx on fantasy_roster_slots (fantasy_matchup_id);
create index fantasy_roster_slots_participant_idx on fantasy_roster_slots (participant_id);
create index fantasy_roster_slots_event_idx on fantasy_roster_slots (event_id);

create trigger fantasy_roster_slots_set_updated_at
  before update on fantasy_roster_slots
  for each row execute function set_updated_at();

-- 40. DFSLineup.
create table dfs_lineups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  platform text not null,
  sport text not null,

  slate_name text,

  import_record_id uuid references import_records(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dfs_lineups_user_idx on dfs_lineups (user_id);
create index dfs_lineups_import_record_idx on dfs_lineups (import_record_id);

create trigger dfs_lineups_set_updated_at
  before update on dfs_lineups
  for each row execute function set_updated_at();

-- 41. DFSLineupSlot. salary is in DFS salary-cap units, not money.
create table dfs_lineup_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dfs_lineup_id uuid not null references dfs_lineups(id) on delete cascade,

  slot text not null,

  participant_id uuid references participants(id) on delete set null,
  participant_match_method text check (participant_match_method in ('auto', 'manual')),

  player_name text not null,

  salary numeric,

  automatic_actual_points numeric,
  manual_actual_points numeric,

  automatic_changed_at timestamptz,
  manual_set_at timestamptz,

  event_id uuid references events(id) on delete set null,
  event_match_method text check (event_match_method in ('auto', 'manual')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dfs_lineup_slots_lineup_idx on dfs_lineup_slots (dfs_lineup_id);
create index dfs_lineup_slots_participant_idx on dfs_lineup_slots (participant_id);
create index dfs_lineup_slots_event_idx on dfs_lineup_slots (event_id);

create trigger dfs_lineup_slots_set_updated_at
  before update on dfs_lineup_slots
  for each row execute function set_updated_at();

-- 42. DFSEntry. One DFSLineup may be used by multiple DFSEntries, so
-- deleting a Lineup is blocked while any Entry references it (section 63.1);
-- an Entry references its Lineup with "on delete restrict" accordingly.
create table dfs_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  dfs_lineup_id uuid not null references dfs_lineups(id) on delete restrict,

  contest_name text,

  entry_fee_cents bigint,
  potential_prize_cents bigint,

  automatic_current_points numeric,
  manual_current_points numeric,

  automatic_changed_at timestamptz,
  manual_set_at timestamptz,

  status text not null check (status in ('upcoming', 'live', 'final')),
  finalized_at timestamptz,

  sort_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dfs_entries_lineup_idx on dfs_entries (dfs_lineup_id);
create index dfs_entries_user_sort_idx on dfs_entries (user_id, sort_key);

create trigger dfs_entries_set_updated_at
  before update on dfs_entries
  for each row execute function set_updated_at();

-- Row-level security: every table is scoped to auth.uid().
alter table fantasy_leagues enable row level security;
alter table fantasy_matchups enable row level security;
alter table fantasy_roster_slots enable row level security;
alter table dfs_lineups enable row level security;
alter table dfs_lineup_slots enable row level security;
alter table dfs_entries enable row level security;

create policy "fantasy_leagues_owner" on fantasy_leagues
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "fantasy_matchups_owner" on fantasy_matchups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "fantasy_roster_slots_owner" on fantasy_roster_slots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "dfs_lineups_owner" on dfs_lineups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "dfs_lineup_slots_owner" on dfs_lineup_slots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "dfs_entries_owner" on dfs_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
