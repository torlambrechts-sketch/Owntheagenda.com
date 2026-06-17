-- Notify team members when a survey opens (prerequisite mode).
create or replace function public.create_survey(p_team uuid, p_kind text, p_name text)
returns public.survey language plpgsql security definer set search_path = '' as $$
declare v_row public.survey; v_uid uuid := (select auth.uid());
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can open a survey' using errcode = '42501';
  end if;
  insert into public.survey (team_id, kind, name, status, opened_at, created_by)
  values (p_team, p_kind, p_name, 'open', now(), v_uid)
  returning * into v_row;
  perform private.notify(v_row.workspace_id, tm.user_id, 'survey_open', p_name,
                         'Share your read in ~2 minutes — anonymous in aggregate.', '/assessments', 'survey', v_row.id)
  from public.team_member tm
  where tm.team_id = p_team and tm.user_id <> v_uid;
  return v_row;
end;
$$;
