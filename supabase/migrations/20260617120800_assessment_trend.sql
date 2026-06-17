-- =====================================================================
-- OwnTheAgenda · 0008 · Assessment trend + participation (re-measure loop)
-- ---------------------------------------------------------------------
-- * team_dynamics now reflects the latest CLOSED pulse (finalized), so an
--   in-progress open pulse doesn't disturb "where the team sits today".
-- * team_dynamics_history returns per-dynamic pct across recent closed
--   pulses — the basis for the trend / "re-measure" movement.
-- * pulse_participation reveals WHO has responded (counts only, never
--   scores), for a lead/admin chasing completion.
-- * remind_pulse logs a reminder (real delivery is a later integration).
-- =====================================================================

create or replace function public.team_dynamics(p_team uuid, p_pulse uuid default null)
returns table (
  dynamic public.team_dynamic, label text, question text,
  pct numeric, responses int, target_low int, target_high int, in_band boolean
) language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_pulse uuid;
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
  return query
    select db.dynamic, db.label, db.question,
           round(avg((pr.score - 1) / 4.0 * 100)::numeric, 0) as pct,
           count(pr.*)::int as responses,
           db.target_low, db.target_high,
           (avg((pr.score - 1) / 4.0 * 100) between db.target_low and db.target_high) as in_band
    from public.dynamic_band db
    left join public.pulse_response pr
      on pr.dynamic = db.dynamic and pr.pulse_id = v_pulse
    group by db.dynamic, db.label, db.question, db.target_low, db.target_high, db.ord
    order by db.ord;
end;
$$;

-- Per-dynamic pct across the most recent closed pulses (oldest -> newest).
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
      select id, name, closed_at from public.pulse
      where team_id = p_team and status = 'closed'
      order by closed_at desc nulls last
      limit greatest(p_limit, 1)
    )
    select r.id, r.name, r.closed_at, db.dynamic, db.label,
           round(avg((pr.score - 1) / 4.0 * 100)::numeric, 0) as pct,
           db.target_low, db.target_high
    from recent r
    cross join public.dynamic_band db
    left join public.pulse_response pr on pr.pulse_id = r.id and pr.dynamic = db.dynamic
    group by r.id, r.name, r.closed_at, db.dynamic, db.label, db.target_low, db.target_high, db.ord
    order by r.closed_at asc nulls first, db.ord asc;
end;
$$;

-- Participation for a pulse: counts only (never scores). Lead/admin only.
create or replace function public.pulse_participation(p_pulse uuid)
returns table (user_id uuid, answered int, completed boolean)
language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.pulse where id = p_pulse;
  if v_team is null or not private.can_manage_team(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select tm.user_id, coalesce(c.answered, 0)::int, (coalesce(c.answered, 0) >= 5)
    from public.team_member tm
    left join (
      select respondent_id, count(distinct dynamic) as answered
      from public.pulse_response where pulse_id = p_pulse group by respondent_id
    ) c on c.respondent_id = tm.user_id
    where tm.team_id = v_team;
end;
$$;

-- Log a reminder for pending responders. Returns the pending count.
create or replace function public.remind_pulse(p_pulse uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_ws uuid; v_pending int;
begin
  select p.team_id, p.workspace_id into v_team, v_ws from public.pulse p where p.id = p_pulse;
  if v_team is null or not private.can_manage_team(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select count(*) into v_pending from public.team_member tm
  where tm.team_id = v_team
    and (select count(distinct dynamic) from public.pulse_response pr
         where pr.pulse_id = p_pulse and pr.respondent_id = tm.user_id) < 5;
  perform private.write_audit(v_ws, (select auth.uid()), 'pulse.reminded', 'pulse', p_pulse,
                              jsonb_build_object('pending', v_pending));
  return v_pending;
end;
$$;

grant execute on function
  public.team_dynamics_history(uuid, int),
  public.pulse_participation(uuid),
  public.remind_pulse(uuid)
to authenticated;
revoke execute on function
  public.team_dynamics_history(uuid, int),
  public.pulse_participation(uuid),
  public.remind_pulse(uuid)
from public, anon;
