-- =====================================================================
-- Assessment anonymity — Phase M. A survey can run Anonymous (default) or
-- Attributed.
--   Anonymous : responses store NO respondent_id. A per-survey salted hash
--               (md5(salt || user)) prevents double-submission without
--               identifying the person. The leader never sees who said what.
--   Attributed: responses keep respondent_id (behind the existing team
--               membership gate) so feedback can be tied to a name.
-- Counts use one-row-per-respondent (count(*)), which is correct in both
-- modes because each respondent upserts a single row. Flows carry the mode
-- (program.assessment_anonymity) into the survey they open.
-- =====================================================================

-- ---- survey: mode + per-survey salt ---------------------------------
alter table public.survey
  add column if not exists anonymity text not null default 'anonymous'
    check (anonymity in ('anonymous','attributed')),
  add column if not exists respondent_salt text not null default gen_random_uuid()::text;

-- ---- survey_response: hash for anonymous dedup ----------------------
alter table public.survey_response add column if not exists respondent_hash text;

alter table public.survey_response drop constraint if exists survey_response_survey_id_respondent_id_key;
create unique index if not exists survey_response_attributed_uq
  on public.survey_response (survey_id, respondent_id) where respondent_id is not null;
create unique index if not exists survey_response_anonymous_uq
  on public.survey_response (survey_id, respondent_hash) where respondent_hash is not null;

