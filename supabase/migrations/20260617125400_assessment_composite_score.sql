-- Transparent composite 0–100 headline index for an assessment. Single source of
-- truth: reads the instrument definition (item→dimension map, scale, optional
-- per-dimension weights), computes weighted dimension means, normalizes to
-- 0–100. Returns null when masked (<3 respondents) or the instrument is unknown.
create or replace function private.survey_composite(p_survey uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_team uuid; v_ws uuid; v_def jsonb; v_min numeric; v_max numeric; v_n int; v_comp numeric;
begin
  select s.kind, s.team_id into v_kind, v_team from public.survey s where s.id = p_survey;
  if v_kind is null then return null; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < 3 then return null; end if;
  select workspace_id into v_ws from public.team where id = v_team;
  select definition into v_def from public.assessment_template
    where key = v_kind and (workspace_id = v_ws or workspace_id is null)
    order by workspace_id nulls last limit 1;
  if v_def is null then return null; end if;
  v_min := coalesce((v_def->'scale'->>'min')::numeric, 1);
  v_max := coalesce((v_def->'scale'->>'max')::numeric, 7);
  if v_max = v_min then return null; end if;

  with item_mean as (
    select e.key as item_key, avg((e.value)::numeric) as m
    from public.survey_response r, jsonb_each_text(r.scores) e
    where r.survey_id = p_survey group by e.key
  ),
  def_items as (
    select it->>'key' as item_key, it->>'dimension' as dim
    from jsonb_array_elements(v_def->'items') it
  ),
  dim_mean as (
    select di.dim,
           avg(im.m) as dm,
           coalesce((v_def->'weights'->>di.dim)::numeric, 1) as w
    from def_items di join item_mean im on im.item_key = di.item_key
    group by di.dim
  )
  select sum(dm * w) / nullif(sum(w), 0) into v_comp from dim_mean;

  if v_comp is null then return null; end if;
  return round(((v_comp - v_min) / (v_max - v_min)) * 100, 1);
end;
$$;

-- survey_results now carries the composite (back-compatible: an added key).
create or replace function public.survey_results(p_survey uuid, p_strength_items text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_n integer; v_result jsonb;
begin
  select team_id into v_team from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < 3 then
    return jsonb_build_object('respondents', v_n, 'masked', true, 'items', '[]'::jsonb, 'strength_sd', null, 'composite', null);
  end if;
  with exploded as (
    select r.respondent_id, e.key as item_key, (e.value)::numeric as score
    from public.survey_response r, jsonb_each_text(r.scores) e
    where r.survey_id = p_survey
  ),
  per_item as (
    select item_key, round(avg(score), 2) as mean, count(*)::int as n from exploded group by item_key
  ),
  strength as (
    select round(stddev_pop(rmean), 2) as sd from (
      select respondent_id, avg(score) as rmean from exploded
      where p_strength_items = '{}' or item_key = any(p_strength_items)
      group by respondent_id
    ) s
  )
  select jsonb_build_object(
    'respondents', v_n,
    'masked', false,
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_key', item_key, 'mean', mean, 'n', n)) from per_item), '[]'::jsonb),
    'strength_sd', (select sd from strength),
    'composite', private.survey_composite(p_survey)
  ) into v_result;
  return v_result;
end;
$$;
