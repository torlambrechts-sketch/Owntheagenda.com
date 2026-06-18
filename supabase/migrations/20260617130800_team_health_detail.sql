-- On-demand detail for one team's Health row: full per-axis history (value +
-- date + label, up to 12 points, oldest -> newest) and the manual-status log
-- (who set each axis status, and when). Read access = can_read_team.
create or replace function public.team_health_detail(p_team uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_strategy jsonb; v_performance jsonb; v_dynamics jsonb; v_manual jsonb;
begin
  if not private.can_read_team(p_team) then raise exception 'forbidden' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('v', comp, 'at', ts, 'label', nm) order by ts asc), '[]'::jsonb)
    into v_strategy
  from (
    select private.survey_composite(s.id) as comp, coalesce(s.closed_at, s.opened_at, s.created_at) as ts, s.name as nm
    from public.survey s
    where s.team_id = p_team and s.kind = 'strategy_health'
      and (select count(*) from public.survey_response r where r.survey_id = s.id) >= 3
    order by ts desc limit 12
  ) z where comp is not null;

  select coalesce(jsonb_agg(jsonb_build_object('v', comp, 'at', ts, 'label', nm) order by ts asc), '[]'::jsonb)
    into v_performance
  from (
    select private.survey_composite(s.id) as comp, coalesce(s.closed_at, s.opened_at, s.created_at) as ts, s.name as nm
    from public.survey s
    where s.team_id = p_team and s.kind = 'team_performance'
      and (select count(*) from public.survey_response r where r.survey_id = s.id) >= 3
    order by ts desc limit 12
  ) z where comp is not null;

  select coalesce(jsonb_agg(jsonb_build_object('v', score, 'at', closed_at, 'label', nm) order by closed_at asc), '[]'::jsonb)
    into v_dynamics
  from (
    select (select round(avg(sub.pct)) from (
              select avg((pr.score - 1) / 4.0 * 100) as pct
              from public.pulse_response pr where pr.pulse_id = p.id group by pr.dynamic
            ) sub) as score,
           p.closed_at, p.name as nm
    from public.pulse p
    where p.team_id = p_team and p.status = 'closed'
      and (select count(distinct pr2.respondent_id) from public.pulse_response pr2 where pr2.pulse_id = p.id) >= 3
    order by p.closed_at desc limit 12
  ) z where score is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
            'axis', h.axis, 'status', h.status, 'note', h.note,
            'by', (select coalesce(pf.full_name, pf.display_name, pf.email) from public.profile pf where pf.id = h.updated_by),
            'at', h.updated_at) order by h.updated_at desc), '[]'::jsonb)
    into v_manual
  from public.health_status h where h.team_id = p_team;

  return jsonb_build_object('strategy', v_strategy, 'performance', v_performance, 'dynamics', v_dynamics, 'manual', v_manual);
end;
$$;
revoke execute on function public.team_health_detail(uuid) from public, anon;
grant execute on function public.team_health_detail(uuid) to authenticated;
