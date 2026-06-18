-- team_latest_composite now also returns `history`: the last up to 5 qualifying
-- (>=3 response) survey composites, oldest -> newest. Headline composite + trend
-- are derived from that series (each composite computed once).
create or replace function private.team_latest_composite(p_team uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hist jsonb; v_sid uuid; v_comp numeric; v_prev numeric; v_bench jsonb; v_trend text; n int;
begin
  with q as (
    select s.id, coalesce(s.closed_at, s.opened_at, s.created_at) as ts
    from public.survey s
    where s.team_id = p_team and s.kind = p_kind
      and (select count(*) from public.survey_response r where r.survey_id = s.id) >= 3
    order by ts desc limit 5
  ), c as (
    select q.id, q.ts, private.survey_composite(q.id) as comp from q
  )
  select jsonb_agg(comp order by ts asc) filter (where comp is not null),
         (array_agg(id order by ts desc) filter (where comp is not null))[1]
    into v_hist, v_sid
  from c;
  if v_hist is null or jsonb_array_length(v_hist) = 0 then return null; end if;
  n := jsonb_array_length(v_hist);
  v_comp := (v_hist->>(n - 1))::numeric;
  if n >= 2 then v_prev := (v_hist->>(n - 2))::numeric; end if;
  v_bench := private.benchmark_rank(p_kind, v_comp);
  if v_prev is not null then
    v_trend := case when v_comp - v_prev >= 2 then 'up' when v_prev - v_comp >= 2 then 'down' else 'flat' end;
  end if;
  return jsonb_build_object(
    'composite', v_comp, 'survey_id', v_sid,
    'percentile', case when (v_bench->>'ready') = 'true' then (v_bench->>'percentile')::numeric else null end,
    'trend', v_trend, 'history', v_hist
  );
end;
$$;

-- Overall dynamics score (avg of per-dynamic pct) per closed pulse, masked to >=3
-- respondents, oldest -> newest, last up to 5 — the dynamics sparkline series.
create or replace function private.team_dynamics_series(p_team uuid, p_limit int default 5)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  with pulses as (
    select p.id, p.closed_at,
      (select count(distinct pr2.respondent_id) from public.pulse_response pr2 where pr2.pulse_id = p.id) as n
    from public.pulse p where p.team_id = p_team and p.status = 'closed'
    order by p.closed_at desc nulls last limit p_limit
  ), scored as (
    select pu.closed_at,
      (select round(avg(sub.pct)) from (
         select avg((pr.score - 1) / 4.0 * 100) as pct
         from public.pulse_response pr where pr.pulse_id = pu.id group by pr.dynamic
       ) sub) as score
    from pulses pu where pu.n >= 3
  )
  select jsonb_agg(score order by closed_at asc) filter (where score is not null) into v from scored;
  return v;
end;
$$;

-- workspace_health: add the dynamics history series (composite histories ride along
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
      case when dd.total > 0 then jsonb_build_object('score', dd.score, 'in_band', dd.in_band, 'total', dd.total,
        'trend', private.team_dynamics_trend(t.id), 'history', private.team_dynamics_series(t.id)) else null end as dynamics,
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
