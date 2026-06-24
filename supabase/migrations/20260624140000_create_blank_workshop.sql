-- Draft workshop creation for the redesigned "New workshop" slide-over.
-- create_workshop_from_template makes a draft from a template; quick_start_workshop
-- creates AND starts a live run. Neither makes an *empty* draft that lands the user
-- in the builder, which the new Blank / assessment-seeded creation flow needs.
-- Mirrors create_workshop_from_template's privilege gate, minus the template.

create or replace function public.create_blank_workshop(p_team uuid, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_workshop uuid;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.can_manage_team(p_team) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  insert into public.workshop (team_id, title, created_by)
  values (p_team, coalesce(nullif(btrim(p_title), ''), 'Untitled workshop'), (select auth.uid()))
  returning id into v_workshop;
  perform private.write_audit(v_ws, (select auth.uid()), 'workshop.created', 'workshop', v_workshop, '{}'::jsonb);
  return v_workshop;
end;
$$;
revoke execute on function public.create_blank_workshop(uuid, text) from public, anon;
grant execute on function public.create_blank_workshop(uuid, text) to authenticated;
