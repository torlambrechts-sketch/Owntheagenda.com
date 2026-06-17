-- When a workshop's survey block opens, reuse a recent OPEN survey of that kind
-- (e.g. one sent ahead as date-bound pre-work) instead of creating a duplicate.
create or replace function public.ensure_workshop_survey(p_workshop uuid, p_kind text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_survey uuid; v_team uuid;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead or facilitator can open the survey' using errcode = '42501';
  end if;
  select survey_id, team_id into v_survey, v_team from public.workshop where id = p_workshop;
  if v_team is null then raise exception 'workshop not found' using errcode = '23503'; end if;
  if v_survey is not null then return v_survey; end if;
  select id into v_survey from public.survey
  where team_id = v_team and kind = p_kind and status = 'open'
  order by created_at desc limit 1;
  if v_survey is null then
    v_survey := (public.create_survey(v_team, p_kind, p_name)).id;
  end if;
  update public.workshop set survey_id = v_survey where id = p_workshop;
  return v_survey;
end;
$$;
