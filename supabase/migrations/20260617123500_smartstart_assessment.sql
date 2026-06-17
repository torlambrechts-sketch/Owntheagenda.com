-- Dual-mode assessment: ensure a workshop has a linked, open pulse. Used by the
-- in-session `assess` block (live) and works equally if a pulse was scheduled as
-- a prerequisite (it just returns the existing one).
create or replace function public.ensure_workshop_pulse(p_workshop uuid, p_timing text default 'live')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_pulse uuid; v_team uuid;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead or facilitator can open the assessment' using errcode = '42501';
  end if;
  select pulse_id, team_id into v_pulse, v_team from public.workshop where id = p_workshop;
  if v_team is null then raise exception 'workshop not found' using errcode = '23503'; end if;
  if v_pulse is not null then return v_pulse; end if;
  insert into public.pulse (team_id, name, status, opened_at, created_by)
  values (v_team, 'Session assessment', 'open', now(), (select auth.uid()))
  returning id into v_pulse;
  update public.workshop set pulse_id = v_pulse where id = p_workshop;
  return v_pulse;
end;
$$;
revoke execute on function public.ensure_workshop_pulse(uuid, text) from public, anon;
grant execute on function public.ensure_workshop_pulse(uuid, text) to authenticated;

-- Propagate workshop.pulse_id live so participants pick up an opened assessment.
alter table public.workshop replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'workshop') then
    alter publication supabase_realtime add table public.workshop;
  end if;
end $$;
