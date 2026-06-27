-- =====================================================================
-- Flow survey carry-forward + Play instruments — Phase G.
--  1. Workshops gain a survey_id (mirroring pulse_id) so a survey-backed
--     Flow carries its assessment into the workshop it builds — parity with
--     the pulse path. Set on both the auto-build and manual-build paths.
--  2. Plays now carry a default instrument: start_play stores assessment_kind
--     and opens a survey of that instrument (falling back to the pulse when
--     none is given) via the shared program_start_assessment.
-- =====================================================================

-- 1) Workshop ← survey link --------------------------------------------
alter table public.workshop
  add column if not exists survey_id uuid references public.survey(id) on delete set null;

-- spawn_workshop now also stamps the survey link. Drop the old 4-arg version
-- first so the optional p_survey doesn't leave an orphaned overload behind.
drop function if exists private.spawn_workshop(uuid, uuid, text, uuid);
create or replace function private.spawn_workshop(
  p_team uuid, p_template uuid, p_title text, p_pulse uuid, p_survey uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_def jsonb; v_tname text; v_id uuid;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null then return null; end if;
  select definition, name into v_def, v_tname from public.template
  where id = p_template and (workspace_id is null or workspace_id = v_ws);
  if v_def is null then return null; end if;

  insert into public.workshop (team_id, title, template_id, pulse_id, survey_id, created_by)
  values (p_team, coalesce(nullif(btrim(p_title), ''), v_tname), p_template, p_pulse, p_survey, (select auth.uid()))
  returning id into v_id;

  insert into public.block (workshop_id, ord, title, activity_type, duration, prompt, linked_dynamic, config)
  select v_id, ph.ord,
         coalesce(ph.elem ->> 'title', 'Step'),
         coalesce((ph.elem ->> 'type')::public.activity_type, 'canvas'),
         coalesce((ph.elem ->> 'minutes')::int, 10),
         ph.elem ->> 'prompt',
         (ph.elem ->> 'dynamic')::public.team_dynamic,
         coalesce(ph.elem -> 'config', '{}'::jsonb)
  from jsonb_array_elements(coalesce(v_def -> 'phases', '[]'::jsonb)) with ordinality as ph(elem, ord);
  return v_id;
end;
$$;

-- Auto-build carries both the pulse and survey refs of the program.
create or replace function private.program_autobuild(p_program uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_tmpl uuid; v_title text; v_pulse uuid; v_survey uuid; v_step uuid; v_wk uuid;
begin
  select team_id, auto_workshop_template, title
    into v_team, v_tmpl, v_title from public.program where id = p_program;
  if v_tmpl is null or v_team is null then return; end if;

  select id into v_step from public.program_step
    where program_id = p_program and kind = 'workshop' and status = 'active' and ref_id is null
    limit 1;
  if v_step is null then return; end if;

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and ref_id is not null limit 1;
  select ref_id into v_survey from public.program_step
    where program_id = p_program and ref_table = 'survey' and ref_id is not null limit 1;

  v_wk := private.spawn_workshop(v_team, v_tmpl, v_title, v_pulse, v_survey);
  if v_wk is not null then
    update public.program_step set ref_table = 'workshop', ref_id = v_wk where id = v_step;
  end if;
end;
$$;

-- Manual build (program_build_workshop) stamps the survey link too.
create or replace function public.program_build_workshop(p_program uuid, p_template uuid, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_pulse uuid; v_survey uuid; v_wk uuid; v_word int;
begin
  select workspace_id, team_id into v_ws, v_team from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and ref_id is not null limit 1;
  select ref_id into v_survey from public.program_step
    where program_id = p_program and ref_table = 'survey' and ref_id is not null limit 1;
  select id into v_wk from public.create_workshop_from_template(v_team, p_template, p_title, v_pulse);
  if v_survey is not null then
    update public.workshop set survey_id = v_survey where id = v_wk;
  end if;

  select ord into v_word from public.program_step where program_id = p_program and kind = 'workshop';
  update public.program_step set status = 'done', completed_at = coalesce(completed_at, now())
    where program_id = p_program and ord < v_word and status not in ('done', 'skipped');
  update public.program_step set status = 'active', ref_table = 'workshop', ref_id = v_wk
    where program_id = p_program and kind = 'workshop';
  update public.program set current_ord = v_word where id = p_program;
  return v_wk;
end;
$$;

-- 2) Plays carry a default instrument ----------------------------------
drop function if exists public.start_play(uuid, uuid, text, text, text, int);
create function public.start_play(
  p_workspace uuid, p_team uuid, p_play_key text, p_title text,
  p_workshop_template_key text, p_min_responses int default 4, p_assessment_kind text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_tmpl uuid; v_n int := greatest(3, coalesce(p_min_responses, 4));
        v_title text := coalesce(nullif(btrim(p_title), ''), btrim(p_play_key));
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_team is null then raise exception 'team required' using errcode = '22023'; end if;
  v_tmpl := private.template_id_by_key(p_workspace, p_workshop_template_key);
  if v_tmpl is null then raise exception 'unknown workshop template' using errcode = '23503'; end if;

  insert into public.program (workspace_id, team_id, title, kind, min_responses, play_key,
                              auto_workshop_template, assessment_kind, created_by)
  values (p_workspace, p_team, v_title, 'flow', v_n, p_play_key, v_tmpl,
          nullif(btrim(p_assessment_kind), ''), (select auth.uid()))
  returning id into v_id;

  insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
  values
    (v_id, p_workspace, 1, 'assessment', 'Create assessment', 'active',  'Pick the instrument and audience'),
    (v_id, p_workspace, 2, 'launch',     'Collect responses',  'pending', 'Hold until ' || v_n || ' people respond'),
    (v_id, p_workspace, 3, 'workshop',   'Run workshop',       'pending', 'Auto-builds when the threshold is met');

  -- Open the survey (or pulse) now and advance to collection.
  perform public.program_start_assessment(v_id);
  return v_id;
end;
$$;

grant execute on function public.start_play(uuid, uuid, text, text, text, int, text) to authenticated;
revoke execute on function public.start_play(uuid, uuid, text, text, text, int, text) from public, anon;
