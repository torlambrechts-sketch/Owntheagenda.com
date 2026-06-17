-- =====================================================================
-- OwnTheAgenda · 0002 · Core tables (identity, tenancy, teams, invites)
-- ---------------------------------------------------------------------
-- Pure DDL. All Phase-1 tables, enums, constraints and indexes are
-- created here so cross-references resolve cleanly. Functions, triggers
-- and RLS policies are layered on in 0003 and 0004.
--
-- The two-entity spine from the spec is `team` + `team_member`; the tenant
-- root is `workspace`. Identity mirrors Supabase `auth.users` into
-- `profile`. `team.parent_team_id` gives a nestable organizational
-- hierarchy (company › division › team).
-- =====================================================================

-- ----- enums ---------------------------------------------------------
create type public.workspace_role   as enum ('owner', 'admin', 'member');
create type public.membership_status as enum ('active', 'suspended');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.plan_tier         as enum ('free', 'pro', 'enterprise');

-- ----- workspace (the company / tenant root) -------------------------
create table public.workspace (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  slug        citext not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  plan        public.plan_tier not null default 'free',
  data_region text not null default 'eu',          -- residency; EU by default
  logo_url    text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                          -- soft delete
);
comment on table public.workspace is 'Tenant root. Every other row is scoped to a workspace.';

-- ----- profile (1:1 with auth.users) ---------------------------------
create table public.profile (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext,
  full_name    text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profile is 'Public-facing identity, mirrored from auth.users via trigger.';

-- ----- membership (user <-> workspace, carries the workspace role) ----
create table public.membership (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.workspace_role not null default 'member',
  status       public.membership_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, user_id)
);
comment on table public.membership is 'Workspace-level role for a user. owner/admin manage; member participates.';

create index membership_user_idx      on public.membership (user_id);
create index membership_workspace_idx on public.membership (workspace_id);

-- ----- team (the leadership team; nestable hierarchy) ----------------
create table public.team (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspace(id) on delete cascade,
  parent_team_id uuid references public.team(id) on delete set null,
  name           text not null check (length(btrim(name)) between 1 and 120),
  slug           citext,
  lead_user_id   uuid references auth.users(id) on delete set null,
  description    text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (workspace_id, slug),
  check (parent_team_id is null or parent_team_id <> id)
);
comment on table public.team is 'A team within a workspace. parent_team_id enables an org hierarchy.';

create index team_workspace_idx on public.team (workspace_id);
create index team_parent_idx    on public.team (parent_team_id);
create index team_lead_idx      on public.team (lead_user_id);

-- ----- team_member (a person on a team, with first-class consent) -----
create table public.team_member (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.team(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role_title    text,                              -- e.g. "CFO", "VP Product"
  is_lead       boolean not null default false,
  consent_share boolean not null default false,    -- consent to share fingerprint
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (team_id, user_id)
);
comment on table public.team_member is 'Membership of a user on a team. consent_share is a first-class field (GDPR).';

create index team_member_team_idx on public.team_member (team_id);
create index team_member_user_idx on public.team_member (user_id);

-- ----- invitation (email-based, hashed token) ------------------------
create table public.invitation (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  team_id     uuid references public.team(id) on delete cascade,   -- optional team placement
  email       citext not null check (position('@' in email) > 1),
  role        public.workspace_role not null default 'member',
  role_title  text,
  token_hash  text not null unique,                -- SHA-256 of the raw token; raw is emailed, never stored
  status      public.invitation_status not null default 'pending',
  invited_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.invitation is 'Pending invites to a workspace (and optionally a team). Token stored hashed.';

create index invitation_workspace_idx on public.invitation (workspace_id);
create index invitation_email_idx     on public.invitation (email);
-- At most one *pending* invite per (workspace, email).
create unique index invitation_one_pending_idx
  on public.invitation (workspace_id, email) where (status = 'pending');

-- ----- audit_log (append-only) ---------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  workspace_id uuid references public.workspace(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,                       -- e.g. 'workspace.created', 'invitation.accepted'
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.audit_log is 'Append-only accountability log. Written only via SECURITY DEFINER helpers.';

create index audit_log_workspace_time_idx on public.audit_log (workspace_id, created_at desc);

-- ----- updated_at triggers ------------------------------------------
create trigger set_updated_at before update on public.workspace
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.profile
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.membership
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.team
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.team_member
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.invitation
  for each row execute function private.set_updated_at();
