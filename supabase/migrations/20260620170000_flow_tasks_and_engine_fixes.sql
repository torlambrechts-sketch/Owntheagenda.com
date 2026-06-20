-- =====================================================================
-- Flow internal tasks + engine hardening — Phase H.
--
-- Engine fixes (senior review):
--   F1. Advancing only ever opened ord+1. If that step was already done or
--       skipped (after edits / manual skips) the flow stalled with no active
--       step. Now we open the NEXT PENDING step (min ord > current) and only
--       complete the program when none remain. Applied to the gate trigger,
--       the manual set_program_step, and branch resolution via a shared
--       private.program_open_next().
--   F2. flow_remind only handled pulse-backed flows; survey-backed flows
--       reminded nobody. Now it handles both.
--
-- Internal tasks: a Flow seeds driver tasks (push assessment, collect by a
-- deadline, run the workshop, re-pulse) with an owner and due dates derived
-- from a configurable collect window. Each task auto-completes as its step
-- advances, and they surface as sub-rows under the flow in the table.
-- =====================================================================

-- ---- timeframe for collection ---------------------------------------
alter table public.program add column if not exists collect_days int not null default 7;

-- ---- program_task ----------------------------------------------------
create table if not exists public.program_task (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.program(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  step_id uuid references public.program_step(id) on delete set null,
  kind text not null check (kind in ('push_assessment','collect','workshop','repulse','action')),
  title text not null,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done','skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists program_task_program_idx on public.program_task(program_id, status);

drop trigger if exists program_task_updated_at on public.program_task;
create trigger program_task_updated_at before update on public.program_task
  for each row execute function private.set_updated_at();

alter table public.program_task enable row level security;
drop policy if exists program_task_read on public.program_task;
create policy program_task_read on public.program_task for select to authenticated
  using (private.is_workspace_member(workspace_id));
drop policy if exists program_task_write on public.program_task;
create policy program_task_write on public.program_task for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));
drop policy if exists program_task_update on public.program_task;
create policy program_task_update on public.program_task for update to authenticated
  using (private.is_workspace_admin(workspace_id)) with check (private.is_workspace_admin(workspace_id));
drop policy if exists program_task_delete on public.program_task;
create policy program_task_delete on public.program_task for delete to authenticated
  using (private.is_workspace_admin(workspace_id));

