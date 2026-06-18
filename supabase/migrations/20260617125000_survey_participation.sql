-- Roster of who has / hasn't responded to a survey (lead/admin only).
-- Exposes completion booleans, never the answers (those stay own-only).
create or replace function public.survey_participation(p_survey uuid)
returns table (user_id uuid, completed boolean)
language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.survey where id = p_survey;
  if v_team is null or not private.can_manage_team(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select tm.user_id,
           exists (
             select 1 from public.survey_response sr
             where sr.survey_id = p_survey and sr.respondent_id = tm.user_id
           )
    from public.team_member tm
    where tm.team_id = v_team;
end;
$$;

revoke execute on function public.survey_participation(uuid) from public, anon;
grant execute on function public.survey_participation(uuid) to authenticated;
