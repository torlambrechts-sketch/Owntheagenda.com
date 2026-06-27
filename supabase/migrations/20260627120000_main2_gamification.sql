-- =====================================================================
-- OwnTheAgenda · MAIN2 · Gamification & cadence layer
-- ---------------------------------------------------------------------
-- Additive only. Backs the MAIN2 responsive redesign:
--   * journey_level      — global ladder catalog (Seedling … Flourishing)
--   * milestone          — global badge catalog
--   * onboarding_framework — global framework-picker catalog
--   * cycle              — a team's named measurement cadence (per workspace)
--   * team_journey       — per-team XP / level / streak roll-up (1 row/team)
--   * team_milestone     — badges a team has earned
--
-- Catalog tables (journey_level, milestone, onboarding_framework) are
-- workspace-independent and readable by any authenticated user; they have
-- no write policy, so only seeds / service-role may mutate them.
-- Tenant tables reuse the existing private.* RLS helpers from migration
-- 20260617120300_functions_triggers.sql.
-- =====================================================================

-- ----- catalogs ------------------------------------------------------

create table public.journey_level (
  level      int  primary key check (level >= 1),
  name       text not null,
  min_xp     int  not null check (min_xp >= 0),
  icon       text not null default 'sprout',         -- lucide icon name
  blurb      text,
  created_at timestamptz not null default now()
);
comment on table public.journey_level is 'Global team-journey ladder. min_xp is the inclusive floor for the level.';

