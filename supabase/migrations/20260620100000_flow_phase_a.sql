-- =====================================================================
-- Flows — Phase A. A "Flow" is the focused three-stage pattern the team
-- runs most: assessment → collect responses (the readiness gate) →
-- workshop. It reuses the existing program engine (same table, steps,
-- gate triggers) so nothing is duplicated; a Flow is just a program with
-- kind='flow' and three seeded steps. This migration also makes the
-- response threshold configurable per program (never below the privacy
-- floor of 3), surfaces the live response count/target for the readiness
-- gate UI, and adds a "remind non-responders" action.
-- =====================================================================

-- ---- program: flavour + configurable gate ---------------------------
alter table public.program
  add column if not exists kind text not null default 'program'
    check (kind in ('program','flow')),
  add column if not exists min_responses int not null default 3
    check (min_responses >= 3),
  add column if not exists play_key text,
  add column if not exists auto_workshop_template uuid
    references public.template(id) on delete set null;

-- Effective gate for a program: the configured threshold, never below the
-- privacy floor of 3 distinct respondents used everywhere else.
create or replace function private.program_threshold(p_program uuid)
returns int language sql stable security definer set search_path = '' as $$
  select greatest(3, coalesce((select min_responses from public.program where id = p_program), 3));
$$;

-- ---------------------------------------------------------------------
-- Create a Flow: assessment → collect (gate) → workshop. Three steps,
-- same engine. p_min_responses is clamped to the privacy floor.
-- ---------------------------------------------------------------------
create or replace function public.create_flow(
  p_workspace uuid, p_title text, p_team uuid default null, p_min_responses int default 3
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int := greatest(3, coalesce(p_min_responses, 3));
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required' using errcode = '22023';
  end if;
  insert into public.program (workspace_id, team_id, title, kind, min_responses, created_by)
  values (p_workspace, p_team, btrim(p_title), 'flow', v_n, (select auth.uid()))
  returning id into v_id;

  insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
  values
    (v_id, p_workspace, 1, 'assessment', 'Create assessment',  'active',
       'Pick the instrument and audience'),
    (v_id, p_workspace, 2, 'launch',     'Collect responses',   'pending',
       'Hold until ' || v_n || ' people respond'),
    (v_id, p_workspace, 3, 'workshop',   'Run workshop',        'pending',
       'Build and run the session on the results');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- program_status — now also returns the live response count and the
-- target for the readiness gate. Re-created with the wider signature
-- (drop first because the return type changes).
-- ---------------------------------------------------------------------
drop function if exists public.program_status(uuid);
create function public.program_status(p_program uuid)
returns table(step_id uuid, live text, ready boolean, done int, target int)
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_target int;
begin
  select workspace_id into v_ws from public.program where id = p_program;
  if v_ws is null then return; end if;
  if not private.is_workspace_member(v_ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_target := private.program_threshold(p_program);
  return query
  select s.id,
    case s.ref_table
      when 'pulse' then (
        select 'Pulse ' || p.status || ' · ' ||
               (select count(distinct pr.respondent_id) from public.pulse_response pr where pr.pulse_id = s.ref_id) ||
               ' responses'
        from public.pulse p where p.id = s.ref_id)
      when 'workshop' then (select 'Workshop · ' || w.status from public.workshop w where w.id = s.ref_id)
      when 'follow_up' then (
        select 'Re-pulse · ' || coalesce(to_char(f.scheduled_at, 'Mon DD'), f.status)
        from public.follow_up f where f.id = s.ref_id)
      else null
    end,
    case s.ref_table
      when 'pulse' then
        (select count(distinct pr.respondent_id) from public.pulse_response pr where pr.pulse_id = s.ref_id) >= v_target
      when 'workshop' then (select w.status from public.workshop w where w.id = s.ref_id) = 'done'
      when 'follow_up' then (select f.status from public.follow_up f where f.id = s.ref_id) = 'completed'
      else false
    end,
    case s.ref_table
      when 'pulse' then
        (select count(distinct pr.respondent_id)::int from public.pulse_response pr where pr.pulse_id = s.ref_id)
      else null
    end,
    case s.ref_table when 'pulse' then v_target else null end
  from public.program_step s
  where s.program_id = p_program and s.ref_id is not null;
end;
$$;

-- ---------------------------------------------------------------------
-- The gate trigger now honours the per-program threshold instead of a
-- hardcoded 3. Existing programs keep the default (3) so behaviour is
-- unchanged for them.
-- ---------------------------------------------------------------------
create or replace function private.program_on_pulse_response() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_step uuid; v_program uuid; v_target int;
begin
  select s.id, s.program_id into v_step, v_program from public.program_step s
    where s.ref_table = 'pulse' and s.ref_id = new.pulse_id and s.status = 'active'
    limit 1;
  if v_step is null then return new; end if;
  v_target := private.program_threshold(v_program);
  if (select count(distinct respondent_id) from public.pulse_response where pulse_id = new.pulse_id) >= v_target then
    perform private.program_gate_advance(v_step);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Nudge the people on the program's team who have not yet responded to
-- the currently-collecting pulse. Returns how many reminders were sent.
-- ---------------------------------------------------------------------
create or replace function public.flow_remind(p_program uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_title text; v_pulse uuid; v_count int := 0; r record;
begin
  select workspace_id, team_id, title into v_ws, v_team, v_title from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and status = 'active' limit 1;
  if v_pulse is null then return 0; end if;

  for r in
    select tm.user_id from public.team_member tm
    where tm.team_id = v_team
      and tm.user_id not in (
        select distinct pr.respondent_id from public.pulse_response pr
        where pr.pulse_id = v_pulse and pr.respondent_id is not null)
  loop
    perform private.notify(v_ws, r.user_id, 'pulse_reminder',
      'Your response is needed',
      'Please complete the pulse for "' || v_title || '".',
      '/assessments', 'program', p_program);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function
  public.create_flow(uuid, text, uuid, int),
  public.flow_remind(uuid),
  public.program_status(uuid)
to authenticated;
revoke execute on function
  public.create_flow(uuid, text, uuid, int),
  public.flow_remind(uuid),
  public.program_status(uuid)
from public, anon;
