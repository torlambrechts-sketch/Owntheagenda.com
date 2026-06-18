-- RBAC P6: external facilitators are scoped to the teams/sessions they're
-- assigned to. The else-branch of every helper/policy below is byte-for-byte
-- the prior behavior, so owners/admins/managers/employees are unaffected.

create or replace function private.is_scoped_facilitator(p_workspace uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.membership m
    where m.workspace_id = p_workspace and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role = 'facilitator');
$$;

-- A facilitator reads a team only if they're on it; everyone else: workspace member.
create or replace function private.can_read_team(p_team uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select case
    when private.is_scoped_facilitator(private.team_workspace(p_team))
      then private.is_team_member(p_team)
    else private.is_workspace_member(private.team_workspace(p_team))
  end;
$$;

create or replace function private.can_read_workshop(p_workshop uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select case
    when private.is_scoped_facilitator(private.workshop_workspace(p_workshop))
      then private.can_read_team(private.workshop_team(p_workshop))
    else private.is_workspace_member(private.workshop_workspace(p_workshop))
  end;
$$;

-- A facilitator reads a session they facilitate, take part in, or whose team they're on.
create or replace function private.can_read_session(p_session uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select case
    when private.is_scoped_facilitator(private.session_workspace(p_session)) then (
      private.is_session_facilitator(p_session)
      or exists (select 1 from public.participant p where p.session_id = p_session and p.user_id = (select auth.uid()))
      or private.can_read_team(private.workshop_team((select s.workshop_id from public.session s where s.id = p_session)))
    )
    else private.is_workspace_member(private.session_workspace(p_session))
  end;
$$;

drop policy if exists team_select on public.team;
create policy team_select on public.team for select to authenticated using (private.can_read_team(id));

drop policy if exists workshop_select on public.workshop;
create policy workshop_select on public.workshop for select to authenticated using (private.can_read_workshop(id));

drop policy if exists session_select on public.session;
create policy session_select on public.session for select to authenticated using (private.can_read_session(id));

drop policy if exists membership_select on public.membership;
create policy membership_select on public.membership for select to authenticated using (
  case when private.is_scoped_facilitator(workspace_id)
    then user_id = (select auth.uid())
    else private.is_workspace_member(workspace_id) end
);

drop policy if exists action_item_select on public.action_item;
create policy action_item_select on public.action_item for select to authenticated using (
  case when private.is_scoped_facilitator(workspace_id) then (
    (team_id is not null and private.can_read_team(team_id))
    or (session_id is not null and private.can_read_session(session_id))
  ) else private.is_workspace_member(workspace_id) end
);

drop policy if exists follow_up_read on public.follow_up;
create policy follow_up_read on public.follow_up for select to authenticated using (
  case when private.is_scoped_facilitator(workspace_id)
    then (team_id is not null and private.can_read_team(team_id))
    else private.is_workspace_member(workspace_id) end
);

drop policy if exists pulse_select on public.pulse;
create policy pulse_select on public.pulse for select to authenticated using (
  case when private.is_scoped_facilitator(workspace_id)
    then private.can_read_team(team_id)
    else private.is_workspace_member(workspace_id) end
);

drop policy if exists canvas_snapshot_read on public.canvas_snapshot;
create policy canvas_snapshot_read on public.canvas_snapshot for select to authenticated using (
  case when private.is_scoped_facilitator(workspace_id)
    then (workshop_id is not null and private.can_read_workshop(workshop_id))
    else private.is_workspace_member(workspace_id) end
);

drop policy if exists user_manual_select on public.user_manual;
create policy user_manual_select on public.user_manual for select to authenticated using (
  case when private.is_scoped_facilitator(workspace_id) then (
    user_id = (select auth.uid())
    or exists (select 1 from public.team_member tm where tm.user_id = user_manual.user_id and private.is_team_member(tm.team_id))
  ) else private.is_workspace_member(workspace_id) end
);
