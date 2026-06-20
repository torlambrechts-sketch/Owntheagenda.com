-- Final reconcile of private.program_autobuild.
-- Two concurrent lines both touched it:
--   20260620210000_flow_per_step_workshop_template — per-step template selection
--     (v_cfg ->> 'template'), and
--   20260620225000_flow_carry_survey_into_workshop — added attach_carried_survey
--     but on the OLD (single-template) body, which would revert per-step on reset.
-- This is the last definition: per-step template selection AND the attach call.
-- (attach_carried_survey + program_build_workshop already carry the attach via
-- 20260620225000, so they are not redefined here.)

create or replace function private.program_autobuild(p_program uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_prog_tmpl uuid; v_title text; v_pulse uuid; v_survey uuid;
        v_step uuid; v_cfg jsonb; v_tmpl uuid; v_wk uuid;
begin
  select team_id, auto_workshop_template, title
    into v_team, v_prog_tmpl, v_title from public.program where id = p_program;
  if v_team is null then return; end if;

  select id, config into v_step, v_cfg from public.program_step
    where program_id = p_program and kind = 'workshop' and status = 'active' and ref_id is null
    order by ord limit 1;
  if v_step is null then return; end if;

  v_tmpl := coalesce(nullif(v_cfg ->> 'template', '')::uuid, v_prog_tmpl);
  if v_tmpl is null then return; end if;   -- no template chosen → manual build

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and ref_id is not null limit 1;
  select ref_id into v_survey from public.program_step
    where program_id = p_program and ref_table = 'survey' and ref_id is not null limit 1;

  v_wk := private.spawn_workshop(v_team, v_tmpl, v_title, v_pulse, v_survey);
  if v_wk is not null then
    perform private.attach_carried_survey(v_wk, v_survey);
    update public.program_step set ref_table = 'workshop', ref_id = v_wk where id = v_step;
  end if;
end;
$$;
