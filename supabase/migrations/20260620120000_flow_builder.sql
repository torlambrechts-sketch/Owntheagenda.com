-- =====================================================================
-- Flow Builder — Phase B. Make the Flow editable as a sequence of nodes:
-- add / remove / reorder steps, and add a branch node that picks one of
-- two workshop templates based on a pulse dynamic (e.g. "if psychological
-- safety < 3 run the safety workshop, else the strategy one"). Branch
-- resolution reuses the Play auto-build: the branch sets the program's
-- auto workshop template, then the workshop step builds itself.
-- =====================================================================

-- Allow the branch kind and give every step a config bag for node settings.
alter table public.program_step
  add column if not exists config jsonb not null default '{}'::jsonb;

alter table public.program_step drop constraint if exists program_step_kind_check;
alter table public.program_step add constraint program_step_kind_check
  check (kind in ('assessment','launch','interpret','workshop','commit','repulse','branch','custom'));

-- ---- builder: add a step after a given ordinal -----------------------
create or replace function public.program_add_step(
  p_program uuid, p_after_ord int, p_kind text, p_title text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_id uuid; v_at int;
begin
  select workspace_id into v_ws from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if p_kind not in ('assessment','launch','interpret','workshop','commit','repulse','branch','custom') then
    raise exception 'bad kind' using errcode = '22023';
  end if;
  v_at := greatest(0, coalesce(p_after_ord, 0));
  update public.program_step set ord = ord + 1
    where program_id = p_program and ord > v_at;
  insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
  values (p_program, v_ws, v_at + 1, p_kind, coalesce(nullif(btrim(p_title), ''), initcap(p_kind)),
          'pending', case when p_kind = 'branch' then 'Routes to a workshop based on the results' else null end)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---- builder: remove a step (only while pending/active) --------------
create or replace function public.program_remove_step(p_step uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_program uuid; v_ord int; v_status text;
begin
  select s.workspace_id, s.program_id, s.ord, s.status
    into v_ws, v_program, v_ord, v_status from public.program_step s where s.id = p_step;
  if v_program is null then raise exception 'no such step' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_status = 'done' then raise exception 'cannot remove a completed step' using errcode = '42501'; end if;

  delete from public.program_step where id = p_step;
  update public.program_step set ord = ord - 1 where program_id = v_program and ord > v_ord;
end;
$$;

-- ---- builder: move a step up (-1) or down (+1) -----------------------
create or replace function public.program_move_step(p_step uuid, p_dir int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_program uuid; v_ord int; v_other uuid; v_oord int;
begin
  select s.workspace_id, s.program_id, s.ord
    into v_ws, v_program, v_ord from public.program_step s where s.id = p_step;
  if v_program is null then raise exception 'no such step' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if p_dir not in (-1, 1) then raise exception 'bad direction' using errcode = '22023'; end if;

  v_oord := v_ord + p_dir;
  select id into v_other from public.program_step where program_id = v_program and ord = v_oord;
  if v_other is null then return; end if;  -- already at an end

  update public.program_step set ord = -1 where id = p_step;          -- park (ord is unique-ish per program)
  update public.program_step set ord = v_ord where id = v_other;
  update public.program_step set ord = v_oord where id = p_step;
end;
$$;

-- ---- builder: configure a branch node --------------------------------
-- Condition: avg score of p_dynamic across the program's pulse, compared
-- with p_value using p_op ('lt' or 'gte'); true → then template, else → else.
create or replace function public.program_set_branch(
  p_step uuid, p_dynamic text, p_op text, p_value numeric,
  p_then_template uuid, p_else_template uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_kind text;
begin
  select s.workspace_id, s.kind into v_ws, v_kind from public.program_step s where s.id = p_step;
  if v_ws is null then raise exception 'no such step' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_kind <> 'branch' then raise exception 'not a branch step' using errcode = '22023'; end if;
  if p_dynamic not in ('psych_safety','trust','conflict_norms','role_clarity','decision_rights') then
    raise exception 'bad dynamic' using errcode = '22023';
  end if;
  if p_op not in ('lt','gte') then raise exception 'bad operator' using errcode = '22023'; end if;

  update public.program_step set config = jsonb_build_object(
    'dynamic', p_dynamic, 'op', p_op, 'value', p_value,
    'then_template', p_then_template, 'else_template', p_else_template
  ) where id = p_step;
end;
$$;

-- Average score for a dynamic across a pulse (null when no responses).
create or replace function private.program_branch_value(p_pulse uuid, p_dynamic text)
returns numeric language sql stable security definer set search_path = '' as $$
  select avg(score)::numeric from public.pulse_response
  where pulse_id = p_pulse and dynamic = p_dynamic::public.team_dynamic;
$$;

-- Resolve an active branch step: evaluate the condition, set the program's
-- auto workshop template to the winning side, then advance past the branch so
-- the workshop step auto-builds with that template.
create or replace function private.program_resolve_branch(p_program uuid, p_step uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; v_pulse uuid; v_val numeric; v_pick uuid; v_ord int; v_true boolean;
begin
  select config, ord into cfg, v_ord from public.program_step where id = p_step;
  if cfg is null or cfg = '{}'::jsonb or (cfg ->> 'then_template') is null then return; end if;

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and ref_id is not null limit 1;
  v_val := private.program_branch_value(v_pulse, cfg ->> 'dynamic');

  -- Null (no data) is treated as not meeting a "less than" test.
  if (cfg ->> 'op') = 'lt' then
    v_true := v_val is not null and v_val < (cfg ->> 'value')::numeric;
  else
    v_true := v_val is not null and v_val >= (cfg ->> 'value')::numeric;
  end if;
  v_pick := case when v_true then (cfg ->> 'then_template')::uuid else (cfg ->> 'else_template')::uuid end;

  update public.program set auto_workshop_template = v_pick where id = p_program;

  -- Advance past the branch; opening the next step triggers the workshop build.
  update public.program_step set status = 'done', completed_at = now() where id = p_step;
  update public.program_step set status = 'active'
    where program_id = p_program and ord = v_ord + 1 and status = 'pending';
  update public.program set current_ord = v_ord + 1 where id = p_program;
  perform private.program_on_activate(p_program);
end;
$$;

-- Extend the on-activate dispatcher: resolve a branch if the freshly-opened
-- step is one, otherwise fall back to the workshop auto-build.
create or replace function private.program_on_activate(p_program uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_step uuid; v_kind text;
begin
  select id, kind into v_step, v_kind from public.program_step
    where program_id = p_program and status = 'active'
    order by ord limit 1;
  if v_step is null then return; end if;
  if v_kind = 'branch' then
    perform private.program_resolve_branch(p_program, v_step);
  else
    perform private.program_autobuild(p_program);
  end if;
end;
$$;

grant execute on function
  public.program_add_step(uuid, int, text, text),
  public.program_remove_step(uuid),
  public.program_move_step(uuid, int),
  public.program_set_branch(uuid, text, text, numeric, uuid, uuid)
to authenticated;
revoke execute on function
  public.program_add_step(uuid, int, text, text),
  public.program_remove_step(uuid),
  public.program_move_step(uuid, int),
  public.program_set_branch(uuid, text, text, numeric, uuid, uuid)
from public, anon;
