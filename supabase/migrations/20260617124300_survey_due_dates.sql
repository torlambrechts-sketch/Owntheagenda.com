-- Date-bound surveys: deadline, reminders to non-responders, auto-close.
alter table public.survey add column if not exists due_at timestamptz;

-- Replace create_survey with a deadline-aware version (drop the 3-arg first to
-- avoid an ambiguous overload).
drop function if exists public.create_survey(uuid, text, text);
create or replace function public.create_survey(p_team uuid, p_kind text, p_name text, p_due timestamptz default null)
returns public.survey language plpgsql security definer set search_path = '' as $$
declare v_row public.survey; v_uid uuid := (select auth.uid()); v_body text;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can open a survey' using errcode = '42501';
  end if;
  insert into public.survey (team_id, kind, name, status, opened_at, due_at, created_by)
  values (p_team, p_kind, p_name, 'open', now(), p_due, v_uid)
  returning * into v_row;
  v_body := case when p_due is not null
    then 'Due by ' || to_char(p_due, 'Mon DD') || ' — ~2 minutes, anonymous in aggregate.'
    else 'Share your read in ~2 minutes — anonymous in aggregate.' end;
  perform private.notify(v_row.workspace_id, tm.user_id, 'survey_open', p_name, v_body, '/assessments', 'survey', v_row.id)
  from public.team_member tm
  where tm.team_id = p_team and tm.user_id <> v_uid;
  return v_row;
end;
$$;
revoke execute on function public.create_survey(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.create_survey(uuid, text, text, timestamptz) to authenticated;

-- Manual nudge to everyone who hasn't responded yet.
create or replace function public.remind_survey(p_survey uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_ws uuid; v_name text; v_count int;
begin
  select team_id, workspace_id, name into v_team, v_ws, v_name from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_manage_team(v_team) then raise exception 'only a lead or admin can remind' using errcode = '42501'; end if;
  select count(*) into v_count from public.team_member tm
  where tm.team_id = v_team
    and not exists (select 1 from public.survey_response sr where sr.survey_id = p_survey and sr.respondent_id = tm.user_id);
  perform private.notify(v_ws, tm.user_id, 'survey_due', v_name, 'A reminder to share your read — it only takes ~2 minutes.', '/assessments', 'survey', p_survey)
  from public.team_member tm
  where tm.team_id = v_team
    and not exists (select 1 from public.survey_response sr where sr.survey_id = p_survey and sr.respondent_id = tm.user_id);
  return v_count;
end;
$$;
revoke execute on function public.remind_survey(uuid) from public, anon;
grant execute on function public.remind_survey(uuid) to authenticated;

-- Daily: auto-close past-due surveys + remind non-responders for those due soon.
create or replace function private.process_surveys()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_closed int; v_reminded int;
begin
  update public.survey set status = 'closed', closed_at = now(), updated_at = now()
  where status = 'open' and due_at is not null and due_at < now();
  get diagnostics v_closed = row_count;

  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  select s.workspace_id, tm.user_id, 'survey_due', s.name, 'Closing soon — share your read (~2 min).', '/assessments', 'survey', s.id
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
$$;
revoke execute on function private.process_surveys() from public;
select cron.schedule('survey-maintenance', '5 7 * * *', $$select private.process_surveys();$$);
