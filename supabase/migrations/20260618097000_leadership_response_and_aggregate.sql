-- A member's saved leadership-test answers, scoped to the team they're rating.
-- Individual rows are private to the respondent; leads see only the anonymized
-- team aggregate (via team_leadership_scores, min-3 respondents).
create table if not exists public.leadership_response (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  team_id uuid not null references public.team(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);
create index if not exists leadership_response_team_idx on public.leadership_response(team_id);

alter table public.leadership_response enable row level security;
drop policy if exists lr_select on public.leadership_response;
create policy lr_select on public.leadership_response for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists lr_insert on public.leadership_response;
create policy lr_insert on public.leadership_response for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_team_member(team_id));
drop policy if exists lr_update on public.leadership_response;
create policy lr_update on public.leadership_response for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lr_delete on public.leadership_response;
create policy lr_delete on public.leadership_response for delete to authenticated using (user_id = (select auth.uid()));

-- Anonymized team aggregate. Team leads / admins only; needs >= 3 respondents.
-- Reverse-scoring is applied per item before rolling up to facets and categories.
create or replace function public.team_leadership_scores(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_n int; v_min int := 3;
begin
  if not private.can_manage_team(p_team) then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*) into v_n from public.leadership_response where team_id = p_team;
  if v_n < v_min then
    return jsonb_build_object('ready', false, 'respondents', v_n, 'min', v_min);
  end if;
  return (
    with resp as (select scores from public.leadership_response where team_id = p_team),
    items as (
      select fa.code as facet, fa.name as facet_name, fa.ord as facet_ord,
             c.code as category, c.name as category_name, c.ord as category_ord,
             avg(case when (r.scores ->> q.item_key) is null then null
                      when q.reverse_scored then 8 - (r.scores ->> q.item_key)::numeric
                      else (r.scores ->> q.item_key)::numeric end) as item_mean
      from public.assessment_question q
      join public.assessment_facet fa on fa.id = q.facet_id
      join public.assessment_category c on c.id = fa.category_id
      cross join resp r
      where c.instrument = 'leadership_effectiveness'
      group by q.item_key, fa.code, fa.name, fa.ord, c.code, c.name, c.ord
    ),
    facet as (select category, category_name, category_ord, facet, facet_name, facet_ord,
                     round(avg(item_mean), 2) as facet_mean
              from items group by category, category_name, category_ord, facet, facet_name, facet_ord),
    cat as (select category, category_name, category_ord, round(avg(facet_mean), 2) as category_mean
            from facet group by category, category_name, category_ord)
    select jsonb_build_object(
      'ready', true, 'respondents', v_n,
      'overall', (select round(avg(facet_mean), 2) from facet),
      'categories', (select jsonb_agg(jsonb_build_object('code', category, 'name', category_name, 'mean', category_mean) order by category_ord) from cat),
      'facets', (select jsonb_agg(jsonb_build_object('code', facet, 'name', facet_name, 'category', category, 'mean', facet_mean) order by category_ord, facet_ord) from facet)
    )
  );
end;
$$;
revoke execute on function public.team_leadership_scores(uuid) from public, anon;
grant execute on function public.team_leadership_scores(uuid) to authenticated;
