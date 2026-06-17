-- =====================================================================
-- OwnTheAgenda · 0019 · Privacy gate + licensing remediation
-- ---------------------------------------------------------------------
-- 1. team_dynamics now withholds aggregates until at least 3 people have
--    responded (anti-surveillance / anti-deanonymisation gate — both the
--    research and the build playbook require this).
-- 2. Rename two system templates that echoed licensed/branded IP
--    ("Five Behaviours", Atlassian "Team Health Monitor") to
--    OwnTheAgenda-original framings with research-grounded attribution.
-- =====================================================================

create or replace function public.team_dynamics(p_team uuid, p_pulse uuid default null)
returns table (
  dynamic public.team_dynamic, label text, question text,
  pct numeric, responses int, target_low int, target_high int, in_band boolean
) language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_pulse uuid; v_n int;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.is_workspace_member(v_ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_pulse := coalesce(
    p_pulse,
    (select id from public.pulse where team_id = p_team and status = 'closed'
      order by closed_at desc nulls last limit 1)
  );
  -- Anti-surveillance gate: keep the dynamic list, but mask the aggregate
  -- VALUES until at least 3 distinct people have responded.
  select count(distinct respondent_id) into v_n
  from public.pulse_response where pulse_id = v_pulse;
  return query
    select db.dynamic, db.label, db.question,
           case when coalesce(v_n,0) >= 3
                then round(avg((pr.score - 1) / 4.0 * 100)::numeric, 0) end as pct,
           case when coalesce(v_n,0) >= 3 then count(pr.*)::int else 0 end as responses,
           db.target_low, db.target_high,
           case when coalesce(v_n,0) >= 3
                then (avg((pr.score - 1) / 4.0 * 100) between db.target_low and db.target_high) end as in_band
    from public.dynamic_band db
    left join public.pulse_response pr
      on pr.dynamic = db.dynamic and pr.pulse_id = v_pulse
    group by db.dynamic, db.label, db.question, db.target_low, db.target_high, db.ord
    order by db.ord;
end;
$$;

-- Five Behaviours (Lencioni / Wiley Five Behaviors(R) is a licensed product)
update public.template set
  name = 'Trust & Accountability Ladder',
  source = 'OwnTheAgenda original · grounded in Edmondson (1999), Sull et al. (2015)',
  description = 'Climb from safety to accountability: build trust, make conflict productive, get clear commitments, and own results together.'
where key = 'five-beh' and workspace_id is null;

-- Team Health Monitor (Atlassian's is their proprietary content)
update public.template set
  name = 'Team Health Check',
  source = 'OwnTheAgenda original · grounded in Edmondson (1999), Sull et al. (2015)',
  description = 'Rate where the team feels strong today, talk through the gaps, and pick two to improve.'
where key = 'health' and workspace_id is null;