-- ---- submit: branch on mode -----------------------------------------
create or replace function public.submit_survey_response(p_survey uuid, p_scores jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_status text; v_anon text; v_salt text; v_uid uuid := (select auth.uid()); v_hash text;
begin
  select team_id, status, anonymity, respondent_salt into v_team, v_status, v_anon, v_salt
    from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not a team member' using errcode = '42501'; end if;
  if v_status <> 'open' then raise exception 'survey is closed' using errcode = '22023'; end if;

  if v_anon = 'attributed' then
    insert into public.survey_response (survey_id, respondent_id, scores)
    values (p_survey, v_uid, p_scores)
    on conflict (survey_id, respondent_id) where respondent_id is not null
      do update set scores = excluded.scores, created_at = now();
  else
    v_hash := md5(v_salt || v_uid::text);
    insert into public.survey_response (survey_id, respondent_id, respondent_hash, scores)
    values (p_survey, null, v_hash, p_scores)
    on conflict (survey_id, respondent_hash) where respondent_hash is not null
      do update set scores = excluded.scores, created_at = now();
  end if;

  delete from public.survey_response_draft where survey_id = p_survey and respondent_id = v_uid;
end;
$$;

-- ---- create_survey: accept the mode (faithful re-create + anonymity) -
drop function if exists public.create_survey(uuid, text, text, timestamptz);
create function public.create_survey(
  p_team uuid, p_kind text, p_name text, p_due timestamptz default null,
  p_anonymity text default 'anonymous'
) returns public.survey language plpgsql security definer set search_path = '' as $$
declare v_row public.survey; v_uid uuid := (select auth.uid()); v_body text; v_ws uuid; v_def jsonb;
        v_anon text := case when p_anonymity = 'attributed' then 'attributed' else 'anonymous' end;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can open a survey' using errcode = '42501';
  end if;
  v_ws := private.team_workspace(p_team);
  select t.definition into v_def from public.assessment_template t
    where t.key = p_kind and (t.workspace_id = v_ws or t.workspace_id is null)
    order by t.workspace_id nulls last limit 1;
  insert into public.survey (team_id, kind, name, status, opened_at, due_at, created_by, definition, anonymity)
  values (p_team, p_kind, p_name, 'open', now(), p_due, v_uid, v_def, v_anon)
  returning * into v_row;
  v_body := case when p_due is not null
    then 'Due by ' || to_char(p_due, 'Mon DD') || ' — ~2 minutes, ' || v_anon || '.'
    else 'Share your read in ~2 minutes — ' || v_anon || '.' end;
  perform private.notify(v_row.workspace_id, tm.user_id, 'survey_open', p_name, v_body, '/assessments', 'survey', v_row.id)
  from public.team_member tm
  where tm.team_id = p_team and tm.user_id <> v_uid;
  return v_row;
end;
$$;

-- ---- survey_results: respondent key works in anonymous mode ----------
create or replace function public.survey_results(p_survey uuid, p_strength_items text[] default '{}'::text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_kind text; v_subject uuid; v_n integer; v_eff integer; v_comp numeric; v_result jsonb;
begin
  select team_id, kind, subject_user_id into v_team, v_kind, v_subject from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_subject is not null then
    select count(*) into v_eff from public.survey_response where survey_id = p_survey and respondent_id <> v_subject;
  else
    v_eff := v_n;
  end if;
  if v_eff < 3 then
    return jsonb_build_object('respondents', v_n, 'masked', true, 'items', '[]'::jsonb, 'strength_sd', null, 'composite', null, 'benchmark', null);
  end if;
  v_comp := private.survey_composite(p_survey);
  with exploded as (
    select coalesce(r.respondent_id::text, r.respondent_hash) as rkey, e.key as item_key, (e.value)::numeric as score
    from public.survey_response r, jsonb_each_text(r.scores) e
    where r.survey_id = p_survey
  ),
  per_item as (
    select item_key, round(avg(score), 2) as mean, count(*)::int as n from exploded group by item_key
  ),
  strength as (
    select round(stddev_pop(rmean), 2) as sd from (
      select rkey, avg(score) as rmean from exploded
      where p_strength_items = '{}' or item_key = any(p_strength_items)
      group by rkey
    ) s
  )
  select jsonb_build_object(
    'respondents', v_n,
    'masked', false,
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_key', item_key, 'mean', mean, 'n', n)) from per_item), '[]'::jsonb),
    'strength_sd', (select sd from strength),
    'composite', v_comp,
    'benchmark', private.benchmark_rank(v_kind, v_comp)
  ) into v_result;
  return v_result;
end;
$$;

-- ---- gate counting: count(*) (one row per respondent in both modes) --
create or replace function private.program_on_survey_response() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_step uuid; v_program uuid; v_target int;
begin
  select s.id, s.program_id into v_step, v_program from public.program_step s
    where s.ref_table = 'survey' and s.ref_id = new.survey_id and s.status = 'active'
    limit 1;
  if v_step is null then return new; end if;
  v_target := private.program_threshold(v_program);
  if (select count(*) from public.survey_response where survey_id = new.survey_id) >= v_target then
    perform private.program_gate_advance(v_step);
  end if;
  return new;
end;
$$;

-- ---- flow plumbing: carry the mode into the survey -------------------
alter table public.program add column if not exists assessment_anonymity text not null default 'anonymous'
  check (assessment_anonymity in ('anonymous','attributed'));

drop function if exists public.create_flow_steps(uuid, text, uuid, int, jsonb, text, int, uuid);
create function public.create_flow_steps(
  p_workspace uuid, p_title text, p_team uuid, p_min_responses int, p_steps jsonb,
  p_assessment_kind text default null, p_collect_days int default 7,
  p_workshop_template uuid default null, p_anonymity text default 'anonymous'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int := greatest(3, coalesce(p_min_responses, 3)); v_ord int := 0; r record;
        v_cd int := greatest(1, coalesce(p_collect_days, 7)); v_tmpl uuid; v_steptmpl uuid;
        v_anon text := case when p_anonymity = 'attributed' then 'attributed' else 'anonymous' end;
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

  if p_workshop_template is not null then
    select id into v_tmpl from public.template
    where id = p_workshop_template and (workspace_id is null or workspace_id = p_workspace);
    if v_tmpl is null then raise exception 'unknown workshop template' using errcode = '23503'; end if;
  end if;

  insert into public.program (workspace_id, team_id, title, kind, min_responses, assessment_kind,
                              collect_days, auto_workshop_template, assessment_anonymity, created_by)
  values (p_workspace, p_team, btrim(p_title), 'flow', v_n, nullif(btrim(p_assessment_kind), ''),
          v_cd, v_tmpl, v_anon, (select auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_steps) with ordinality as e(elem, ord) loop
    if (r.elem ->> 'kind') not in
       ('assessment','launch','interpret','workshop','commit','repulse','branch','custom') then
      raise exception 'bad step kind: %', r.elem ->> 'kind' using errcode = '22023';
    end if;
    v_steptmpl := null;
    if (r.elem ->> 'kind') = 'workshop' and nullif(r.elem ->> 'template', '') is not null then
      select id into v_steptmpl from public.template
      where id = (r.elem ->> 'template')::uuid and (workspace_id is null or workspace_id = p_workspace);
      if v_steptmpl is null then raise exception 'unknown workshop template' using errcode = '23503'; end if;
    end if;
    v_ord := v_ord + 1;
    insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate, config)
    values (
      v_id, p_workspace, v_ord, r.elem ->> 'kind',
      coalesce(nullif(btrim(r.elem ->> 'title'), ''), initcap(r.elem ->> 'kind')),
      case when v_ord = 1 then 'active' else 'pending' end,
      case (r.elem ->> 'kind')
        when 'launch' then 'Hold until ' || v_n || ' people respond'
        when 'branch' then 'Routes to a workshop based on the results'
        when 'workshop' then case when coalesce(v_steptmpl, v_tmpl) is not null
                                  then 'Auto-builds when the threshold is met'
                                  else 'Build and run the session on the results' end
        else null end,
      case when v_steptmpl is not null then jsonb_build_object('template', v_steptmpl) else '{}'::jsonb end
    );
  end loop;
  perform private.seed_program_tasks(v_id);
  return v_id;
end;
$$;

-- program_start_assessment passes the flow's mode to the survey.
create or replace function public.program_start_assessment(p_program uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_kind text; v_title text; v_anon text; v_ref uuid;
begin
  select workspace_id, team_id, assessment_kind, title, assessment_anonymity
    into v_ws, v_team, v_kind, v_title, v_anon
    from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  if coalesce(btrim(v_kind), '') = '' then
    v_ref := public.program_start_pulse(p_program, null);
  else
    select id into v_ref from public.create_survey(v_team, v_kind, coalesce(v_title, 'Flow assessment'), null, v_anon);
    update public.program_step set status = 'done', ref_table = 'survey', ref_id = v_ref, completed_at = now()
      where program_id = p_program and kind = 'assessment';
    update public.program_step set status = 'active', ref_table = 'survey', ref_id = v_ref
      where program_id = p_program and kind = 'launch';
    update public.program set current_ord =
      coalesce((select ord from public.program_step where program_id = p_program and kind = 'launch'), current_ord)
      where id = p_program;
  end if;
  perform private.complete_flow_task(p_program, 'assessment');
  return v_ref;
end;
$$;

-- flow_remind: anonymous surveys can't target non-responders, so nudge the
-- whole team (cooldown still applies); pulse + attributed keep precise targeting.
create or replace function public.flow_remind(p_program uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_title text; v_rt text; v_ref uuid; v_anon text; v_count int := 0; r record;
begin
  select workspace_id, team_id, title into v_ws, v_team, v_title from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  select ref_table, ref_id into v_rt, v_ref from public.program_step
    where program_id = p_program and ref_table in ('pulse','survey') and status = 'active' limit 1;
  if v_ref is null then return 0; end if;
  if v_rt = 'survey' then select anonymity into v_anon from public.survey where id = v_ref; end if;

  for r in
    select tm.user_id from public.team_member tm
    where tm.team_id = v_team
      and (v_rt <> 'pulse' or tm.user_id not in (
        select distinct pr.respondent_id from public.pulse_response pr
        where pr.pulse_id = v_ref and pr.respondent_id is not null))
      and (v_rt <> 'survey' or v_anon = 'anonymous' or tm.user_id not in (
        select distinct sr.respondent_id from public.survey_response sr
        where sr.survey_id = v_ref and sr.respondent_id is not null))
      and not exists (
        select 1 from public.notification n
        where n.user_id = tm.user_id and n.kind = 'pulse_reminder'
          and n.entity_type = 'program' and n.entity_id = p_program
          and n.created_at > now() - interval '6 hours')
  loop
    perform private.notify(v_ws, r.user_id, 'pulse_reminder',
      'Your response is needed',
      'Please complete the assessment for "' || v_title || '".',
      '/assessments', 'program', p_program);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function
  public.create_survey(uuid, text, text, timestamptz, text),
  public.create_flow_steps(uuid, text, uuid, int, jsonb, text, int, uuid, text)
to authenticated;
revoke execute on function
  public.create_survey(uuid, text, text, timestamptz, text),
  public.create_flow_steps(uuid, text, uuid, int, jsonb, text, int, uuid, text)
from public, anon;

-- program_status survey branch already counts via count(...); update it to
-- count(*) for surveys (one row per respondent in both modes).
create or replace function public.program_status(p_program uuid)
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
               (select count(*) from public.survey_response rr where rr.survey_id = s.ref_id) ||
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
        (select count(*) from public.survey_response rr where rr.survey_id = s.ref_id) >= v_target
      when 'workshop' then (select w.status from public.workshop w where w.id = s.ref_id) = 'done'
      when 'follow_up' then (select f.status from public.follow_up f where f.id = s.ref_id) = 'completed'
      else false
    end,
    case s.ref_table
      when 'pulse' then
        (select count(distinct pr.respondent_id)::int from public.pulse_response pr where pr.pulse_id = s.ref_id)
      when 'survey' then
        (select count(*)::int from public.survey_response rr where rr.survey_id = s.ref_id)
      else null
    end,
    case when s.ref_table in ('pulse','survey') then v_target else null end
  from public.program_step s
  where s.program_id = p_program and s.ref_id is not null;
end;
$$;
