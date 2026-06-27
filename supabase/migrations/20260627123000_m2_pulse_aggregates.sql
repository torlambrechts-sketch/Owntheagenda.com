-- =====================================================================
-- OwnTheAgenda · MAIN2 · Pulse aggregates
-- ---------------------------------------------------------------------
-- pulse_response carries a "see only your own row" policy (anonymity), so
-- a manager selecting rows directly under-counts. These SECURITY DEFINER
-- helpers return only aggregates (counts + per-dynamic averages, never an
-- individual's answer), guarded by team-read access.
-- Scores are 1–5 Likert; bands are 0–100, so map via (score-1)/4*100.
-- =====================================================================

create or replace function public.m2_pulse_scorecard(p_pulse uuid)
returns table (dynamic public.team_dynamic, pct numeric, respondents int)
language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.pulse where id = p_pulse;
  if v_team is null or not private.can_read_team(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select pr.dynamic,
           round(avg((pr.score - 1) / 4.0 * 100))::numeric,
           count(distinct pr.respondent_id)::int
    from public.pulse_response pr
    where pr.pulse_id = p_pulse
    group by pr.dynamic;
end;
$$;

create or replace function public.m2_pulse_participation(p_pulse uuid)
returns table (responded int, team_size int)
language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.pulse where id = p_pulse;
  if v_team is null or not private.can_read_team(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select (select count(distinct respondent_id) from public.pulse_response where pulse_id = p_pulse)::int,
           (select count(*) from public.team_member where team_id = v_team)::int;
end;
$$;

grant execute on function public.m2_pulse_scorecard(uuid) to authenticated;
grant execute on function public.m2_pulse_participation(uuid) to authenticated;
