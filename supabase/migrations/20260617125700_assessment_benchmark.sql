-- Anonymized benchmark pool: one composite per closed survey, by instrument
-- kind. No team/workspace/identity stored — just a distribution of scores — so a
-- live percentile can be shown without exposing any team.
create table if not exists public.benchmark_sample (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  composite numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists benchmark_sample_kind_idx on public.benchmark_sample(kind);
-- RLS on, no policies: unreadable via the API; only the SECURITY DEFINER
-- functions below (which bypass RLS) touch it.
alter table public.benchmark_sample enable row level security;

-- Record a sample when a survey transitions to closed (any close path), if it
-- has a computable composite (>=3 respondents).
create or replace function private.record_benchmark() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_comp numeric;
begin
  if new.status = 'closed' and (old.status is distinct from 'closed') then
    v_comp := private.survey_composite(new.id);
    if v_comp is not null then
      insert into public.benchmark_sample (kind, composite) values (new.kind, v_comp);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists survey_benchmark on public.survey;
create trigger survey_benchmark after update on public.survey
  for each row execute function private.record_benchmark();

-- Percentile rank of a score within its kind's pool, gated by a minimum pool
-- size so a thin pool never shows a misleading number.
create or replace function private.benchmark_rank(p_kind text, p_score numeric)
returns jsonb language sql stable security definer set search_path = '' as $$
  with pool as (select composite from public.benchmark_sample where kind = p_kind)
  select jsonb_build_object(
    'pool_n', (select count(*) from pool),
    'ready', (select count(*) from pool) >= 8 and p_score is not null,
    'percentile', case when (select count(*) from pool) >= 8 and p_score is not null
      then round(100.0 * (select count(*) from pool where composite <= p_score) / nullif((select count(*) from pool), 0))
      else null end
  );
$$;

-- survey_results now also carries the composite's benchmark.
create or replace function public.survey_results(p_survey uuid, p_strength_items text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_kind text; v_n integer; v_comp numeric; v_result jsonb;
begin
  select team_id, kind into v_team, v_kind from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < 3 then
    return jsonb_build_object('respondents', v_n, 'masked', true, 'items', '[]'::jsonb, 'strength_sd', null, 'composite', null, 'benchmark', null);
  end if;
  v_comp := private.survey_composite(p_survey);
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
    'composite', v_comp,
    'benchmark', private.benchmark_rank(v_kind, v_comp)
  ) into v_result;
  return v_result;
end;
$$;
