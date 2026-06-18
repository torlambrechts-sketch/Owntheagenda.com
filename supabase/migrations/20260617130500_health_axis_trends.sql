-- Harden team_dynamics_history with the same min-3 mask as team_dynamics: a pulse
-- with <3 distinct respondents contributes null pct (so trend/sparklines can't
-- reconstruct sub-3 movement). Existing consumer already treats null pct as "no data".
create or replace function public.team_dynamics_history(p_team uuid, p_limit int default 6)
returns table (
  pulse_id uuid, pulse_name text, closed_at timestamptz,
  dynamic public.team_dynamic, label text, pct numeric, target_low int, target_high int
) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.is_workspace_member(v_ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    with recent as (
      select p.id, p.name, p.closed_at,
             (select count(distinct pr2.respondent_id) from public.pulse_response pr2 where pr2.pulse_id = p.id) as n
      from public.pulse p
      where p.team_id = p_team and p.status = 'closed'
      order by p.closed_at desc nulls last
      limit greatest(p_limit, 1)
    )
    select r.id, r.name, r.closed_at, db.dynamic, db.label,
           case when r.n >= 3 then round(avg((pr.score - 1) / 4.0 * 100)::numeric, 0) end as pct,
           db.target_low, db.target_high
    from recent r
    cross join public.dynamic_band db
    left join public.pulse_response pr on pr.pulse_id = r.id and pr.dynamic = db.dynamic
    group by r.id, r.name, r.closed_at, r.n, db.dynamic, db.label, db.target_low, db.target_high, db.ord
    order by r.closed_at asc nulls first, db.ord asc;
end;
$$;

-- Direction of travel for a team's dynamics: overall score (avg of per-dynamic
-- pct) of the latest vs previous closed pulse, each masked to >=3 respondents.
create or replace function private.team_dynamics_trend(p_team uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_latest numeric; v_prev numeric;
begin
  with scored as (
    select p.closed_at,
      (select avg(sub.pct) from (
         select avg((pr.score - 1) / 4.0 * 100) as pct
         from public.pulse_response pr where pr.pulse_id = p.id
         group by pr.dynamic
       ) sub) as score
    from public.pulse p
    where p.team_id = p_team and p.status = 'closed'
      and (select count(distinct pr2.respondent_id) from public.pulse_response pr2 where pr2.pulse_id = p.id) >= 3
    order by p.closed_at desc nulls last
    limit 2
  ), ranked as (
    select score, row_number() over (order by closed_at desc nulls last) as rn from scored
  )
  select max(score) filter (where rn = 1), max(score) filter (where rn = 2) into v_latest, v_prev from ranked;
  if v_latest is null or v_prev is null then return null; end if;
  return case when v_latest - v_prev >= 2 then 'up'
              when v_prev - v_latest >= 2 then 'down' else 'flat' end;
end;
$$;

-- team_latest_composite now also reports trend: latest vs previous qualifying
-- (>=3 response) survey of that kind.
create or replace function private.team_latest_composite(p_team uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_s uuid; v_prev uuid; v_comp numeric; v_prev_comp numeric; v_bench jsonb; v_trend text;
begin
  select s.id into v_s from public.survey s
   where s.team_id = p_team and s.kind = p_kind
     and (select count(*) from public.survey_response r where r.survey_id = s.id) >= 3
   order by coalesce(s.closed_at, s.opened_at, s.created_at) desc limit 1;
  if v_s is null then return null; end if;
  v_comp := private.survey_composite(v_s);
  if v_comp is null then return null; end if;
  v_bench := private.benchmark_rank(p_kind, v_comp);
  select s.id into v_prev from public.survey s
   where s.team_id = p_team and s.kind = p_kind and s.id <> v_s
     and (select count(*) from public.survey_response r where r.survey_id = s.id) >= 3
   order by coalesce(s.closed_at, s.opened_at, s.created_at) desc limit 1;
  if v_prev is not null then
    v_prev_comp := private.survey_composite(v_prev);
    if v_prev_comp is not null then
      v_trend := case when v_comp - v_prev_comp >= 2 then 'up'
                      when v_prev_comp - v_comp >= 2 then 'down' else 'flat' end;
    end if;
  end if;
  return jsonb_build_object(
    'composite', v_comp, 'survey_id', v_s,
    'percentile', case when (v_bench->>'ready') = 'true' then (v_bench->>'percentile')::numeric else null end,
    'trend', v_trend
  );
end;
$$;

-- workspace_health: add the dynamics trend (strategy/performance trends ride along
-- in team_latest_composite).
create or replace function public.workspace_health(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  with mine as (
    select t.id, t.name, t.kind, t.parent_team_id, t.lead_user_id
    from public.team t
    where t.workspace_id = p_workspace and t.deleted_at is null and private.can_read_team(t.id)
  ),
  rows as (
    select
      t.id as team_id, t.name, t.kind, t.parent_team_id,
      (select coalesce(p.full_name, p.display_name, p.email) from public.profile p where p.id = t.lead_user_id) as lead,
      case when dd.total > 0 then jsonb_build_object('score', dd.score, 'in_band', dd.in_band, 'total', dd.total, 'trend', private.team_dynamics_trend(t.id)) else null end as dynamics,
      private.team_latest_composite(t.id, 'strategy_health') as strategy,
      private.team_latest_composite(t.id, 'team_performance') as performance,
      to_jsonb(coalesce(dd.dev, '{}')::text[]) as development,
      (select coalesce(jsonb_object_agg(h.axis, jsonb_build_object('status', h.status, 'note', h.note)), '{}'::jsonb)
         from public.health_status h where h.team_id = t.id) as manual
    from mine t
    left join lateral (
      select count(*) filter (where x.in_band) as in_band, count(*) as total, round(avg(x.pct)) as score,
             array_agg(x.label order by x.pct) filter (where not x.in_band) as dev
      from public.team_dynamics(p_team => t.id) x where x.pct is not null
    ) dd on true
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.kind, rows.name), '[]'::jsonb) into v_result from rows;
  return v_result;
end;
$$;
