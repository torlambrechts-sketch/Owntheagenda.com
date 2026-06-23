-- =====================================================================
-- Assessment suite overview metrics. One set-based call returns the
-- per-survey numbers the suite needs — response count + invited (team
-- size), masking, overall mean / band position, sections below band, and
-- whether a workshop was triggered — so the overview table can show a Score
-- marker and a response-rate bar, and the KPIs/alert can be exact, all in a
-- single round-trip regardless of assessment count.
--
-- Supersedes assessment_below_band_rollup (folded in as below_count here).
-- Banding is faithful to lib/survey.dimensionMeans + the suite view:
-- per-item means from survey_response.scores, dimensions/items/reverse/scale
-- from the live instrument (workspace row preferred, snapshot fallback),
-- Likert-only, declared-dimensions-only, masked under 3 effective
-- respondents. Visibility matches the page: workspace members, and within
-- the workspace only surveys whose team the caller can read.
-- =====================================================================

drop function if exists public.assessment_below_band_rollup(uuid);

create or replace function public.assessment_suite_overview(p_workspace uuid)
returns table(
  survey_id uuid,
  respondents int,
  invited int,
  masked boolean,
  overall_mean numeric,
  overall_pct numeric,
  below_count int,
  has_workshop boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_eff int;
  v_min numeric;
  v_max numeric;
  v_overall numeric;
  v_below int;
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for r in
    select s.id, s.team_id, s.subject_user_id,
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
    select count(*) into respondents from public.survey_response sr where sr.survey_id = r.id;
    select count(*) into invited from public.team_member tm where tm.team_id = r.team_id;
    select exists(select 1 from public.block b where b.survey_id = r.id and b.workshop_id is not null)
      into has_workshop;

    -- Effective respondents — exclude the subject for an individual survey.
    if r.subject_user_id is not null then
      select count(*) into v_eff from public.survey_response sr
        where sr.survey_id = r.id and sr.respondent_id <> r.subject_user_id;
    else
      v_eff := respondents;
    end if;

    survey_id := r.id;
    masked := true;
    overall_mean := null;
    overall_pct := null;
    below_count := 0;

    if v_eff >= 3
       and coalesce(jsonb_typeof(r.definition -> 'dimensions'), '') = 'array'
       and coalesce(jsonb_typeof(r.definition -> 'items'), '') = 'array' then
      v_min := (r.definition #>> '{scale,min}')::numeric;
      v_max := (r.definition #>> '{scale,max}')::numeric;
      if v_min is not null and v_max is not null and v_max <> v_min then
        with per_item as (
          select e.key as item_key, avg((e.value)::numeric) as mean
          from public.survey_response sr, jsonb_each_text(sr.scores) e
          where sr.survey_id = r.id
          group by e.key
        ),
        def_dims as (
          select d ->> 'key' as key from jsonb_array_elements(r.definition -> 'dimensions') d
        ),
        def_items as (
          select it ->> 'key' as key,
                 it ->> 'dimension' as dimension,
                 coalesce((it ->> 'reverse')::boolean, false) as reverse
          from jsonb_array_elements(r.definition -> 'items') it
          where coalesce(it ->> 'type', 'likert') = 'likert'
        ),
        dim_means as (
          select di.dimension,
                 round(avg(case when di.reverse then v_min + v_max - pi.mean else pi.mean end), 2) as dmean
          from def_items di
          join def_dims dd on dd.key = di.dimension
          join per_item pi on pi.item_key = di.key
          group by di.dimension
        )
        select round(avg(dmean), 2),
               count(*) filter (where ((dmean - v_min) / (v_max - v_min)) * 100 < 45)
          into v_overall, v_below
        from dim_means
        where dmean is not null;

        if v_overall is not null then
          masked := false;
          overall_mean := v_overall;
          overall_pct := round(((v_overall - v_min) / (v_max - v_min)) * 100, 1);
          below_count := coalesce(v_below, 0);
        end if;
      end if;
    end if;

    return next;
  end loop;
end;
$$;

grant execute on function public.assessment_suite_overview(uuid) to authenticated;
revoke execute on function public.assessment_suite_overview(uuid) from public, anon;
