-- On-demand session: create an ad-hoc workshop (no template) with one starting
-- module, then start the session — all in one call. Lead/admin only.
create or replace function public.quick_start_workshop(p_team uuid, p_title text, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_workshop uuid;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.can_manage_team(p_team) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  if p_kind not in ('canvas','brainstorm','vote','feedback','discuss','checkin','outcome','manual') then
    raise exception 'invalid module' using errcode = '22023';
  end if;
  insert into public.workshop (team_id, title, created_by)
  values (p_team, coalesce(nullif(btrim(p_title), ''), 'Quick session'), (select auth.uid()))
  returning id into v_workshop;
  insert into public.block (workshop_id, ord, title, activity_type, duration, config)
  values (v_workshop, 1, initcap(p_kind), p_kind::public.activity_type, 15, '{}'::jsonb);
  perform public.start_session(v_workshop);
  perform private.write_audit(v_ws, (select auth.uid()), 'workshop.quickstarted', 'workshop', v_workshop,
                              jsonb_build_object('kind', p_kind));
  return v_workshop;
end;
$$;
revoke execute on function public.quick_start_workshop(uuid, text, text) from public, anon;
grant execute on function public.quick_start_workshop(uuid, text, text) to authenticated;
