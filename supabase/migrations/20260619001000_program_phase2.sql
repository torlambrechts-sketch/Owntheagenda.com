-- =====================================================================
-- Workflow / Program — Phase 2: wire the loop to real objects + auto-gate.
-- Spawn RPCs link each stage to an actual pulse / workshop / follow-up;
-- program_status reads the live state of those links; program_sync
-- advances any active step whose gate is met (pulse threshold reached,
-- workshop finished, re-pulse completed). Threshold = 3 distinct
-- respondents, the same privacy floor used everywhere else.
-- =====================================================================

-- Live state + readiness for every linked step of a program (read-only).
create or replace function public.program_status(p_program uuid)
returns table(step_id uuid, live text, ready boolean)
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.program where id = p_program;
  if v_ws is null then return; end if;
  if not private.is_workspace_member(v_ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
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
        (select count(distinct pr.respondent_id) from public.pulse_response pr where pr.pulse_id = s.ref_id) >= 3
      when 'workshop' then (select w.status from public.workshop w where w.id = s.ref_id) = 'done'
      when 'follow_up' then (select f.status from public.follow_up f where f.id = s.ref_id) = 'completed'
      else false
    end
  from public.program_step s
  where s.program_id = p_program and s.ref_id is not null;
end;
$$;

-- Advance every active step whose gate is met (reuses set_program_step).
create or replace function public.program_sync(p_program uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; r record;
begin
  select workspace_id into v_ws from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  for r in select * from public.program_status(p_program) loop
    if r.ready and exists (
      select 1 from public.program_step st where st.id = r.step_id and st.status = 'active'
    ) then
      perform public.set_program_step(r.step_id, 'done');
    end if;
  end loop;
end;
$$;

-- Start the pulse for the program's team: links the assessment + launch
-- steps to the new pulse, completes the assessment step and opens collection.
create or replace function public.program_start_pulse(p_program uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_pulse uuid;
begin
  select workspace_id, team_id into v_ws, v_team from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  insert into public.pulse (team_id, name, status, opened_at, created_by)
  values (v_team, coalesce(nullif(btrim(p_name), ''), 'Program pulse'), 'open', now(), (select auth.uid()))
  returning id into v_pulse;

  update public.program_step set status = 'done', ref_table = 'pulse', ref_id = v_pulse, completed_at = now()
    where program_id = p_program and kind = 'assessment';
  update public.program_step set status = 'active', ref_table = 'pulse', ref_id = v_pulse
    where program_id = p_program and kind = 'launch';
  update public.program set current_ord =
    coalesce((select ord from public.program_step where program_id = p_program and kind = 'launch'), current_ord)
    where id = p_program;
  return v_pulse;
end;
$$;

-- Build the linked workshop from a template (carrying the program's pulse),
-- completing the earlier stages and opening the workshop step.
create or replace function public.program_build_workshop(p_program uuid, p_template uuid, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_pulse uuid; v_wk uuid; v_word int;
begin
  select workspace_id, team_id into v_ws, v_team from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and ref_id is not null limit 1;
  select id into v_wk from public.create_workshop_from_template(v_team, p_template, p_title, v_pulse);

  select ord into v_word from public.program_step where program_id = p_program and kind = 'workshop';
  update public.program_step set status = 'done', completed_at = coalesce(completed_at, now())
    where program_id = p_program and ord < v_word and status not in ('done', 'skipped');
  update public.program_step set status = 'active', ref_table = 'workshop', ref_id = v_wk
    where program_id = p_program and kind = 'workshop';
  update public.program set current_ord = v_word where id = p_program;
  return v_wk;
end;
$$;

-- Schedule the re-measure follow-up for the program's team and open the
-- final step (completes anything still open before it).
create or replace function public.program_schedule_repulse(p_program uuid, p_when timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_f uuid; v_rord int;
begin
  select workspace_id, team_id into v_ws, v_team from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;

  insert into public.follow_up (workspace_id, team_id, kind, title, scheduled_at, status, created_by)
  values (v_ws, v_team, 'remeasure', 'Re-pulse', p_when, 'planned', (select auth.uid()))
  returning id into v_f;

  select ord into v_rord from public.program_step where program_id = p_program and kind = 'repulse';
  update public.program_step set status = 'done', completed_at = coalesce(completed_at, now())
    where program_id = p_program and ord < v_rord and status not in ('done', 'skipped');
  update public.program_step set status = 'active', ref_table = 'follow_up', ref_id = v_f, scheduled_at = p_when
    where program_id = p_program and kind = 'repulse';
  update public.program set current_ord = v_rord where id = p_program;
  return v_f;
end;
$$;

grant execute on function
  public.program_status(uuid),
  public.program_sync(uuid),
  public.program_start_pulse(uuid, text),
  public.program_build_workshop(uuid, uuid, text),
  public.program_schedule_repulse(uuid, timestamptz)
to authenticated;
revoke execute on function
  public.program_status(uuid),
  public.program_sync(uuid),
  public.program_start_pulse(uuid, text),
  public.program_build_workshop(uuid, uuid, text),
  public.program_schedule_repulse(uuid, timestamptz)
from public, anon;
