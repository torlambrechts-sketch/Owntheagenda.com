-- Explicitly bind a specific open assessment to a workshop (overrides the
-- runtime newest-open-by-kind auto-match). p_survey null detaches (back to auto).
create or replace function public.set_workshop_survey(p_workshop uuid, p_survey uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws_team uuid; v_survey_team uuid; v_kind text;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead or facilitator can attach an assessment' using errcode = '42501';
  end if;
  select team_id into v_ws_team from public.workshop where id = p_workshop;
  if v_ws_team is null then raise exception 'workshop not found' using errcode = '23503'; end if;

  if p_survey is not null then
    select team_id, kind into v_survey_team, v_kind from public.survey where id = p_survey;
    if v_survey_team is null then raise exception 'assessment not found' using errcode = '23503'; end if;
    if v_survey_team <> v_ws_team then
      raise exception 'assessment belongs to another team' using errcode = '42501';
    end if;
    -- the workshop must have a survey step for this instrument (default kind mirrors the runtime)
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

revoke execute on function public.set_workshop_survey(uuid, uuid) from public, anon;
grant execute on function public.set_workshop_survey(uuid, uuid) to authenticated;
