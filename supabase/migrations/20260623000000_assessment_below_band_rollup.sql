-- =====================================================================
-- Assessment below-band rollup. Powers the suite overview alert
-- ("N sections across M assessments are below the healthy band") with an
-- exact, set-based count instead of a bounded client-side RPC fan-out.
--
-- Faithful to the app's scoring (lib/survey.dimensionMeans + the suite
-- banding):
--   * per-item means come from survey_response.scores (same as survey_results),
--   * dimensions/items/reverse/scale are read from the survey's own definition
--     snapshot (so a since-edited template never rewrites history),
--   * only Likert items contribute to a section mean; reverse items are
--     mirrored (min + max - mean); section mean is rounded to 2dp,
--   * a section is "below band" under 45% of the instrument's scale,
--   * results are masked (skipped) under 3 effective respondents — the same
--     floor survey_results enforces — so a small response set is never
--     inferable through the count.
--
-- Visibility matches the page: workspace members only, and within the
-- workspace only surveys whose team the caller can read (can_read_team).
-- =====================================================================

create or replace function public.assessment_below_band_rollup(p_workspace uuid)
returns table(sections_below int, assessments_below int)
language plpgsql security definer set search_path = '' as $$
declare
  v_sections int := 0;
  v_assess int := 0;
  r record;
  v_eff int;
  v_min numeric;
  v_max numeric;
  v_below int;
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for r in
    -- Score against the live instrument (workspace-custom row preferred over the
    -- global built-in), matching the detail Results view; fall back to the
    -- survey's own snapshot for legacy rows with no resolvable template.
    select s.id, s.subject_user_id,
      coalesce(
        (select t.definition from public.assessment_template t
          where t.key = s.kind and (t.workspace_id = p_workspace or t.workspace_id is null)
          order by t.workspace_id nulls last limit 1),
        s.definition
      ) as definition
    from public.survey s
    where s.workspace_id = p_workspace
      and private.can_read_team(s.team_id)
  loop
    if coalesce(jsonb_typeof(r.definition -> 'dimensions'), '') <> 'array'
       or coalesce(jsonb_typeof(r.definition -> 'items'), '') <> 'array' then
      continue;
    end if;
    -- Effective respondents — exclude the subject for an individual survey,
    -- mirroring survey_results; for team surveys subject is null so this is
    -- just the row count (one row per respondent in both anonymity modes).
    if r.subject_user_id is not null then
      select count(*) into v_eff from public.survey_response sr
        where sr.survey_id = r.id and sr.respondent_id <> r.subject_user_id;
    else
      select count(*) into v_eff from public.survey_response sr where sr.survey_id = r.id;
    end if;
    if v_eff < 3 then continue; end if;

    v_min := (r.definition #>> '{scale,min}')::numeric;
    v_max := (r.definition #>> '{scale,max}')::numeric;
    if v_min is null or v_max is null or v_max = v_min then continue; end if;

    with per_item as (
      select e.key as item_key, avg((e.value)::numeric) as mean
      from public.survey_response sr, jsonb_each_text(sr.scores) e
      where sr.survey_id = r.id
      group by e.key
    ),
    def_dims as (
      select d ->> 'key' as key
      from jsonb_array_elements(r.definition -> 'dimensions') d
    ),
    def_items as (
      select it ->> 'key' as key,
             it ->> 'dimension' as dimension,
             coalesce((it ->> 'reverse')::boolean, false) as reverse
      from jsonb_array_elements(r.definition -> 'items') it
      where coalesce(it ->> 'type', 'likert') = 'likert'
    ),
    dim_means as (
      -- One row per declared dimension that has at least one answered Likert
      -- item; reverse items mirrored, mean rounded to 2dp to match the app.
      select di.dimension,
             round(avg(case when di.reverse then v_min + v_max - pi.mean else pi.mean end), 2) as dmean
      from def_items di
      join def_dims dd on dd.key = di.dimension
      join per_item pi on pi.item_key = di.key
      group by di.dimension
    )
    select count(*) into v_below
    from dim_means
    where dmean is not null
      and ((dmean - v_min) / (v_max - v_min)) * 100 < 45;

    if coalesce(v_below, 0) > 0 then
      v_sections := v_sections + v_below;
      v_assess := v_assess + 1;
    end if;
  end loop;

  sections_below := v_sections;
  assessments_below := v_assess;
  return next;
end;
$$;

grant execute on function public.assessment_below_band_rollup(uuid) to authenticated;
revoke execute on function public.assessment_below_band_rollup(uuid) from public, anon;
