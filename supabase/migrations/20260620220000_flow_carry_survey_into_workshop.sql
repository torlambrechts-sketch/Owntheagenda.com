-- Make a Flow's assessment results actually land in the workshop it builds.
-- Before this, a Flow stamped workshop.survey_id (a link) but the run never read
-- it and the Play templates had no survey step, so the team ran a generic
-- workshop with no sight of what they'd just answered.
--
-- (a) bind-on-build + (b) lead with the reading: when a carried survey exists,
-- bind it to the workshop's survey step if the template has one, else PREPEND a
-- prerequisite survey step bound to it — so the session opens with the team's
-- already-collected reading. Applied on both build paths (auto + manual).

create or replace function private.attach_carried_survey(p_workshop uuid, p_survey uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_block uuid;
begin
  if p_workshop is null or p_survey is null then return; end if;
  select kind into v_kind from public.survey where id = p_survey;
  if v_kind is null then return; end if;

  -- (a) Template already has a matching survey step → bind it to the carried survey.
  select id into v_block from public.block
    where workshop_id = p_workshop and activity_type = 'survey'
      and coalesce(config ->> 'kind', 'psych_safety_bang') = v_kind
    order by ord limit 1;
  if v_block is not null then
    update public.block set survey_id = p_survey where id = v_block;
    return;
  end if;

  -- (b) Otherwise prepend a prerequisite survey step bound to the carried survey
  -- so the workshop opens with the reading the team already gave.
  update public.block set ord = ord + 1 where workshop_id = p_workshop;
  insert into public.block (workshop_id, ord, title, activity_type, duration, prompt, config, survey_id)
  values (
    p_workshop, 1, 'Review the team reading', 'survey', 10,
    'Here is what the team said in the assessment. Use it to focus today''s session.',
    jsonb_build_object('kind', v_kind, 'timing', 'prerequisite'),
    p_survey
  );
end;
$$;

-- Auto-build: attach the carried survey to the spawned workshop.
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
    perform private.attach_carried_survey(v_wk, v_survey);
    update public.program_step set ref_table = 'workshop', ref_id = v_wk where id = v_step;
  end if;
end;
$$;

-- Manual build: same attach after stamping the survey link.
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
    perform private.attach_carried_survey(v_wk, v_survey);
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
revoke execute on function public.program_build_workshop(uuid, uuid, text) from public, anon;
grant execute on function public.program_build_workshop(uuid, uuid, text) to authenticated;
