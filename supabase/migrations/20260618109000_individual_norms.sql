-- =====================================================================
-- Reference norms / percentiles for individual instruments
-- ---------------------------------------------------------------------
-- Individual bands are raw position on the scale, not population-relative.
-- This adds a per-dimension percentile for the caller against the global
-- pool of everyone who has taken the same instrument — reverse-scoring
-- aware, computed entirely server-side so no individual scores ever leave
-- the function. A min-N guard (need at least MIN_POOL others) keeps tiny
-- pools from producing noisy or identifying percentiles; below it the
-- dimension returns the pool size with a null percentile and the report
-- simply omits the percentile.
-- =====================================================================

create or replace function public.individual_norms(p_template_key text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_def  jsonb;
  v_min  numeric;
  v_max  numeric;
  v_me   uuid := (select auth.uid());
  v_min_pool constant int := 5;  -- others required before a percentile is shown
  v_result jsonb;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Canonical (global) definition for the instrument, falling back to any row.
  select definition into v_def
  from public.assessment_template
  where key = p_template_key
  order by (workspace_id is not null)  -- false (global) sorts first
  limit 1;
  if v_def is null then
    return jsonb_build_object('dims', '[]'::jsonb);
  end if;
  v_min := (v_def->'scale'->>'min')::numeric;
  v_max := (v_def->'scale'->>'max')::numeric;

  with items as (
    select it->>'key' as item_key,
           it->>'dimension' as dim,
           coalesce((it->>'reverse')::boolean, false) as reverse
    from jsonb_array_elements(v_def->'items') it
  ),
  resp as (
    select r.user_id, e.key as item_key, (e.value)::numeric as val
    from public.individual_response r,
         lateral jsonb_each_text(r.scores) e
    where r.template_key = p_template_key
  ),
  -- Reverse-adjusted per-user, per-dimension means (high = more of the trait).
  per_user_dim as (
    select resp.user_id, items.dim,
           avg(case when items.reverse then v_min + v_max - resp.val else resp.val end) as mean
    from resp
    join items on items.item_key = resp.item_key
    group by resp.user_id, items.dim
  ),
  dims as (select distinct dim from items),
  my as (select dim, mean from per_user_dim where user_id = v_me),
  ranked as (
    select d.dim,
           m.mean as my_mean,
           count(p.user_id) filter (where p.user_id <> v_me) as others_n,
           count(p.user_id) filter (where p.user_id <> v_me and p.mean <= m.mean) as le_n
    from dims d
    left join my m on m.dim = d.dim
    left join per_user_dim p on p.dim = d.dim
    group by d.dim, m.mean
  )
  select jsonb_build_object(
    'dims',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'dimension', dim,
        'others_n', others_n,
        'percentile',
          case when my_mean is null or others_n < v_min_pool then null
               else round(100.0 * le_n / others_n) end
      ) order by dim
    ), '[]'::jsonb)
  ) into v_result
  from ranked;

  return v_result;
end;
$$;

revoke execute on function public.individual_norms(text) from public, anon;
grant execute on function public.individual_norms(text) to authenticated;
