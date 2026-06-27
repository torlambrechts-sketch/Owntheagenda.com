-- Reorder a flow's steps in one call (drag-and-drop on the flow canvas).
-- Mirrors program_move_step's guards (admins only) and its parking trick to
-- avoid colliding with the per-program unique ord while reassigning.

create or replace function public.program_reorder_steps(p_program uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; i int;
begin
  select workspace_id into v_ws from public.program where id = p_program;
  if v_ws is null then raise exception 'no such program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;

  -- The id set must be exactly this program's steps — no partial reorders.
  if (select count(*) from public.program_step where program_id = p_program) <> coalesce(array_length(p_ids, 1), 0)
     or exists (
       select 1 from unnest(p_ids) x
       where not exists (select 1 from public.program_step s where s.id = x and s.program_id = p_program)
     ) then
    raise exception 'id set does not match program steps' using errcode = '22023';
  end if;

  -- Park to negatives (still unique) so the new 1..n assignment can't collide.
  update public.program_step set ord = -ord where program_id = p_program;
  for i in 1 .. array_length(p_ids, 1) loop
    update public.program_step set ord = i, updated_at = now() where id = p_ids[i];
  end loop;
end;
$$;

grant execute on function public.program_reorder_steps(uuid, uuid[]) to authenticated;
