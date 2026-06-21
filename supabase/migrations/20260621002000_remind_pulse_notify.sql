-- Pulse reminders now deliver an in-app notification to each member who hasn't
-- finished the pulse, matching remind_survey (which already notifies). The audit
-- event (pulse.reminded, with the pending count) is preserved.

create or replace function public.remind_pulse(p_pulse uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_ws uuid; v_name text; v_pending int;
begin
  select p.team_id, p.workspace_id, p.name into v_team, v_ws, v_name
  from public.pulse p where p.id = p_pulse;
  if v_team is null or not private.can_manage_team(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into v_pending from public.team_member tm
  where tm.team_id = v_team
    and (select count(distinct dynamic) from public.pulse_response pr
         where pr.pulse_id = p_pulse and pr.respondent_id = tm.user_id) < 5;

  -- In-app nudge to each member who hasn't completed all five dynamics.
  perform private.notify(
    v_ws, tm.user_id, 'pulse_due', v_name,
    'A quick team pulse is waiting — five questions, about a minute.',
    '/assessments', 'pulse', p_pulse)
  from public.team_member tm
  where tm.team_id = v_team
    and (select count(distinct dynamic) from public.pulse_response pr
         where pr.pulse_id = p_pulse and pr.respondent_id = tm.user_id) < 5;

  perform private.write_audit(v_ws, (select auth.uid()), 'pulse.reminded', 'pulse', p_pulse,
                              jsonb_build_object('pending', v_pending));
  return v_pending;
end;
$$;
