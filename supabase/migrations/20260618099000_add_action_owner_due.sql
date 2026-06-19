-- F2: commitments can be assigned to a real member (owner_id) with a due date.
-- The existing due-action-reminders cron then nudges the owner. Also fire an
-- immediate "you were assigned" notification. Backward compatible (new params
-- default null, so existing 2/3-arg calls still resolve).
drop function if exists public.add_action(uuid, text, text);
create function public.add_action(
  p_session uuid, p_text text, p_owner text default null,
  p_owner_id uuid default null, p_due timestamptz default null
) returns public.action_item language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_workshop uuid; v_team uuid; v_row public.action_item;
        v_owner_name text; v_actor uuid := (select auth.uid());
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select s.workspace_id, s.workshop_id, w.team_id into v_ws, v_workshop, v_team
    from public.session s join public.workshop w on w.id = s.workshop_id where s.id = p_session;
  v_owner_name := nullif(btrim(coalesce(p_owner, '')), '');
  if v_owner_name is null and p_owner_id is not null then
    select coalesce(pr.full_name, pr.display_name, pr.email::text) into v_owner_name
    from public.profile pr where pr.id = p_owner_id;
  end if;
  insert into public.action_item (workspace_id, workshop_id, team_id, session_id, text, owner_name, owner_id, due_at, created_by)
  values (v_ws, v_workshop, v_team, p_session, p_text, v_owner_name, p_owner_id, p_due, v_actor)
  returning * into v_row;
  if p_owner_id is not null and p_owner_id <> v_actor then
    insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
    values (v_ws, p_owner_id, 'action_assigned', 'You were assigned: ' || left(p_text, 80),
            case when p_due is not null then 'Due ' || to_char(p_due, 'Mon DD') || '.' else 'From a live session.' end,
            '/actions', 'action', v_row.id);
  end if;
  return v_row;
end;
$$;
revoke execute on function public.add_action(uuid, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.add_action(uuid, text, text, uuid, timestamptz) to authenticated;
