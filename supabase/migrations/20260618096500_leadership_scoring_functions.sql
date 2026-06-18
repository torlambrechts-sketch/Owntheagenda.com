-- Reverse-aware scoring for the leadership inventory. Driven by the relational
-- definition, so reverse flags can never drift from the questions. Scale is 1-7,
-- so a reverse item inverts as (8 - value): a 7 becomes a 1 before averaging.
create or replace function public.score_leadership(p_scores jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with vals as (
    select q.item_key, q.reverse_scored,
           fa.code as facet, fa.name as facet_name, fa.ord as facet_ord,
           c.code as category, c.name as category_name, c.ord as category_ord,
           nullif(p_scores ->> q.item_key, '')::numeric as raw
    from public.assessment_question q
    join public.assessment_facet fa on fa.id = q.facet_id
    join public.assessment_category c on c.id = fa.category_id
    where c.instrument = 'leadership_effectiveness'
  ),
  adj as (
    select v.*, case when raw is null then null
                     when reverse_scored then 8 - raw
                     else raw end as score
    from vals v
  ),
  facet as (
    select category, category_name, category_ord, facet, facet_name, facet_ord,
           round(avg(score), 2) as facet_mean, count(score) as answered
    from adj group by category, category_name, category_ord, facet, facet_name, facet_ord
  ),
  cat as (
    select category, category_name, category_ord, round(avg(facet_mean), 2) as category_mean
    from facet group by category, category_name, category_ord
  )
  select jsonb_build_object(
    'instrument', 'leadership_effectiveness',
    'overall', (select round(avg(facet_mean), 2) from facet),
    'categories', (select jsonb_agg(jsonb_build_object('code', category, 'name', category_name, 'mean', category_mean) order by category_ord) from cat),
    'facets', (select jsonb_agg(jsonb_build_object('code', facet, 'name', facet_name, 'category', category, 'mean', facet_mean, 'answered', answered) order by category_ord, facet_ord) from facet)
  );
$$;
revoke execute on function public.score_leadership(jsonb) from public, anon;
grant execute on function public.score_leadership(jsonb) to authenticated;

-- The structured inventory (category → facet → questions) for rendering the test.
create or replace function public.leadership_inventory()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_agg(cat order by cat_ord)
  from (
    select c.ord as cat_ord, jsonb_build_object(
      'code', c.code, 'name', c.name,
      'facets', (
        select jsonb_agg(jsonb_build_object(
          'code', fa.code, 'name', fa.name,
          'questions', (
            select jsonb_agg(jsonb_build_object('key', q.item_key, 'ord', q.ord, 'text', q.text, 'reverse', q.reverse_scored) order by q.ord)
            from public.assessment_question q where q.facet_id = fa.id
          )) order by fa.ord)
        from public.assessment_facet fa where fa.category_id = c.id
      )
    ) as cat
    from public.assessment_category c
    where c.instrument = 'leadership_effectiveness'
  ) z;
$$;
revoke execute on function public.leadership_inventory() from public, anon;
grant execute on function public.leadership_inventory() to authenticated;
