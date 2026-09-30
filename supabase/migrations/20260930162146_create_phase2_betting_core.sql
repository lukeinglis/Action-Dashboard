-- Phase 2: Betting core schema.
-- Ticket, BetLeg, BetLegEvent, BetLegSubject, ImportRecord, plus a private
-- screenshots storage bucket. See docs/PRD.md sections 24-33, 63-63.1.

-- 31. Import records (created first: Tickets reference import_record_id).
create table import_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  source text not null check (source in ('screenshot', 'text', 'manual')),
  status text not null check (status in
    ('uploaded', 'parsing', 'parsed', 'needs_review', 'failed', 'approved', 'rejected')),

  extracted_text text,
  parsed_payload jsonb,

  original_filename text,

  storage_path text,
  parse_error text,

  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index import_records_user_status_idx on import_records (user_id, status);

-- 25. Ticket.
create table tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text,
  generated_name text,

  sportsbook text,
  sportsbook_ticket_id text,

  stake_cents bigint not null,
  to_win_cents bigint not null,
  total_return_cents bigint not null,
  actual_return_cents bigint,

  is_bonus_bet boolean not null default false,
  odds_american integer,

  placed_at timestamptz,

  notes text,
  promotion_note text,

  tags text[] not null default '{}',

  manual_status text check (manual_status in
    ('pending', 'active', 'won', 'lost', 'void', 'cashed_out')),
  settled_at timestamptz,

  sort_key text not null,

  import_record_id uuid references import_records(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_user_sort_idx on tickets (user_id, sort_key);
create index tickets_import_record_idx on tickets (import_record_id);

create trigger tickets_set_updated_at
  before update on tickets
  for each row execute function set_updated_at();

-- 26. BetLeg.
create table bet_legs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,

  sport text not null,
  league text,

  raw_description text,

  market_type text not null,
  selection text,

  line numeric,
  odds_american integer,

  automatic_status text check (automatic_status in ('open', 'won', 'lost', 'push', 'void')),
  manual_status text check (manual_status in ('open', 'won', 'lost', 'push', 'void')),

  automatic_live_state text check (automatic_live_state in
    ('winning', 'losing', 'even', 'unknown')),
  manual_live_state text check (manual_live_state in
    ('winning', 'losing', 'even', 'unknown')),
  live_detail text,

  automatic_current_value numeric,
  manual_current_value numeric,
  target_value numeric,
  progress_unit text,

  automatic_changed_at timestamptz,
  manual_set_at timestamptz,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bet_legs_ticket_idx on bet_legs (ticket_id);
create index bet_legs_user_sport_idx on bet_legs (user_id, sport);

create trigger bet_legs_set_updated_at
  before update on bet_legs
  for each row execute function set_updated_at();

-- 26.1 BetLeg Event links.
create table bet_leg_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  bet_leg_id uuid not null references bet_legs(id) on delete cascade,
  event_id uuid not null references events(id) on delete restrict,

  match_method text not null check (match_method in ('auto', 'manual')),

  created_at timestamptz not null default now(),

  unique (bet_leg_id, event_id)
);

create index bet_leg_events_bet_leg_idx on bet_leg_events (bet_leg_id);
create index bet_leg_events_event_idx on bet_leg_events (event_id);

-- 26.2 BetLeg Subject links and direction.
create table bet_leg_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  bet_leg_id uuid not null references bet_legs(id) on delete cascade,

  participant_id uuid references participants(id) on delete restrict,
  team_id uuid references teams(id) on delete restrict,

  direction text not null check (direction in ('for', 'against', 'neutral')),
  direction_source text not null check (direction_source in ('auto', 'manual')),

  match_method text not null check (match_method in ('auto', 'manual')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bet_leg_subjects_exactly_one_subject check (
    (participant_id is not null and team_id is null) or
    (participant_id is null and team_id is not null)
  )
);

create index bet_leg_subjects_bet_leg_idx on bet_leg_subjects (bet_leg_id);
create index bet_leg_subjects_participant_idx on bet_leg_subjects (participant_id);
create index bet_leg_subjects_team_idx on bet_leg_subjects (team_id);

create trigger bet_leg_subjects_set_updated_at
  before update on bet_leg_subjects
  for each row execute function set_updated_at();

-- Row-level security: every table is scoped to auth.uid().
alter table import_records enable row level security;
alter table tickets enable row level security;
alter table bet_legs enable row level security;
alter table bet_leg_events enable row level security;
alter table bet_leg_subjects enable row level security;

create policy "import_records_owner" on import_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tickets_owner" on tickets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "bet_legs_owner" on bet_legs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "bet_leg_events_owner" on bet_leg_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "bet_leg_subjects_owner" on bet_leg_subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 29.1 Private screenshot storage, owner-scoped by the first path segment
-- (the uploading user's id), e.g. `{user_id}/{import_record_id}.jpg`.
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false);

create policy "screenshots_owner_select" on storage.objects
  for select using (
    bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "screenshots_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "screenshots_owner_update" on storage.objects
  for update using (
    bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "screenshots_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]
  );
