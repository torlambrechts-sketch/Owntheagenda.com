-- Act on close: emit the "Closed & report" lifecycle notification, and — when
-- the template carries a threshold and enough people responded — a "Threshold
-- crossed" alert for the sections below threshold (the design's trigger watch).
-- Recipients: the team leads + the survey creator. (CREATE OR REPLACE preserves
-- grants.)
create or replace function public.close_survey(p_survey uuid)
returns survey language plpgsql security definer set search_path = '' as $function$
declare v_row public.survey; v_team uuid; v_resp int; v_threshold numeric; v_breaches int := 0; v_recipient uuid;
begin
  v_team := (select team_id from public.survey where id = p_survey);
  if not private.can_manage_team(v_team) then
    raise exception 'only a team lead or admin can close a survey' using errcode = '42501';
  end if;
  update public.survey set status = 'closed', closed_at = now(), updated_at = now()
  where id = p_survey returning * into v_row;

  select count(*) into v_resp from public.survey_response where survey_id = p_survey;
  v_threshold := nullif(v_row.definition->>'threshold', '')::numeric;

  -- Count dimensions whose Likert mean fell below the threshold (only once
  -- results would unmask, i.e. >= 3 responses).
  if v_threshold is not null and v_resp >= 3 then
    with item_mean as (
      select e.key as item_key, avg((e.value)::numeric) as m
      from public.survey_response r, jsonb_each_text(r.scores) e
      where r.survey_id = p_survey group by e.key
    ),
    def_items as (
      select it->>'key' as item_key, it->>'dimension' as dim
      from jsonb_array_elements(v_row.definition->'items') it
      where coalesce(it->>'type', 'likert') = 'likert'
    ),
    dim_mean as (
      select di.dim, avg(im.m) as dm
      from def_items di join item_mean im on im.item_key = di.item_key
      group by di.dim
    )
    select count(*) into v_breaches from dim_mean where dm < v_threshold;
  end if;

  for v_recipient in
    select distinct uid from (
      select user_id as uid from public.team_member where team_id = v_team and is_lead
      union select v_row.created_by
    ) r where uid is not null
  loop
    insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
    values (v_row.workspace_id, v_recipient, 'survey_closed',
            'Assessment closed — report ready',
            coalesce(v_row.name, 'An assessment') || ' closed with ' || v_resp || ' response' || case when v_resp = 1 then '' else 's' end || '. The report is ready.',
            '/assessments/status/' || p_survey::text, 'survey', p_survey);
    if v_breaches > 0 then
      insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
      values (v_row.workspace_id, v_recipient, 'survey_threshold',
              'Threshold crossed: ' || v_breaches || ' section' || case when v_breaches = 1 then '' else 's' end || ' below threshold',
              'A mitigation workshop is recommended for ' || coalesce((select name from public.team where id = v_team), 'the team') || '.',
              '/assessments/status/' || p_survey::text, 'survey', p_survey);
    end if;
  end loop;

  return v_row;
end;
$function$;
