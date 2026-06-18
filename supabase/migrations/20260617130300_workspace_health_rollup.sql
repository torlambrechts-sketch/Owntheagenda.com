-- Latest computable composite (+ benchmark percentile) of an instrument kind for
-- a team: the most recent survey of that kind with >=3 responses.
create or replace function private.team_latest_composite(p_team uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_s uuid; v_comp numeric; v_bench jsonb;
begin
  select s.id into v_s from public.survey s
   where s.team_id = p_team and s.kind = p_kind
     and (select count(*) from public.survey_response r where r.survey_id = s.id) >= 3
   order by coalesce(s.closed_at, s.opened_at, s.created_at) desc limit 1;
  if v_s is null then return null; end if;
  v_comp := private.survey_composite(v_s);
  if v_comp is null then return null; end if;
  v_bench := private.benchmark_rank(p_kind, v_comp);
  return jsonb_build_object(
    'composite', v_comp,
    'survey_id', v_s,
    'percentile', case when (v_bench->>'ready') = 'true' then (v_bench->>'percentile')::numeric else null end
  );
end;
$$;

-- The Health board roll-up: one row per team the caller can read in the workspace,
-- with dynamics (in-band + score + out-of-band dev chips), strategy + performance
-- composites, and the manual overlay. Ordered leadership groups first.
create or replace function public.workspace_health(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_result jsonb;
begin
  v_uid := (select auth.uid());
  if not exists (select 1 from public.membership where workspace_id = p_workspace and user_id = v_uid) then
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
      case when dd.total > 0 then jsonb_build_object('score', dd.score, 'in_band', dd.in_band, 'total', dd.total) else null end as dynamics,
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
revoke execute on function public.workspace_health(uuid) from public, anon;
grant execute on function public.workspace_health(uuid) to authenticated;
