-- Phase 4: Core dashboard persistence.
-- DashboardView (saved filter/layout presets) and WorkspaceState (the
-- current working state, one row per user). See docs/PRD.md sections 46,
-- 46.1, 63.

-- 46. Saved Views.
create table dashboard_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  is_default boolean not null default false,

  filters jsonb not null,
  layout jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dashboard_views_user_idx on dashboard_views (user_id);

create trigger dashboard_views_set_updated_at
  before update on dashboard_views
  for each row execute function set_updated_at();

-- 46.1 Working state: one row per user, saved on every change.
create table workspace_state (
  user_id uuid primary key references auth.users(id) on delete cascade,

  base_view_id uuid references dashboard_views(id) on delete set null,

  filters jsonb not null,
  layout jsonb not null,

  updated_at timestamptz not null default now()
);

create trigger workspace_state_set_updated_at
  before update on workspace_state
  for each row execute function set_updated_at();

-- Row-level security: every table is scoped to auth.uid().
alter table dashboard_views enable row level security;
alter table workspace_state enable row level security;

create policy "dashboard_views_owner" on dashboard_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "workspace_state_owner" on workspace_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
