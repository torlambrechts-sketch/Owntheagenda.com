-- Two new flow node kinds — `score` (compute results from the responses) and
-- `report` (share / publish the results) — from the Flow Builder design. Extend
-- the kind check constraint and program_add_step's guard (program_add_step is
-- the on-canvas "add step" path; the quick composer keeps its own set).

alter table public.program_step drop constraint if exists program_step_kind_check;
alter table public.program_step add constraint program_step_kind_check
  check (kind in ('assessment','launch','interpret','workshop','commit','repulse','branch','score','report','custom'));

create or replace function public.program_add_step(
  p_program uuid, p_after_ord int, p_kind text, p_title text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_id uuid; v_at int;
begin
  select workspace_id into v_ws from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if p_kind not in ('assessment','launch','interpret','workshop','commit','repulse','branch','score','report','custom') then
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
