-- =====================================================================
-- Plays — Phase C. A Play is a one-click Flow with the workshop already
-- chosen: open the pulse now, and the moment the response threshold is
-- met, build the workshop automatically from the Play's template. This
-- adds (1) an internal, authz-free workshop spawner reused by the
-- auto-build path, (2) auto-build wired into BOTH advance paths (the gate
-- trigger and the manual "Start workshop now" override), and (3) the
-- start_play RPC that stands the whole thing up.
-- =====================================================================

-- Resolve a template by key, preferring a workspace-local override over the
-- global (workspace_id is null) template of the same key.
create or replace function private.template_id_by_key(p_ws uuid, p_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.template
  where key = p_key and (workspace_id = p_ws or workspace_id is null)
  order by (workspace_id is not null) desc
  limit 1;
$$;

-- Internal workshop spawn: insert the workshop + its blocks from a template,
-- with no authz checks (callers are system-initiated: the gate trigger runs
-- as a pulse respondent, who is not necessarily a manager). Mirrors the body
-- of create_workshop_from_template minus the privilege gate.
create or replace function private.spawn_workshop(
  p_team uuid, p_template uuid, p_title text, p_pulse uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_def jsonb; v_tname text; v_id uuid;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null then return null; end if;
  select definition, name into v_def, v_tname from public.template
  where id = p_template and (workspace_id is null or workspace_id = v_ws);
  if v_def is null then return null; end if;

  insert into public.workshop (team_id, title, template_id, pulse_id, created_by)
  values (p_team, coalesce(nullif(btrim(p_title), ''), v_tname), p_template, p_pulse, (select auth.uid()))
  returning id into v_id;

  insert into public.block (workshop_id, ord, title, activity_type, duration, prompt, linked_dynamic, config)
  select v_id, ph.ord,
         coalesce(ph.elem ->> 'title', 'Step'),
         coalesce((ph.elem ->> 'type')::public.activity_type, 'canvas'),
         coalesce((ph.elem ->> 'minutes')::int, 10),
         ph.elem ->> 'prompt',
         (ph.elem ->> 'dynamic')::public.team_dynamic,
         coalesce(ph.elem -> 'config', '{}'::jsonb)
  from jsonb_array_elements(coalesce(v_def -> 'phases', '[]'::jsonb)) with ordinality as ph(elem, ord);
  return v_id;
end;
$$;

-- If a program has an auto workshop template and its workshop step is active
-- and not yet linked, build the workshop now and link the step. Idempotent.
create or replace function private.program_autobuild(p_program uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_tmpl uuid; v_title text; v_pulse uuid; v_step uuid; v_wk uuid;
begin
  select team_id, auto_workshop_template, title
    into v_team, v_tmpl, v_title from public.program where id = p_program;
  if v_tmpl is null or v_team is null then return; end if;

  select id into v_step from public.program_step
    where program_id = p_program and kind = 'workshop' and status = 'active' and ref_id is null
    limit 1;
  if v_step is null then return; end if;

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and ref_id is not null limit 1;

  v_wk := private.spawn_workshop(v_team, v_tmpl, v_title, v_pulse);
  if v_wk is not null then
    update public.program_step set ref_table = 'workshop', ref_id = v_wk where id = v_step;
  end if;
end;
$$;

-- Dispatcher run whenever a program opens its next step. Phase C handles the
-- workshop auto-build; Phase B extends this to also resolve branch steps. Kept
-- as a thin seam so the advance functions below are written once.
create or replace function private.program_on_activate(p_program uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.program_autobuild(p_program);
end;
$$;

-- Re-create the gate advance to run the on-activate dispatcher when it opens
-- the next step (auto-builds the workshop for Plays).
create or replace function private.program_gate_advance(p_step uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_program uuid; v_ord int; v_max int; v_ws uuid; v_owner uuid; v_title text; v_next text; v_body text;
begin
  select program_id, ord, workspace_id into v_program, v_ord, v_ws
    from public.program_step where id = p_step and status = 'active';
  if v_program is null then return; end if;

  update public.program_step set status = 'done', completed_at = now() where id = p_step;
  update public.program_step set status = 'active'
    where program_id = v_program and ord = v_ord + 1 and status = 'pending';
  update public.program set current_ord = v_ord + 1 where id = v_program;

  perform private.program_on_activate(v_program);

  select max(ord) into v_max from public.program_step where program_id = v_program;
  if v_ord >= v_max then
    update public.program set status = 'completed' where id = v_program;
  end if;

  select created_by, title into v_owner, v_title from public.program where id = v_program;
  if v_owner is not null then
    if v_ord >= v_max then
      v_body := '"' || v_title || '" is complete.';
    else
      select title into v_next from public.program_step where program_id = v_program and ord = v_ord + 1;
      v_body := '"' || v_title || '" advanced to ' || coalesce(v_next, 'the next stage') || '.';
    end if;
    perform private.notify(v_ws, v_owner, 'program', 'Workflow advanced', v_body, '/workflow', 'program', v_program);
  end if;
end;
$$;

-- Re-create set_program_step so the manual "Start workshop now" override
-- also auto-builds the workshop for Plays.
create or replace function public.set_program_step(
  p_step uuid, p_status text,
  p_ref_table text default null, p_ref_id uuid default null,
  p_scheduled_at timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_program uuid; v_workspace uuid; v_ord int; v_max int;
begin
  select program_id, workspace_id, ord into v_program, v_workspace, v_ord
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
    update public.program_step set status = 'active'
      where program_id = v_program and ord = v_ord + 1 and status = 'pending';
    update public.program set current_ord = v_ord + 1 where id = v_program;
    perform private.program_on_activate(v_program);
    select max(ord) into v_max from public.program_step where program_id = v_program;
    if v_ord >= v_max then
      update public.program set status = 'completed' where id = v_program;
    end if;
  else
    update public.program set status = 'active' where id = v_program and status = 'completed';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- start_play — stand up a Play in one call: create the Flow with the
-- workshop pre-selected (auto_workshop_template), then open the pulse so
-- collection starts immediately. Returns the program id.
-- ---------------------------------------------------------------------
create or replace function public.start_play(
  p_workspace uuid, p_team uuid, p_play_key text, p_title text,
  p_workshop_template_key text, p_min_responses int default 4
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_tmpl uuid; v_n int := greatest(3, coalesce(p_min_responses, 4)); v_pulse uuid;
        v_title text := coalesce(nullif(btrim(p_title), ''), btrim(p_play_key));
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_team is null then raise exception 'team required' using errcode = '22023'; end if;
  v_tmpl := private.template_id_by_key(p_workspace, p_workshop_template_key);
  if v_tmpl is null then raise exception 'unknown workshop template' using errcode = '23503'; end if;

  insert into public.program (workspace_id, team_id, title, kind, min_responses, play_key, auto_workshop_template, created_by)
  values (p_workspace, p_team, v_title, 'flow', v_n, p_play_key, v_tmpl, (select auth.uid()))
  returning id into v_id;

  insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
  values
    (v_id, p_workspace, 1, 'assessment', 'Create assessment', 'active',  'Pick the instrument and audience'),
    (v_id, p_workspace, 2, 'launch',     'Collect responses',  'pending', 'Hold until ' || v_n || ' people respond'),
    (v_id, p_workspace, 3, 'workshop',   'Run workshop',       'pending', 'Auto-builds when the threshold is met');

  -- Open the pulse now (mirrors program_start_pulse) so the Play is live.
  insert into public.pulse (team_id, name, status, opened_at, created_by)
  values (p_team, v_title || ' pulse', 'open', now(), (select auth.uid()))
  returning id into v_pulse;

  update public.program_step set status = 'done', ref_table = 'pulse', ref_id = v_pulse, completed_at = now()
    where program_id = v_id and kind = 'assessment';
  update public.program_step set status = 'active', ref_table = 'pulse', ref_id = v_pulse
    where program_id = v_id and kind = 'launch';
  update public.program set current_ord = 2 where id = v_id;
  return v_id;
end;
$$;

grant execute on function public.start_play(uuid, uuid, text, text, text, int) to authenticated;
revoke execute on function public.start_play(uuid, uuid, text, text, text, int) from public, anon;
