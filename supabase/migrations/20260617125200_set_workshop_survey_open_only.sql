-- Review fix: only an OPEN assessment can be pinned. A closed pin would be
-- honoured by ensure_workshop_survey at session start with no fallback, opening
-- a dead survey. Detach (null) is still allowed.
create or replace function public.set_workshop_survey(p_workshop uuid, p_survey uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws_team uuid; v_survey_team uuid; v_kind text; v_status text;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead or facilitator can attach an assessment' using errcode = '42501';
  end if;
  select team_id into v_ws_team from public.workshop where id = p_workshop;
  if v_ws_team is null then raise exception 'workshop not found' using errcode = '23503'; end if;

  if p_survey is not null then
    select team_id, kind, status into v_survey_team, v_kind, v_status from public.survey where id = p_survey;
    if v_survey_team is null then raise exception 'assessment not found' using errcode = '23503'; end if;
    if v_survey_team <> v_ws_team then
      raise exception 'assessment belongs to another team' using errcode = '42501';
    end if;
    if v_status <> 'open' then
      raise exception 'only an open assessment can be attached' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.block
      where workshop_id = p_workshop and activity_type = 'survey'
        and coalesce(config->>'kind', 'psych_safety_bang') = v_kind
    ) then
      raise exception 'this session has no assessment step for that instrument' using errcode = '22023';
    end if;
  end if;

  update public.workshop set survey_id = p_survey where id = p_workshop;
end;
$$;
