-- E6: enforce the one-follow-up-per-spawned-workshop invariant that the
-- auto-complete trigger relies on (a session ending completes the follow_up by
-- workshop_id). A partial unique index makes the 1:1 mapping explicit so the
-- trigger can never complete more than the intended follow-up.
create unique index if not exists follow_up_workshop_uq
  on public.follow_up(workshop_id) where workshop_id is not null;

-- D7: reschedule a planned follow-up (move its date / rename it). Any workspace
-- member, mirroring skip/complete. Keeps a spawned workshop's date in sync.
create or replace function public.reschedule_follow_up(p_id uuid, p_when timestamptz, p_title text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_workshop uuid; v_status text;
begin
  select workspace_id, workshop_id, status into v_ws, v_workshop, v_status from public.follow_up where id = p_id;
  if v_ws is null then raise exception 'not found' using errcode = '23503'; end if;
  if not private.is_workspace_member(v_ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status <> 'planned' then return; end if;  -- only a still-planned step can move
  update public.follow_up
    set scheduled_at = p_when,
        title = coalesce(nullif(btrim(p_title), ''), title),
        updated_at = now()
    where id = p_id;
  if v_workshop is not null then
    update public.workshop set scheduled_at = p_when where id = v_workshop;
  end if;
end;
$$;
revoke execute on function public.reschedule_follow_up(uuid, timestamptz, text) from public, anon;
grant execute on function public.reschedule_follow_up(uuid, timestamptz, text) to authenticated;
