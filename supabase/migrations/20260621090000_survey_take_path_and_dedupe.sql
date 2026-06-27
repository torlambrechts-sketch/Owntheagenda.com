-- Fix the respondent take-path + prevent duplicate open surveys.
-- (1) create_survey: reuse an already-open assessment of the same team+kind
--     instead of splitting responses across duplicates.
-- (2) Repoint the respondent notifications from /assessments (the admin
--     overview, since the suite was promoted there) to /assessments/library,
--     where a member actually takes an open assessment.
-- CREATE OR REPLACE preserves grants.

create or replace function public.create_survey(p_team uuid, p_kind text, p_name text, p_due timestamptz default null, p_anonymity text default 'anonymous')
returns public.survey language plpgsql security definer set search_path = '' as $function$
declare v_row public.survey; v_uid uuid := (select auth.uid()); v_body text; v_ws uuid; v_def jsonb;
        v_anon text := case when p_anonymity = 'attributed' then 'attributed' else 'anonymous' end;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can open a survey' using errcode = '42501';
  end if;
  -- Idempotent start: one open instance per team+kind.
  select * into v_row from public.survey
   where team_id = p_team and kind = p_kind and status = 'open'
   order by opened_at desc limit 1;
  if found then return v_row; end if;

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
  perform private.notify(v_row.workspace_id, tm.user_id, 'survey_open', p_name, v_body, '/assessments/library', 'survey', v_row.id)
  from public.team_member tm
  where tm.team_id = p_team and tm.user_id <> v_uid;
  return v_row;
end;
$function$;

create or replace function public.remind_survey(p_survey uuid)
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_team uuid; v_ws uuid; v_name text; v_count int;
begin
  select team_id, workspace_id, name into v_team, v_ws, v_name from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_manage_team(v_team) then raise exception 'only a lead or admin can remind' using errcode = '42501'; end if;
  select count(*) into v_count from public.team_member tm
  where tm.team_id = v_team
    and not exists (select 1 from public.survey_response sr where sr.survey_id = p_survey and sr.respondent_id = tm.user_id);
  perform private.notify(v_ws, tm.user_id, 'survey_due', v_name, 'A reminder to share your read — it only takes ~2 minutes.', '/assessments/library', 'survey', p_survey)
  from public.team_member tm
  where tm.team_id = v_team
    and not exists (select 1 from public.survey_response sr where sr.survey_id = p_survey and sr.respondent_id = tm.user_id);
  return v_count;
end;
$function$;

create or replace function private.process_surveys()
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_closed int; v_reminded int;
begin
  update public.survey set status = 'closed', closed_at = now(), updated_at = now()
  where status = 'open' and due_at is not null and due_at < now();
  get diagnostics v_closed = row_count;

  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  select s.workspace_id, tm.user_id, 'survey_due', s.name, 'Closing soon — share your read (~2 min).', '/assessments/library', 'survey', s.id
  from public.survey s
  join public.team_member tm on tm.team_id = s.team_id
  where s.status = 'open' and s.due_at is not null and s.due_at >= now() and s.due_at <= now() + interval '2 days'
    and not exists (select 1 from public.survey_response sr where sr.survey_id = s.id and sr.respondent_id = tm.user_id)
    and not exists (
      select 1 from public.notification n
      where n.user_id = tm.user_id and n.entity_type = 'survey' and n.entity_id = s.id
        and n.kind = 'survey_due' and n.created_at > now() - interval '2 days'
    );
  get diagnostics v_reminded = row_count;
  return v_closed + v_reminded;
end;
$function$;
