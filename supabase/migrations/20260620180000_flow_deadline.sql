-- =====================================================================
-- Flow deadline — Phase I. A Flow must stay time-bound: every driver task
-- already carries a specific due time, and now the Flow itself gets a
-- due_at (the latest of its task due dates) so it can be tracked and flagged
-- overdue rather than quietly stalling. seed_program_tasks stamps it on
-- create; existing flows are backfilled.
-- =====================================================================

alter table public.program add column if not exists due_at timestamptz;

create or replace function private.seed_program_tasks(p_program uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_owner uuid; v_cd int; v_name text;
begin
  select workspace_id, created_by, collect_days into v_ws, v_owner, v_cd
    from public.program where id = p_program;
  if v_ws is null then return; end if;
  v_cd := greatest(1, coalesce(v_cd, 7));
  select coalesce(full_name, display_name, email) into v_name from public.profile where id = v_owner;

  if exists (select 1 from public.program_step where program_id = p_program and kind = 'assessment') then
    insert into public.program_task (program_id, workspace_id, step_id, kind, title, owner_id, owner_name, due_at)
    select p_program, v_ws, s.id, 'push_assessment', 'Send the assessment to the team', v_owner, v_name, now()
      from public.program_step s where s.program_id = p_program and s.kind = 'assessment' order by s.ord limit 1;
  end if;
  if exists (select 1 from public.program_step where program_id = p_program and kind = 'launch') then
    insert into public.program_task (program_id, workspace_id, step_id, kind, title, owner_id, owner_name, due_at)
    select p_program, v_ws, s.id, 'collect', 'Collect responses (' || v_cd || ' days)', v_owner, v_name,
           now() + (v_cd || ' days')::interval
      from public.program_step s where s.program_id = p_program and s.kind = 'launch' order by s.ord limit 1;
  end if;
  if exists (select 1 from public.program_step where program_id = p_program and kind = 'workshop') then
    insert into public.program_task (program_id, workspace_id, step_id, kind, title, owner_id, owner_name, due_at)
    select p_program, v_ws, s.id, 'workshop', 'Run the workshop on the results', v_owner, v_name,
           now() + ((v_cd + 3) || ' days')::interval
      from public.program_step s where s.program_id = p_program and s.kind = 'workshop' order by s.ord limit 1;
  end if;
  if exists (select 1 from public.program_step where program_id = p_program and kind = 'repulse') then
    insert into public.program_task (program_id, workspace_id, step_id, kind, title, owner_id, owner_name, due_at)
    select p_program, v_ws, s.id, 'repulse', 'Re-pulse the team', v_owner, v_name,
           now() + ((v_cd + 45) || ' days')::interval
      from public.program_step s where s.program_id = p_program and s.kind = 'repulse' order by s.ord limit 1;
  end if;

  -- The flow's own deadline = the latest task due.
  update public.program set due_at = (
    select max(due_at) from public.program_task where program_id = p_program
  ) where id = p_program;
end;
$$;

-- Backfill any existing flow without a deadline: the latest task due if it has
-- tasks, otherwise a computed fallback from its creation date + windows.
update public.program p set due_at = coalesce(
  (select max(due_at) from public.program_task t where t.program_id = p.id),
  p.created_at + ((coalesce(p.collect_days, 7) + 45) || ' days')::interval
) where p.due_at is null;
