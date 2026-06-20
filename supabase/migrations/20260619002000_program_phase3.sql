-- =====================================================================
-- Workflow / Program — Phase 3: advance with zero user action.
-- Database triggers fire the moment a gate is met — a pulse crosses the
-- response threshold, a workshop finishes, a re-pulse is completed — so
-- the program advances on its own and notifies the owner. No page visit
-- or Refresh required. The triggers run SECURITY DEFINER, so the member
-- who triggered the event (e.g. a pulse respondent) advances the program
-- even though they are not an admin.
-- =====================================================================

-- Speeds up the per-event "is this object linked to an active step?" lookup.
create index if not exists program_step_ref_idx on public.program_step(ref_table, ref_id);

-- Internal advance: complete an active step, open the next, bump the cursor,
-- complete the program on the last step, and notify the owner. No authz — only
-- called from the gate triggers below.
create or replace function private.program_gate_advance(p_step uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_program uuid; v_ord int; v_max int; v_ws uuid; v_owner uuid; v_title text; v_next text; v_body text;
begin
  select program_id, ord, workspace_id into v_program, v_ord, v_ws
    from public.program_step where id = p_step and status = 'active';
  if v_program is null then return; end if;  -- not active → nothing to advance

  update public.program_step set status = 'done', completed_at = now() where id = p_step;
  update public.program_step set status = 'active'
    where program_id = v_program and ord = v_ord + 1 and status = 'pending';
  update public.program set current_ord = v_ord + 1 where id = v_program;

  select max(ord) into v_max from public.program_step where program_id = v_program;
  if v_ord >= v_max then
    update public.program set status = 'completed' where id = v_program;
  end if;

  select created_by, title into v_owner, v_title from public.program where id = v_program;
  if v_owner is not null then
    if v_ord >= v_max then
      v_body := '"' || v_title || '" is complete.';
    else
      select s.title into v_next from public.program_step where program_id = v_program and ord = v_ord + 1;
      v_body := '"' || v_title || '" advanced to ' || coalesce(v_next, 'the next stage') || '.';
    end if;
    perform private.notify(v_ws, v_owner, 'program', 'Workflow advanced', v_body, '/workflow', 'program', v_program);
  end if;
end;
$$;

-- Pulse threshold reached (>=3 distinct respondents) → advance the launch step.
create or replace function private.program_on_pulse_response() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_step uuid;
begin
  select s.id into v_step from public.program_step s
    where s.ref_table = 'pulse' and s.ref_id = new.pulse_id and s.status = 'active'
    limit 1;
  if v_step is null then return new; end if;
  if (select count(distinct respondent_id) from public.pulse_response where pulse_id = new.pulse_id) >= 3 then
    perform private.program_gate_advance(v_step);
  end if;
  return new;
end;
$$;
drop trigger if exists program_pulse_response_gate on public.pulse_response;
create trigger program_pulse_response_gate after insert on public.pulse_response
  for each row execute function private.program_on_pulse_response();

-- Workshop finished → advance the workshop step.
create or replace function private.program_on_workshop_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_step uuid;
begin
  if new.status <> 'done' or old.status is not distinct from 'done' then return new; end if;
  select s.id into v_step from public.program_step s
    where s.ref_table = 'workshop' and s.ref_id = new.id and s.status = 'active'
    limit 1;
  if v_step is not null then perform private.program_gate_advance(v_step); end if;
  return new;
end;
$$;
drop trigger if exists program_workshop_status_gate on public.workshop;
create trigger program_workshop_status_gate after update of status on public.workshop
  for each row execute function private.program_on_workshop_status();

-- Re-pulse follow-up completed → advance (and complete) the program.
create or replace function private.program_on_follow_up_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_step uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then return new; end if;
  select s.id into v_step from public.program_step s
    where s.ref_table = 'follow_up' and s.ref_id = new.id and s.status = 'active'
    limit 1;
  if v_step is not null then perform private.program_gate_advance(v_step); end if;
  return new;
end;
$$;
drop trigger if exists program_follow_up_status_gate on public.follow_up;
create trigger program_follow_up_status_gate after update of status on public.follow_up
  for each row execute function private.program_on_follow_up_status();
