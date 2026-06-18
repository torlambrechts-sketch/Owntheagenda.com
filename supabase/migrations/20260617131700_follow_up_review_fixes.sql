-- Review fix (E2): make pull-forward idempotent — only seed into an empty block,
-- so a double-click (or a second click after the team added tasks) can't duplicate.
create or replace function public.seed_plan_from_session(p_source uuid, p_target uuid, p_block int)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not private.can_read_session(p_target) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.can_read_session(p_source) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.plan_task where session_id = p_target and block_ord = p_block) then
    return 0;  -- already has tasks; don't duplicate
  end if;
  with src as (
    select id, parent_id, title, owner_name, owner_id, start_date, end_date, status, ord
    from public.plan_task where session_id = p_source and status in ('todo','doing')
  ),
  m as (select id as old, gen_random_uuid() as new from src)
  insert into public.plan_task (id, session_id, block_ord, parent_id, title, owner_name, owner_id, start_date, end_date, status, ord)
  select m.new, p_target, p_block, mp.new, s.title, s.owner_name, s.owner_id, s.start_date, s.end_date, s.status, s.ord
  from src s join m on m.old = s.id
  left join m mp on mp.old = s.parent_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Review fix (D6): mark a follow-up complete manually (check-ins / meetings have
-- no workshop, so they never auto-complete). Any workspace member.
create or replace function public.complete_follow_up(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.follow_up where id = p_id;
  if v_ws is null then raise exception 'not found' using errcode = '23503'; end if;
  if not private.is_workspace_member(v_ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.follow_up set status = 'completed', updated_at = now() where id = p_id and status = 'planned';
end;
$$;
revoke execute on function public.complete_follow_up(uuid) from public, anon;
grant execute on function public.complete_follow_up(uuid) to authenticated;
