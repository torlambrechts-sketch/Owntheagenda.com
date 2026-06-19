-- =====================================================================
-- Whole-workshop early input
-- ---------------------------------------------------------------------
-- Extends pre-work from "flagged brainstorm steps" to "open the entire
-- workshop early": a facilitator can let members enter thoughts and ideas
-- across every input step (brainstorm / feedback / check-in) before the
-- live run. `open_prework(workshop, true)` marks the prep session
-- `prework_all`; per-step privacy still follows the silent / pre-work
-- flags, so a step can be private-until-reveal or openly collaborative.
-- =====================================================================

alter table public.session add column if not exists prework_all boolean not null default false;

drop function if exists public.open_prework(uuid);
create or replace function public.open_prework(p_workshop uuid, p_all boolean default false)
returns public.session language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_row public.session; v_existing uuid; v_ord int; v_secs int;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead/admin can open pre-work' using errcode = '42501';
  end if;
  select id into v_existing from public.session where workshop_id = p_workshop and status = 'live' limit 1;
  if v_existing is not null then
    if p_all then update public.session set prework_all = true where id = v_existing; end if;
    select * into v_row from public.session where id = v_existing; return v_row;
  end if;
  if p_all then
    v_ord := 1;
  else
    select ord into v_ord from public.block
      where workshop_id = p_workshop and coalesce((config ->> 'prework')::boolean, false)
      order by ord limit 1;
    v_ord := coalesce(v_ord, 1);
  end if;
  select coalesce(duration, 10) * 60 into v_secs from public.block where workshop_id = p_workshop and ord = v_ord;
  insert into public.session (workshop_id, facilitator_id, current_block_ord, timer_remaining, is_prep, prework_all)
  values (p_workshop, v_uid, v_ord, coalesce(v_secs, 600), true, p_all)
  returning * into v_row;
  insert into public.participant (session_id, user_id, is_facilitator, ready)
  values (v_row.id, v_uid, true, true);
  return v_row;
end;
$$;

grant execute on function public.open_prework(uuid, boolean) to authenticated;
revoke execute on function public.open_prework(uuid, boolean) from public, anon;
