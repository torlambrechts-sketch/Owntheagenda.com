-- Captured-by-block linkage for action items (Workshop handoff #2, req. 5).
-- Mirrors decision.block_ord: every action captured live records which agenda
-- block it came from, so the run cockpit + outcome report can group/annotate
-- actions by their originating block.

alter table public.action_item add column if not exists block_ord int;
create index if not exists action_item_block_idx on public.action_item(session_id, block_ord);

-- Extend add_action with an optional p_block_ord (falls back to the session's
-- current block). Drop the old signature first so named-arg callers resolve to a
-- single function (no overload ambiguity).
drop function if exists public.add_action(uuid, text, text, uuid, timestamptz);

create or replace function public.add_action(
  p_session uuid,
  p_text text,
  p_owner text default null,
  p_owner_id uuid default null,
  p_due timestamptz default null,
  p_block_ord int default null
)
returns public.action_item
language plpgsql
security definer
set search_path to ''
as $function$
declare v_ws uuid; v_workshop uuid; v_team uuid; v_row public.action_item;
        v_owner_name text; v_actor uuid := (select auth.uid()); v_block int;
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select s.workspace_id, s.workshop_id, w.team_id, s.current_block_ord
    into v_ws, v_workshop, v_team, v_block
    from public.session s join public.workshop w on w.id = s.workshop_id where s.id = p_session;
  v_owner_name := nullif(btrim(coalesce(p_owner, '')), '');
  if v_owner_name is null and p_owner_id is not null then
    select coalesce(pr.full_name, pr.display_name, pr.email::text) into v_owner_name
    from public.profile pr where pr.id = p_owner_id;
  end if;
  insert into public.action_item (workspace_id, workshop_id, team_id, session_id, text, owner_name, owner_id, due_at, block_ord, created_by)
  values (v_ws, v_workshop, v_team, p_session, p_text, v_owner_name, p_owner_id, p_due, coalesce(p_block_ord, v_block), v_actor)
  returning * into v_row;
  if p_owner_id is not null and p_owner_id <> v_actor then
    insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
    values (v_ws, p_owner_id, 'action_assigned', 'You were assigned: ' || left(p_text, 80),
            case when p_due is not null then 'Due ' || to_char(p_due, 'Mon DD') || '.' else 'From a live session.' end,
            '/actions', 'action', v_row.id);
  end if;
  return v_row;
end;
$function$;

grant execute on function public.add_action(uuid, text, text, uuid, timestamptz, int) to authenticated;