create table public.milestone (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,                  -- stable program key
  name        text not null,
  description text,
  icon        text not null default 'flag',          -- lucide icon name
  tint        text not null default 'open'           -- pill tint: open|internal|interview|draft|reject
              check (tint in ('open','internal','interview','draft','reject')),
  xp_reward   int  not null default 0 check (xp_reward >= 0),
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
comment on table public.milestone is 'Global badge catalog. Teams earn instances via public.team_milestone.';

create table public.onboarding_framework (
  key             text primary key,                  -- e.g. 'aristotle'
  name            text not null,
  description     text not null,
  icon            text not null default 'shield-check',
  tint            text not null default 'open'
                  check (tint in ('open','internal','interview','draft','reject')),
  question_count  int  not null default 0 check (question_count >= 0),
  est_minutes     int  not null default 0 check (est_minutes >= 0),
  template_id     uuid references public.assessment_template(id) on delete set null,
  recommended     boolean not null default false,
  sort            int  not null default 0,
  created_at      timestamptz not null default now()
);
comment on table public.onboarding_framework is 'Framework-picker catalog for MAIN2 onboarding step 1.';

-- ----- tenant tables -------------------------------------------------

create table public.cycle (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspace(id) on delete cascade,
  team_id          uuid references public.team(id) on delete cascade,
  seq              int  not null default 1 check (seq >= 1),
  label            text,                              -- "Cycle 03"
  season           text,                              -- "Spring 2026"
  framework_key    text references public.onboarding_framework(key) on delete set null,
  cadence_weeks    int  not null default 6 check (cadence_weeks between 1 and 52),
  status           text not null default 'active' check (status in ('draft','active','closed')),
  participation_pct numeric(5,2) check (participation_pct between 0 and 100),
  started_at       timestamptz not null default now(),
  closed_at        timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.cycle is 'A team''s named measurement cadence (assess → run → re-measure).';
create index cycle_workspace_idx on public.cycle (workspace_id);
create index cycle_team_idx      on public.cycle (team_id);
create unique index cycle_team_seq_idx on public.cycle (team_id, seq) where team_id is not null;

create table public.team_journey (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspace(id) on delete cascade,
  team_id         uuid not null references public.team(id) on delete cascade,
  xp              int  not null default 0 check (xp >= 0),
  level           int  not null default 1 check (level >= 1),
  streak          int  not null default 0 check (streak >= 0),
  longest_streak  int  not null default 0 check (longest_streak >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (team_id)
);
comment on table public.team_journey is 'Per-team XP / level / streak roll-up for the journey UI.';
create index team_journey_workspace_idx on public.team_journey (workspace_id);

create table public.team_milestone (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspace(id) on delete cascade,
  team_id       uuid not null references public.team(id) on delete cascade,
  milestone_id  uuid not null references public.milestone(id) on delete cascade,
  cycle_id      uuid references public.cycle(id) on delete set null,
  earned_at     timestamptz not null default now(),
  unique (team_id, milestone_id)
);
comment on table public.team_milestone is 'Badge instances earned by a team.';
create index team_milestone_workspace_idx on public.team_milestone (workspace_id);
create index team_milestone_team_idx      on public.team_milestone (team_id);

-- ----- updated_at triggers ------------------------------------------
create trigger set_updated_at before update on public.cycle
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.team_journey
  for each row execute function private.set_updated_at();

-- ----- grants & RLS --------------------------------------------------
grant select on public.journey_level, public.milestone, public.onboarding_framework to authenticated;
grant select, insert, update, delete on
  public.cycle, public.team_journey, public.team_milestone to authenticated;

alter table public.journey_level        enable row level security;
alter table public.milestone            enable row level security;
alter table public.onboarding_framework enable row level security;
alter table public.cycle                enable row level security;
alter table public.team_journey         enable row level security;
alter table public.team_milestone       enable row level security;

-- Catalogs: readable by all authenticated; no write policy (seed/service only).
create policy journey_level_select on public.journey_level
  for select to authenticated using (true);
create policy milestone_select on public.milestone
  for select to authenticated using (true);
create policy onboarding_framework_select on public.onboarding_framework
  for select to authenticated using (true);

-- cycle: members read; team managers / workspace admins write.
create policy cycle_select on public.cycle
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy cycle_insert on public.cycle
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id)
              and (team_id is null or private.can_manage_team(team_id)));
create policy cycle_update on public.cycle
  for update to authenticated
  using (team_id is null and private.is_workspace_admin(workspace_id)
         or team_id is not null and private.can_manage_team(team_id))
  with check (private.is_workspace_member(workspace_id));
create policy cycle_delete on public.cycle
  for delete to authenticated
  using (team_id is null and private.is_workspace_admin(workspace_id)
         or team_id is not null and private.can_manage_team(team_id));

-- team_journey: members read their workspace's teams; managers write.
create policy team_journey_select on public.team_journey
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy team_journey_insert on public.team_journey
  for insert to authenticated with check (private.can_manage_team(team_id));
create policy team_journey_update on public.team_journey
  for update to authenticated
  using (private.can_manage_team(team_id))
  with check (private.can_manage_team(team_id));
create policy team_journey_delete on public.team_journey
  for delete to authenticated using (private.is_workspace_admin(workspace_id));

-- team_milestone: members read; managers grant/revoke.
create policy team_milestone_select on public.team_milestone
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy team_milestone_insert on public.team_milestone
  for insert to authenticated with check (private.can_manage_team(team_id));
create policy team_milestone_delete on public.team_milestone
  for delete to authenticated using (private.can_manage_team(team_id));

-- ----- helper: level for an XP total --------------------------------
create or replace function public.level_for_xp(p_xp int)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(max(level), 1) from public.journey_level where min_xp <= greatest(p_xp, 0);
$$;
grant execute on function public.level_for_xp(int) to authenticated;

-- =====================================================================
-- Seeds
-- =====================================================================

insert into public.journey_level (level, name, min_xp, icon, blurb) values
  (1, 'Seedling',    0,    'sprout',    'Your team''s first signal. Growth is rewarded by consistency, not high scores.'),
  (2, 'Sapling',     200,  'leaf',      'Roots are forming — a rhythm of measuring and talking is taking hold.'),
  (3, 'Rooted',      450,  'tree-pine', 'The cadence is steady and the team trusts the loop.'),
  (4, 'Thriving',    700,  'trees',     'Healthy dynamics and reliable follow-through, cycle after cycle.'),
  (5, 'Flourishing', 1000, 'flower-2',  'A high-performing team that compounds its own momentum.'),
  (6, 'Old Growth',  1400, 'mountain',  'A resilient culture others in the org learn from.')
on conflict (level) do nothing;

insert into public.milestone (key, name, description, icon, tint, xp_reward, sort) values
  ('first_cycle',       'First cycle',        'Completed your team''s first measurement cycle.',       'flag',           'open',      120, 10),
  ('first_assessment',  'Baseline set',       'Sent your team''s first assessment.',                   'clipboard-check','interview', 80,  20),
  ('full_house',        'Full house',         'Everyone on the team responded to an assessment.',      'users-round',    'internal',  150, 30),
  ('first_workshop',    'First workshop',     'Ran your first live workshop from a result.',           'presentation',   'interview', 120, 40),
  ('all_actions_closed','All actions closed', 'Closed every action committed in a cycle.',             'check-check',    'open',      140, 50),
  ('three_in_row',      '3 in a row',         'Three consecutive healthy cycles.',                     'repeat',         'interview', 200, 60),
  ('streak_5',          'On a roll',          'Five healthy cycles in a row — your longest streak.',   'flame',          'internal',  260, 70),
  ('trust_plus_1',      'Trust +1',           'Improved a team dynamic by a full point.',              'trending-up',    'open',      180, 80),
  ('level_up',          'Level up',           'Reached a new team-journey level.',                     'sparkles',       'draft',     0,   90)
on conflict (key) do nothing;

insert into public.onboarding_framework (key, name, description, icon, tint, question_count, est_minutes, recommended, sort) values
  ('aristotle',   'Project Aristotle', 'Google''s five keys to effective teams. Starts with psychological safety.',         'shield-check', 'open',      18, 6, true,  10),
  ('dysfunctions','5 Dysfunctions',    'Lencioni''s pyramid — trust, conflict, commitment, accountability, results.',       'layers',       'interview', 15, 5, false, 20),
  ('tuckman',     'Tuckman Stages',    'Forming, storming, norming, performing — where is the team now?',                   'git-merge',    'internal',  12, 4, false, 30)
on conflict (key) do nothing;
