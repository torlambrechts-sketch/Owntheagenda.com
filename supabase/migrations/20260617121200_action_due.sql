-- =====================================================================
-- OwnTheAgenda · 0012 · Actions: due date + team scoping (close the loop)
-- ---------------------------------------------------------------------
-- action_item already carries commitments captured in a live session.
-- Phase 6 surfaces them as tracked, carried-over Actions per team:
--   * add an optional due date,
--   * add team_id so actions live at the team level (workshop is now an
--     optional "source"),
--   * teach add_action to stamp the team.
-- =====================================================================

alter table public.action_item add column if not exists due_at date;
alter table public.action_item add column if not exists team_id uuid references public.team(id) on delete cascade;
alter table public.action_item alter column workshop_id drop not null;

-- backfill team from the source workshop
update public.action_item ai
set team_id = w.team_id
from public.workshop w
where w.id = ai.workshop_id and ai.team_id is null;

create index if not exists action_item_team_idx on public.action_item (team_id);

-- add_action now stamps the team (from the session's workshop)
create or replace function public.add_action(p_session uuid, p_text text, p_owner text default null)
returns public.action_item language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_workshop uuid; v_team uuid; v_row public.action_item;
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select s.workspace_id, s.workshop_id, w.team_id
    into v_ws, v_workshop, v_team
  from public.session s join public.workshop w on w.id = s.workshop_id
  where s.id = p_session;
  insert into public.action_item (workspace_id, workshop_id, team_id, session_id, text, owner_name, created_by)
  values (v_ws, v_workshop, v_team, p_session, p_text, nullif(btrim(coalesce(p_owner,'')),''), (select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;

-- 0011 created action_item without a DELETE policy; add one (workspace members).
create policy action_item_delete on public.action_item
  for delete to authenticated using (private.is_workspace_member(workspace_id));
