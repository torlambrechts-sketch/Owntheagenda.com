-- =====================================================================
-- Flow assessment instrument — Phase F. Until now a Flow's "assessment"
-- step always opened a generic team pulse, so you could not choose WHICH
-- assessment to run. This lets a Flow carry a chosen instrument
-- (assessment_kind) and, when started, open a real survey of that
-- instrument and gate on its responses — exactly like the pulse path.
-- Flows with no instrument keep the old pulse behaviour.
-- =====================================================================

alter table public.program add column if not exists assessment_kind text;

-- create_flow_steps now records the chosen instrument on the program.
drop function if exists public.create_flow_steps(uuid, text, uuid, int, jsonb);
create function public.create_flow_steps(
  p_workspace uuid, p_title text, p_team uuid, p_min_responses int, p_steps jsonb,
  p_assessment_kind text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int := greatest(3, coalesce(p_min_responses, 3)); v_ord int := 0; r record;
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required' using errcode = '22023';
  end if;
  if p_steps is null or jsonb_array_length(p_steps) = 0 then
    raise exception 'at least one step required' using errcode = '22023';
  end if;

  insert into public.program (workspace_id, team_id, title, kind, min_responses, assessment_kind, created_by)
  values (p_workspace, p_team, btrim(p_title), 'flow', v_n, nullif(btrim(p_assessment_kind), ''), (select auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_steps) with ordinality as e(elem, ord) loop
    if (r.elem ->> 'kind') not in
       ('assessment','launch','interpret','workshop','commit','repulse','branch','custom') then
      raise exception 'bad step kind: %', r.elem ->> 'kind' using errcode = '22023';
    end if;
    v_ord := v_ord + 1;
    insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
    values (
      v_id, p_workspace, v_ord, r.elem ->> 'kind',
      coalesce(nullif(btrim(r.elem ->> 'title'), ''), initcap(r.elem ->> 'kind')),
      case when v_ord = 1 then 'active' else 'pending' end,
      case (r.elem ->> 'kind')
        when 'launch' then 'Hold until ' || v_n || ' people respond'
        when 'branch' then 'Routes to a workshop based on the results'
        else null end
    );
  end loop;
  return v_id;
end;
$$;

-- Start the Flow's assessment: an instrument survey when assessment_kind is
-- set, otherwise the generic team pulse (legacy behaviour). Links the
-- assessment + launch steps to the new survey/pulse and opens collection.
create or replace function public.program_start_assessment(p_program uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_kind text; v_title text; v_survey uuid;
begin
  select workspace_id, team_id, assessment_kind, title into v_ws, v_team, v_kind, v_title
    from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  if coalesce(btrim(v_kind), '') = '' then
    return public.program_start_pulse(p_program, null);   -- no instrument → pulse
  end if;

  select id into v_survey from public.create_survey(v_team, v_kind, coalesce(v_title, 'Flow assessment'), null);

  update public.program_step set status = 'done', ref_table = 'survey', ref_id = v_survey, completed_at = now()
    where program_id = p_program and kind = 'assessment';
  update public.program_step set status = 'active', ref_table = 'survey', ref_id = v_survey
    where program_id = p_program and kind = 'launch';
  update public.program set current_ord =
    coalesce((select ord from public.program_step where program_id = p_program and kind = 'launch'), current_ord)
    where id = p_program;
  return v_survey;
end;
$$;

-- program_status now also understands survey-linked steps.
drop function if exists public.program_status(uuid);
create function public.program_status(p_program uuid)
returns table(step_id uuid, live text, ready boolean, done int, target int)
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_target int;
begin
  select workspace_id into v_ws from public.program where id = p_program;
  if v_ws is null then return; end if;
  if not private.is_workspace_member(v_ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_target := private.program_threshold(p_program);
  return query
  select s.id,
    case s.ref_table
      when 'pulse' then (
        select 'Pulse ' || p.status || ' · ' ||
               (select count(distinct pr.respondent_id) from public.pulse_response pr where pr.pulse_id = s.ref_id) ||
               ' responses'
        from public.pulse p where p.id = s.ref_id)
      when 'survey' then (
        select 'Survey ' || sv.status || ' · ' ||
               (select count(distinct rr.respondent_id) from public.survey_response rr where rr.survey_id = s.ref_id) ||
               ' responses'
        from public.survey sv where sv.id = s.ref_id)
      when 'workshop' then (select 'Workshop · ' || w.status from public.workshop w where w.id = s.ref_id)
      when 'follow_up' then (
        select 'Re-pulse · ' || coalesce(to_char(f.scheduled_at, 'Mon DD'), f.status)
        from public.follow_up f where f.id = s.ref_id)
      else null
    end,
    case s.ref_table
      when 'pulse' then
        (select count(distinct pr.respondent_id) from public.pulse_response pr where pr.pulse_id = s.ref_id) >= v_target
      when 'survey' then
        (select count(distinct rr.respondent_id) from public.survey_response rr where rr.survey_id = s.ref_id) >= v_target
      when 'workshop' then (select w.status from public.workshop w where w.id = s.ref_id) = 'done'
      when 'follow_up' then (select f.status from public.follow_up f where f.id = s.ref_id) = 'completed'
      else false
    end,
    case s.ref_table
      when 'pulse' then
        (select count(distinct pr.respondent_id)::int from public.pulse_response pr where pr.pulse_id = s.ref_id)
      when 'survey' then
        (select count(distinct rr.respondent_id)::int from public.survey_response rr where rr.survey_id = s.ref_id)
      else null
    end,
    case when s.ref_table in ('pulse','survey') then v_target else null end
  from public.program_step s
  where s.program_id = p_program and s.ref_id is not null;
end;
$$;

-- Survey threshold reached → advance the launch step (mirrors the pulse gate).
create or replace function private.program_on_survey_response() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_step uuid; v_program uuid; v_target int;
begin
  select s.id, s.program_id into v_step, v_program from public.program_step s
    where s.ref_table = 'survey' and s.ref_id = new.survey_id and s.status = 'active'
    limit 1;
  if v_step is null then return new; end if;
  v_target := private.program_threshold(v_program);
  if (select count(distinct respondent_id) from public.survey_response where survey_id = new.survey_id) >= v_target then
    perform private.program_gate_advance(v_step);
  end if;
  return new;
end;
$$;
drop trigger if exists program_survey_response_gate on public.survey_response;
create trigger program_survey_response_gate after insert on public.survey_response
  for each row execute function private.program_on_survey_response();

grant execute on function
  public.create_flow_steps(uuid, text, uuid, int, jsonb, text),
  public.program_start_assessment(uuid),
  public.program_status(uuid)
to authenticated;
revoke execute on function
  public.create_flow_steps(uuid, text, uuid, int, jsonb, text),
  public.program_start_assessment(uuid),
  public.program_status(uuid)
from public, anon;
