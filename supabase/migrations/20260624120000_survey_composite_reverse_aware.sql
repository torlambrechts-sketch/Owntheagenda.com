-- =====================================================================
-- OwnTheAgenda · Reverse-aware server composite
-- ---------------------------------------------------------------------
-- Closes the gap flagged in 20260618107000_assessment_item_depth.sql:
-- the client scorer (lib/survey.dimensionMeans) already flips reverse-
-- keyed items onto the dimension pole, but private.survey_composite did
-- not — so reverse keys had to stay off *team* instruments to keep the
-- server composite / benchmark path honest.
--
-- This makes the server scorer reverse-aware in exactly the same way:
-- a reverse item's mean is reflected across the scale midpoint
-- (flipped = min + max - mean) before it is averaged into its
-- dimension. Forward items are untouched, so every existing instrument
-- (none of which carry reverse keys on team scope today) scores
-- bit-for-bit identically. This unblocks reverse-keyed *team*
-- instruments — most importantly the Project Aristotle pulse.
--
-- Single source of truth, unchanged in spirit: the function reads the
-- instrument `definition` (item→dimension map, optional `reverse`, scale,
-- optional per-dimension weights), computes weighted dimension means, and
-- normalizes to 0–100. Returns null when masked (<3 respondents) or the
-- instrument is unknown.
-- =====================================================================

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
