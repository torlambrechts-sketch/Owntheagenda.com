-- A scheduled next step that links a finished session to its follow-up (a
-- check-in/meeting, a re-measure, or a working session). The connective tissue
-- that turns sessions into a loop.
create table if not exists public.follow_up (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  team_id uuid references public.team(id) on delete set null,
  source_session_id uuid references public.session(id) on delete set null,
  kind text not null,
  title text not null,
  owner_id uuid,
  scheduled_at timestamptz,
  workshop_id uuid references public.workshop(id) on delete set null,
  completed_session_id uuid references public.session(id) on delete set null,
  status text not null default 'planned',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_up_kind_chk check (kind in ('check_in','review','remeasure','working_session','meeting')),
  constraint follow_up_status_chk check (status in ('planned','completed','skipped'))
);
create index if not exists follow_up_team_idx on public.follow_up(team_id, scheduled_at);
create index if not exists follow_up_source_idx on public.follow_up(source_session_id);

alter table public.follow_up enable row level security;
drop policy if exists follow_up_read on public.follow_up;
create policy follow_up_read on public.follow_up for select to authenticated using (private.is_workspace_member(workspace_id));

-- Schedule a follow-up for a session. Lead/admin of the source workshop's team.
-- If a template is given, spawn + schedule a workshop and link it.
create or replace function public.schedule_follow_up(
  p_session uuid, p_kind text, p_title text, p_when timestamptz,
  p_owner uuid default null, p_template uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_workshop uuid; v_team uuid; v_ws uuid; v_new_wk uuid; v_id uuid; v_title text;
begin
  select s.workshop_id into v_workshop from public.session s where s.id = p_session;
  if v_workshop is null then raise exception 'session not found' using errcode = '23503'; end if;
  if not private.can_manage_workshop(v_workshop) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('check_in','review','remeasure','working_session','meeting') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  select team_id, workspace_id into v_team, v_ws from public.workshop where id = v_workshop;
  v_title := coalesce(nullif(btrim(p_title), ''), 'Follow-up');

  if p_template is not null then
    select id into v_new_wk from public.create_workshop_from_template(v_team, p_template, v_title, null);
    update public.workshop set scheduled_at = p_when where id = v_new_wk;
  end if;

  insert into public.follow_up (workspace_id, team_id, source_session_id, kind, title, owner_id, scheduled_at, workshop_id, status, created_by)
  values (v_ws, v_team, p_session, p_kind, v_title, p_owner, p_when, v_new_wk, 'planned', (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.schedule_follow_up(uuid, text, text, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.schedule_follow_up(uuid, text, text, timestamptz, uuid, uuid) to authenticated;

-- Cancel a planned follow-up.
create or replace function public.skip_follow_up(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.follow_up where id = p_id;
  if v_ws is null then raise exception 'not found' using errcode = '23503'; end if;
  if not private.is_workspace_member(v_ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.follow_up set status = 'skipped', updated_at = now() where id = p_id;
end;
$$;
revoke execute on function public.skip_follow_up(uuid) from public, anon;
grant execute on function public.skip_follow_up(uuid) to authenticated;

-- Auto-complete a follow-up when its workshop's session ends.
create or replace function private.follow_up_complete_on_end() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ended' and (old.status is distinct from 'ended') and new.workshop_id is not null then
    update public.follow_up
      set status = 'completed', completed_session_id = new.id, updated_at = now()
      where workshop_id = new.workshop_id and status = 'planned';
  end if;
  return new;
end;
$$;
drop trigger if exists follow_up_complete on public.session;
create trigger follow_up_complete after update on public.session
  for each row execute function private.follow_up_complete_on_end();
