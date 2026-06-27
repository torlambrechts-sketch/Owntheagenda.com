-- =====================================================================
-- OwnTheAgenda · Reverse-aware server composite
-- ---------------------------------------------------------------------
-- Closes the gap flagged in assessment_item_depth: the client scorer
-- (lib/survey.dimensionMeans) already flips reverse-keyed items onto the
-- dimension pole, but private.survey_composite did not — so reverse keys
-- had to stay off *team* instruments to keep the server composite honest.
--
-- This makes the server scorer reverse-aware in the same way: a reverse
-- item's mean is reflected across the scale midpoint (flipped =
-- min + max - mean) before it averages into its dimension. Forward items
-- are untouched, so every existing instrument scores identically.
--
-- IMPORTANT: this preserves the per-survey *definition snapshot* read path
-- (introduced in survey_definition_snapshot) — the function reads the
-- survey's frozen `definition` first and only falls back to the live
-- assessment_template when the survey carries no snapshot. Only the
-- reverse-flip logic is added.
-- =====================================================================

create or replace function private.survey_composite(p_survey uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_team uuid; v_ws uuid; v_def jsonb; v_min numeric; v_max numeric; v_n int; v_comp numeric;
begin
  select s.kind, s.team_id, s.definition into v_kind, v_team, v_def from public.survey s where s.id = p_survey;
  if v_kind is null then return null; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < 3 then return null; end if;
  if v_def is null then
    select workspace_id into v_ws from public.team where id = v_team;
    select t.definition into v_def from public.assessment_template t
      where t.key = v_kind and (t.workspace_id = v_ws or t.workspace_id is null)
      order by t.workspace_id nulls last limit 1;
  end if;
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
    select it->>'key' as item_key,
           it->>'dimension' as dim,
           coalesce((it->>'reverse')::boolean, false) as rev
    from jsonb_array_elements(v_def->'items') it
  ),
  dim_mean as (
    -- reflect reverse items across the scale midpoint before averaging,
    -- so a high dimension mean always reads "more of this construct".
    select di.dim,
           avg(case when di.rev then (v_min + v_max - im.m) else im.m end) as dm,
           coalesce((v_def->'weights'->>di.dim)::numeric, 1) as w
    from def_items di join item_mean im on im.item_key = di.item_key
    group by di.dim
  )
  select sum(dm * w) / nullif(sum(w), 0) into v_comp from dim_mean;
  if v_comp is null then return null; end if;
  return round(((v_comp - v_min) / (v_max - v_min)) * 100, 1);
end;
$$;
