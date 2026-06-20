-- =====================================================================
-- Flow polish — Phase E. Two hardening fixes:
--  1. A branch reached without a configured condition must not stall the
--     flow. Advance past it (leaving the workshop step for a manual build)
--     instead of leaving the branch active forever.
--  2. flow_remind gets a cooldown so repeated clicks don't spam people:
--     skip anyone already sent a pulse reminder for this program in the
--     last 6 hours.
-- =====================================================================

-- 1) Safe branch fallback ------------------------------------------------
create or replace function private.program_resolve_branch(p_program uuid, p_step uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; v_pulse uuid; v_val numeric; v_pick uuid; v_ord int; v_true boolean; v_configured boolean;
begin
  select config, ord into cfg, v_ord from public.program_step where id = p_step;
  v_configured := cfg is not null and cfg <> '{}'::jsonb and (cfg ->> 'then_template') is not null;

  if v_configured then
    select ref_id into v_pulse from public.program_step
      where program_id = p_program and ref_table = 'pulse' and ref_id is not null limit 1;
    v_val := private.program_branch_value(v_pulse, cfg ->> 'dynamic');
    if (cfg ->> 'op') = 'lt' then
      v_true := v_val is not null and v_val < (cfg ->> 'value')::numeric;
    else
      v_true := v_val is not null and v_val >= (cfg ->> 'value')::numeric;
    end if;
    v_pick := case when v_true then (cfg ->> 'then_template')::uuid else (cfg ->> 'else_template')::uuid end;
    update public.program set auto_workshop_template = v_pick where id = p_program;
  end if;
  -- Unconfigured: leave auto_workshop_template untouched and simply advance
  -- past the branch so the flow proceeds (the workshop step builds manually).

  update public.program_step set status = 'done', completed_at = now() where id = p_step;
  update public.program_step set status = 'active'
    where program_id = p_program and ord = v_ord + 1 and status = 'pending';
  update public.program set current_ord = v_ord + 1 where id = p_program;
  perform private.program_on_activate(p_program);
end;
$$;

-- 2) flow_remind cooldown ------------------------------------------------
create or replace function public.flow_remind(p_program uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_title text; v_pulse uuid; v_count int := 0; r record;
begin
  select workspace_id, team_id, title into v_ws, v_team, v_title from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and status = 'active' limit 1;
  if v_pulse is null then return 0; end if;

  for r in
    select tm.user_id from public.team_member tm
    where tm.team_id = v_team
      and tm.user_id not in (
        select distinct pr.respondent_id from public.pulse_response pr
        where pr.pulse_id = v_pulse and pr.respondent_id is not null)
      -- cooldown: not already reminded for this program in the last 6 hours
      and not exists (
        select 1 from public.notification n
        where n.user_id = tm.user_id and n.kind = 'pulse_reminder'
          and n.entity_type = 'program' and n.entity_id = p_program
          and n.created_at > now() - interval '6 hours')
  loop
    perform private.notify(v_ws, r.user_id, 'pulse_reminder',
      'Your response is needed',
      'Please complete the pulse for "' || v_title || '".',
      '/assessments', 'program', p_program);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
