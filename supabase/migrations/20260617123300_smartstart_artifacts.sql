-- Start Smart Phase 1: durable artifacts — team charter + personal user manual.

-- team_charter: one living charter per team (the "active working tool").
create table if not exists public.team_charter (
  team_id uuid primary key references public.team(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  purpose text,
  goals jsonb not null default '[]'::jsonb,
  roles jsonb not null default '[]'::jsonb,
  work_methods jsonb not null default '{}'::jsonb,
  norms jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  source_session_id uuid references public.session(id) on delete set null,
  compiled_by uuid references auth.users(id) on delete set null,
  compiled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.set_team_charter_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.workspace_id := private.team_workspace(new.team_id);
  if new.workspace_id is null then
    raise exception 'team not found' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger set_team_charter_ws before insert or update of team_id on public.team_charter
  for each row execute function private.set_team_charter_workspace();
create trigger set_team_charter_updated before update on public.team_charter
  for each row execute function private.set_updated_at();

alter table public.team_charter enable row level security;
create policy team_charter_select on public.team_charter
  for select to authenticated using (private.can_read_team(team_id));

-- user_manual: durable working-style profile, per user per workspace.
create table if not exists public.user_manual (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  strengths text,
  working_style text,
  communication_pref text,
  feedback_pref text,
  watch_outs text,
  energizers text,
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);
alter table public.user_manual enable row level security;
create policy user_manual_select on public.user_manual
  for select to authenticated using (private.is_workspace_member(workspace_id));

-- RPCs (writes routed through SECURITY DEFINER, internally guarded) -----------
create or replace function public.upsert_user_manual(
  p_workspace uuid,
  p_strengths text default null,
  p_working_style text default null,
  p_communication_pref text default null,
  p_feedback_pref text default null,
  p_watch_outs text default null,
  p_energizers text default null
) returns public.user_manual
language plpgsql security definer set search_path = '' as $$
declare v_row public.user_manual; v_uid uuid := (select auth.uid());
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  insert into public.user_manual as um
    (user_id, workspace_id, strengths, working_style, communication_pref, feedback_pref, watch_outs, energizers, updated_at)
  values (v_uid, p_workspace, p_strengths, p_working_style, p_communication_pref, p_feedback_pref, p_watch_outs, p_energizers, now())
  on conflict (user_id, workspace_id) do update set
    strengths = excluded.strengths,
    working_style = excluded.working_style,
    communication_pref = excluded.communication_pref,
    feedback_pref = excluded.feedback_pref,
    watch_outs = excluded.watch_outs,
    energizers = excluded.energizers,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.save_charter_section(
  p_team uuid, p_section text, p_value jsonb
) returns public.team_charter
language plpgsql security definer set search_path = '' as $$
declare v_row public.team_charter;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can edit the charter' using errcode = '42501';
  end if;
  if p_section not in ('purpose','goals','roles','work_methods','norms') then
    raise exception 'unknown charter section: %', p_section using errcode = '22023';
  end if;
  insert into public.team_charter (team_id) values (p_team) on conflict (team_id) do nothing;
  update public.team_charter set
    purpose      = case when p_section = 'purpose' then (p_value ->> 'text') else purpose end,
    goals        = case when p_section = 'goals' then p_value else goals end,
    roles        = case when p_section = 'roles' then p_value else roles end,
    work_methods = case when p_section = 'work_methods' then p_value else work_methods end,
    norms        = case when p_section = 'norms' then p_value else norms end,
    updated_at   = now()
  where team_id = p_team
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.compile_charter(
  p_team uuid, p_session uuid default null
) returns public.team_charter
language plpgsql security definer set search_path = '' as $$
declare v_row public.team_charter;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can compile the charter' using errcode = '42501';
  end if;
  insert into public.team_charter (team_id) values (p_team) on conflict (team_id) do nothing;
  update public.team_charter set
    status = 'active', source_session_id = coalesce(p_session, source_session_id),
    compiled_by = (select auth.uid()), compiled_at = now(), updated_at = now()
  where team_id = p_team
  returning * into v_row;
  return v_row;
end;
$$;

alter table public.user_manual replica identity full;
alter table public.team_charter replica identity full;
alter publication supabase_realtime add table public.user_manual;
alter publication supabase_realtime add table public.team_charter;
