-- Carry a session's still-open plan forward into a follow-up's Outcome step:
-- copy todo/doing tasks (done ones drop off) with fresh ids, re-parenting
-- sub-tasks so the hierarchy survives. Both sessions must be readable by caller.
create or replace function public.seed_plan_from_session(p_source uuid, p_target uuid, p_block int)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not private.can_read_session(p_target) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.can_read_session(p_source) then raise exception 'forbidden' using errcode = '42501'; end if;
  with src as (
    select id, parent_id, title, owner_name, owner_id, start_date, end_date, status, ord
    from public.plan_task where session_id = p_source and status in ('todo','doing')
  ),
  m as (select id as old, gen_random_uuid() as new from src)
  insert into public.plan_task (id, session_id, block_ord, parent_id, title, owner_name, owner_id, start_date, end_date, status, ord)
  select m.new, p_target, p_block, mp.new, s.title, s.owner_name, s.owner_id, s.start_date, s.end_date, s.status, s.ord
  from src s
  join m on m.old = s.id
  left join m mp on mp.old = s.parent_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.seed_plan_from_session(uuid, uuid, int) from public, anon;
grant execute on function public.seed_plan_from_session(uuid, uuid, int) to authenticated;
