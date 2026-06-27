-- Dry-run (rehearsal) sessions for the redesigned "Run a workshop" launcher.
-- A dry run lets a facilitator rehearse the flow without recording it to the
-- workshop: the session is flagged, the workshop status is NOT flipped to live,
-- and the session is excluded from outcome rollups/reports in the app layer.

alter table public.session
  add column if not exists is_dry_run boolean not null default false;

-- Replace start_session with a dry-aware variant. The old single-arg signature is
-- dropped to avoid PostgREST overload ambiguity; the new one defaults p_dry=false
-- so every existing caller (RunLobby, PreworkLobby, quick_start_workshop, canvas)
-- keeps working unchanged.
drop function if exists public.start_session(uuid);

create or replace function public.start_session(p_workshop uuid, p_dry boolean default false)
returns public.session language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_secs int; v_row public.session; v_existing uuid;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead/admin can start a session' using errcode = '42501';
  end if;
  select id into v_existing from public.session where workshop_id = p_workshop and status = 'live' limit 1;
  if v_existing is not null then
    select * into v_row from public.session where id = v_existing;
    -- activate a prep session into the live run (unchanged behaviour)
    if v_row.is_prep then
      select coalesce(b.duration, 10) * 60 into v_secs from public.block b where b.workshop_id = p_workshop and b.ord = 1;
      update public.session
        set is_prep = false, current_block_ord = 1, timer_running = false, timer_ends_at = null,
            timer_remaining = coalesce(v_secs, 600)
        where id = v_existing returning * into v_row;
      update public.workshop set status = 'live' where id = p_workshop;
    end if;
    -- a real launch over a lingering rehearsal promotes it to a recorded session
    if v_row.is_dry_run and not p_dry then
      update public.session set is_dry_run = false where id = v_existing returning * into v_row;
      update public.workshop set status = 'live' where id = p_workshop;
    end if;
    return v_row;
  end if;
  select coalesce(duration, 10) * 60 into v_secs from public.block where workshop_id = p_workshop and ord = 1;
  insert into public.session (workshop_id, facilitator_id, current_block_ord, timer_remaining, is_dry_run)
  values (p_workshop, v_uid, 1, coalesce(v_secs, 600), p_dry)
  returning * into v_row;
  insert into public.participant (session_id, user_id, is_facilitator, ready)
  values (v_row.id, v_uid, true, true);
  -- a rehearsal never changes the workshop record
  if not p_dry then
    update public.workshop set status = 'live' where id = p_workshop;
  end if;
  return v_row;
end;
$$;
revoke execute on function public.start_session(uuid, boolean) from public, anon;
grant execute on function public.start_session(uuid, boolean) to authenticated;