-- Map a step kind to the task it satisfies, and complete that task.
create or replace function private.complete_flow_task(p_program uuid, p_step_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tkind text := case p_step_kind
    when 'assessment' then 'push_assessment'
    when 'launch' then 'collect'
    when 'workshop' then 'workshop'
    when 'repulse' then 'repulse'
    else null end;
begin
  if v_tkind is null then return; end if;
  update public.program_task set status = 'done'
    where program_id = p_program and kind = v_tkind and status = 'open';
end;
$$;

-- Seed the driver tasks for a flow from its steps + collect window.
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
end;
$$;

-- ---- F1: open the next PENDING step (shared advance primitive) -------
create or replace function private.program_open_next(p_program uuid, p_after_ord int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ord int;
begin
  select id, ord into v_id, v_ord from public.program_step
    where program_id = p_program and ord > p_after_ord and status = 'pending'
    order by ord limit 1;
  if v_id is null then return false; end if;
  update public.program_step set status = 'active' where id = v_id;
  update public.program set current_ord = v_ord where id = p_program;
  perform private.program_on_activate(p_program);
  return true;
end;
$$;

-- Gate advance — complete the step + its task, open the next pending step.
create or replace function private.program_gate_advance(p_step uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_program uuid; v_ord int; v_ws uuid; v_kind text; v_owner uuid; v_title text; v_next text; v_body text; v_opened boolean;
begin
  select program_id, ord, workspace_id, kind into v_program, v_ord, v_ws, v_kind
    from public.program_step where id = p_step and status = 'active';
  if v_program is null then return; end if;

  update public.program_step set status = 'done', completed_at = now() where id = p_step;
  perform private.complete_flow_task(v_program, v_kind);

  v_opened := private.program_open_next(v_program, v_ord);
  if not v_opened then
    update public.program set status = 'completed' where id = v_program;
  end if;

  select created_by, title into v_owner, v_title from public.program where id = v_program;
  if v_owner is not null then
    if not v_opened then
      v_body := '"' || v_title || '" is complete.';
    else
      select title into v_next from public.program_step
        where program_id = v_program and status = 'active' order by ord limit 1;
      v_body := '"' || v_title || '" advanced to ' || coalesce(v_next, 'the next stage') || '.';
    end if;
    perform private.notify(v_ws, v_owner, 'program', 'Workflow advanced', v_body, '/workflow', 'program', v_program);
  end if;
end;
$$;

-- Manual advance — same next-pending semantics + task completion.
create or replace function public.set_program_step(
  p_step uuid, p_status text,
  p_ref_table text default null, p_ref_id uuid default null,
  p_scheduled_at timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_program uuid; v_workspace uuid; v_ord int; v_kind text;
begin
  select program_id, workspace_id, ord, kind into v_program, v_workspace, v_ord, v_kind
    from public.program_step where id = p_step;
  if v_program is null then raise exception 'no such step' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_status not in ('pending','active','done','skipped') then
    raise exception 'bad status' using errcode = '22023';
  end if;

  update public.program_step set
    status = p_status,
    ref_table = coalesce(p_ref_table, ref_table),
    ref_id = coalesce(p_ref_id, ref_id),
    scheduled_at = coalesce(p_scheduled_at, scheduled_at),
    completed_at = case when p_status = 'done' then now() else null end
  where id = p_step;

  if p_status in ('done', 'skipped') then
    if p_status = 'done' then perform private.complete_flow_task(v_program, v_kind); end if;
    if not private.program_open_next(v_program, v_ord) then
      update public.program set status = 'completed' where id = v_program;
    end if;
  else
    update public.program set status = 'active' where id = v_program and status = 'completed';
  end if;
end;
$$;

-- Branch resolution — advance via the shared next-pending primitive.
create or replace function private.program_resolve_branch(p_program uuid, p_step uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; v_pulse uuid; v_val numeric; v_pick uuid; v_ord int; v_true boolean; v_configured boolean;
begin
  select config, ord into cfg, v_ord from public.program_step where id = p_step;
  v_configured := cfg is not null and cfg <> '{}'::jsonb and (cfg ->> 'then_template') is not null;

  if v_configured then
    select ref_id into v_pulse from public.program_step
      where program_id = p_program and ref_table in ('pulse','survey') and ref_id is not null limit 1;
    v_val := private.program_branch_value(v_pulse, cfg ->> 'dynamic');
    if (cfg ->> 'op') = 'lt' then
      v_true := v_val is not null and v_val < (cfg ->> 'value')::numeric;
    else
      v_true := v_val is not null and v_val >= (cfg ->> 'value')::numeric;
    end if;
    v_pick := case when v_true then (cfg ->> 'then_template')::uuid else (cfg ->> 'else_template')::uuid end;
    update public.program set auto_workshop_template = v_pick where id = p_program;
  end if;

  update public.program_step set status = 'done', completed_at = now() where id = p_step;
  perform private.program_open_next(p_program, v_ord);
end;
$$;

-- ---- F2: flow_remind handles pulse AND survey ------------------------
create or replace function public.flow_remind(p_program uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_title text; v_rt text; v_ref uuid; v_count int := 0; r record;
begin
  select workspace_id, team_id, title into v_ws, v_team, v_title from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  select ref_table, ref_id into v_rt, v_ref from public.program_step
    where program_id = p_program and ref_table in ('pulse','survey') and status = 'active' limit 1;
  if v_ref is null then return 0; end if;

  for r in
    select tm.user_id from public.team_member tm
    where tm.team_id = v_team
      and (v_rt <> 'pulse' or tm.user_id not in (
        select distinct pr.respondent_id from public.pulse_response pr
        where pr.pulse_id = v_ref and pr.respondent_id is not null))
      and (v_rt <> 'survey' or tm.user_id not in (
        select distinct sr.respondent_id from public.survey_response sr
        where sr.survey_id = v_ref and sr.respondent_id is not null))
      and not exists (
        select 1 from public.notification n
        where n.user_id = tm.user_id and n.kind = 'pulse_reminder'
          and n.entity_type = 'program' and n.entity_id = p_program
          and n.created_at > now() - interval '6 hours')
  loop
    perform private.notify(v_ws, r.user_id, 'pulse_reminder',
      'Your response is needed',
      'Please complete the assessment for "' || v_title || '".',
      '/assessments', 'program', p_program);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---- create_flow_steps gains the collect window + seeds tasks --------
drop function if exists public.create_flow_steps(uuid, text, uuid, int, jsonb, text);
create function public.create_flow_steps(
  p_workspace uuid, p_title text, p_team uuid, p_min_responses int, p_steps jsonb,
  p_assessment_kind text default null, p_collect_days int default 7
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int := greatest(3, coalesce(p_min_responses, 3)); v_ord int := 0; r record;
        v_cd int := greatest(1, coalesce(p_collect_days, 7));
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required' using errcode = '22023';
  end if;
  if p_steps is null or jsonb_array_length(p_steps) = 0 then
    raise exception 'at least one step required' using errcode = '22023';
  end if;

  insert into public.program (workspace_id, team_id, title, kind, min_responses, assessment_kind, collect_days, created_by)
  values (p_workspace, p_team, btrim(p_title), 'flow', v_n, nullif(btrim(p_assessment_kind), ''), v_cd, (select auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_steps) with ordinality as e(elem, ord) loop
    if (r.elem ->> 'kind') not in
       ('assessment','launch','interpret','workshop','commit','repulse','branch','custom') then
      raise exception 'bad step kind: %', r.elem ->> 'kind' using errcode = '22023';
    end if;
    v_ord := v_ord + 1;
    insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
    values (
      v_id, p_workspace, v_ord, r.elem ->> 'kind',
      coalesce(nullif(btrim(r.elem ->> 'title'), ''), initcap(r.elem ->> 'kind')),
      case when v_ord = 1 then 'active' else 'pending' end,
      case (r.elem ->> 'kind')
        when 'launch' then 'Hold until ' || v_n || ' people respond'
        when 'branch' then 'Routes to a workshop based on the results'
        else null end
    );
  end loop;
  perform private.seed_program_tasks(v_id);
  return v_id;
end;
$$;

-- program_start_assessment also closes the push-assessment task.
create or replace function public.program_start_assessment(p_program uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_kind text; v_title text; v_ref uuid;
begin
  select workspace_id, team_id, assessment_kind, title into v_ws, v_team, v_kind, v_title
    from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  if coalesce(btrim(v_kind), '') = '' then
    v_ref := public.program_start_pulse(p_program, null);
  else
    select id into v_ref from public.create_survey(v_team, v_kind, coalesce(v_title, 'Flow assessment'), null);
    update public.program_step set status = 'done', ref_table = 'survey', ref_id = v_ref, completed_at = now()
      where program_id = p_program and kind = 'assessment';
    update public.program_step set status = 'active', ref_table = 'survey', ref_id = v_ref
      where program_id = p_program and kind = 'launch';
    update public.program set current_ord =
      coalesce((select ord from public.program_step where program_id = p_program and kind = 'launch'), current_ord)
      where id = p_program;
  end if;
  perform private.complete_flow_task(p_program, 'assessment');
  return v_ref;
end;
$$;

-- Seed tasks for Plays too.
create or replace function public.start_play(
  p_workspace uuid, p_team uuid, p_play_key text, p_title text,
  p_workshop_template_key text, p_min_responses int default 4, p_assessment_kind text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_tmpl uuid; v_n int := greatest(3, coalesce(p_min_responses, 4));
        v_title text := coalesce(nullif(btrim(p_title), ''), btrim(p_play_key));
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_team is null then raise exception 'team required' using errcode = '22023'; end if;
  v_tmpl := private.template_id_by_key(p_workspace, p_workshop_template_key);
  if v_tmpl is null then raise exception 'unknown workshop template' using errcode = '23503'; end if;

  insert into public.program (workspace_id, team_id, title, kind, min_responses, play_key,
                              auto_workshop_template, assessment_kind, created_by)
  values (p_workspace, p_team, v_title, 'flow', v_n, p_play_key, v_tmpl,
          nullif(btrim(p_assessment_kind), ''), (select auth.uid()))
  returning id into v_id;

  insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
  values
    (v_id, p_workspace, 1, 'assessment', 'Create assessment', 'active',  'Pick the instrument and audience'),
    (v_id, p_workspace, 2, 'launch',     'Collect responses',  'pending', 'Hold until ' || v_n || ' people respond'),
    (v_id, p_workspace, 3, 'workshop',   'Run workshop',       'pending', 'Auto-builds when the threshold is met');

  perform private.seed_program_tasks(v_id);
  perform public.program_start_assessment(v_id);
  return v_id;
end;
$$;

-- ---- task management RPCs --------------------------------------------
create or replace function public.set_flow_task(p_task uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.program_task where id = p_task;
  if v_ws is null then raise exception 'no such task' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if p_status not in ('open','done','skipped') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.program_task set status = p_status where id = p_task;
end;
$$;

create or replace function public.update_flow_task(
  p_task uuid, p_owner uuid default null, p_owner_name text default null,
  p_due timestamptz default null, p_title text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.program_task where id = p_task;
  if v_ws is null then raise exception 'no such task' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  update public.program_task set
    owner_id = coalesce(p_owner, owner_id),
    owner_name = coalesce(p_owner_name, owner_name),
    due_at = coalesce(p_due, due_at),
    title = coalesce(nullif(btrim(p_title), ''), title)
  where id = p_task;
end;
$$;

grant execute on function
  public.create_flow_steps(uuid, text, uuid, int, jsonb, text, int),
  public.set_flow_task(uuid, text),
  public.update_flow_task(uuid, uuid, text, timestamptz, text)
to authenticated;
revoke execute on function
  public.create_flow_steps(uuid, text, uuid, int, jsonb, text, int),
  public.set_flow_task(uuid, text),
  public.update_flow_task(uuid, uuid, text, timestamptz, text)
from public, anon;
