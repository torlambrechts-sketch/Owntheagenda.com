-- Append a module to a running workshop and return its ord, so the facilitator
-- can jump straight to it. Lead/admin of the workshop's team only. Drop-in
-- modules only (no config needed).
create or replace function public.add_block_live(p_workshop uuid, p_kind text, p_title text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_ord int;
begin
  if not private.can_manage_workshop(p_workshop) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('canvas','brainstorm','vote','feedback','discuss','checkin','outcome','manual') then
    raise exception 'invalid module' using errcode = '22023';
  end if;
  select coalesce(max(ord), 0) + 1 into v_ord from public.block where workshop_id = p_workshop;
  insert into public.block (workshop_id, ord, title, activity_type, duration, config)
  values (p_workshop, v_ord, coalesce(nullif(btrim(p_title), ''), initcap(p_kind)), p_kind::public.activity_type, 15, '{}'::jsonb);
  return v_ord;
end;
$$;
revoke execute on function public.add_block_live(uuid, text, text) from public, anon;
grant execute on function public.add_block_live(uuid, text, text) to authenticated;
