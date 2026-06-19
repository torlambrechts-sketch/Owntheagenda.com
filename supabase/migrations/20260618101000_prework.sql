-- =====================================================================
-- F4 · Pre-work / async collection before the live session
-- ---------------------------------------------------------------------
-- A brainstorm block can be flagged `config.prework`. A facilitator opens
-- a session in `is_prep` mode; workspace members add their cards ahead of
-- time via the run link. Pre-work blocks are private-until-reveal (same
-- RLS path as silent ideation), so it's true independent generation — the
-- author and facilitator see cards, nobody else, until the live reveal.
-- Going live clears `is_prep`, resets to step 1 and marks the workshop live.
-- =====================================================================

alter table public.session add column if not exists is_prep boolean not null default false;

-- Pre-work blocks hide like silent ones until the facilitator reveals.
create or replace function private.block_revealed(p_session uuid, p_block_ord int)
returns boolean language sql security definer stable set search_path = '' as $$
  select
    (select status from public.session where id = p_session) = 'ended'
    or exists (select 1 from public.session_reveal r where r.session_id = p_session and r.block_ord = p_block_ord)
    or not coalesce(
      (select ((b.config ->> 'silent')::boolean) or ((b.config ->> 'prework')::boolean)
       from public.block b join public.session s on s.workshop_id = b.workshop_id
       where s.id = p_session and b.ord = p_block_ord),
      false);
$$;
grant execute on function private.block_revealed(uuid, int) to authenticated;

-- Open a session for asynchronous pre-work (workshop stays 'scheduled').
create or replace function public.open_prework(p_workshop uuid)
returns public.session language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_row public.session; v_existing uuid; v_ord int; v_secs int;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead/admin can open pre-work' using errcode = '42501';
  end if;
  select id into v_existing from public.session where workshop_id = p_workshop and status = 'live' limit 1;
  if v_existing is not null then
    select * into v_row from public.session where id = v_existing; return v_row;
  end if;
  select ord into v_ord from public.block
    where workshop_id = p_workshop and coalesce((config ->> 'prework')::boolean, false)
    order by ord limit 1;
  v_ord := coalesce(v_ord, 1);
  select coalesce(duration, 10) * 60 into v_secs from public.block where workshop_id = p_workshop and ord = v_ord;
  insert into public.session (workshop_id, facilitator_id, current_block_ord, timer_remaining, is_prep)
  values (p_workshop, v_uid, v_ord, coalesce(v_secs, 600), true)
  returning * into v_row;
  insert into public.participant (session_id, user_id, is_facilitator, ready)
  values (v_row.id, v_uid, true, true);
  return v_row;
end;
$$;

-- start_session now also "goes live" from a pre-work session: clears
-- is_prep, resets to step 1, and marks the workshop live.
create or replace function public.start_session(p_workshop uuid)
returns public.session language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_secs int; v_row public.session; v_existing uuid;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead/admin can start a session' using errcode = '42501';
  end if;
  select id into v_existing from public.session where workshop_id = p_workshop and status = 'live' limit 1;
  if v_existing is not null then
    select * into v_row from public.session where id = v_existing;
    if v_row.is_prep then
      select coalesce(b.duration, 10) * 60 into v_secs from public.block b where b.workshop_id = p_workshop and b.ord = 1;
      update public.session
        set is_prep = false, current_block_ord = 1, timer_running = false, timer_ends_at = null,
            timer_remaining = coalesce(v_secs, 600)
        where id = v_existing returning * into v_row;
      update public.workshop set status = 'live' where id = p_workshop;
    end if;
    return v_row;
  end if;
  select coalesce(duration, 10) * 60 into v_secs from public.block where workshop_id = p_workshop and ord = 1;
  insert into public.session (workshop_id, facilitator_id, current_block_ord, timer_remaining)
  values (p_workshop, v_uid, 1, coalesce(v_secs, 600))
  returning * into v_row;
  insert into public.participant (session_id, user_id, is_facilitator, ready)
  values (v_row.id, v_uid, true, true);
  update public.workshop set status = 'live' where id = p_workshop;
  return v_row;
end;
$$;

grant execute on function public.open_prework(uuid) to authenticated;
revoke execute on function public.open_prework(uuid) from public, anon;
