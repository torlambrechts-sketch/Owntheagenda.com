-- Server-side, cross-device resume for team surveys. The shared AssessmentRunner
-- already autosaves to localStorage; this persists a respondent's in-progress
-- answers server-side so they can start on one device and finish on another.
-- Only the respondent's own draft is readable; writes go through definer RPCs.

create table if not exists public.survey_response_draft (
  survey_id uuid not null references public.survey(id) on delete cascade,
  respondent_id uuid not null references auth.users(id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (survey_id, respondent_id)
);
alter table public.survey_response_draft enable row level security;
create policy survey_draft_select_own on public.survey_response_draft
  for select to authenticated using (respondent_id = (select auth.uid()));

-- Upsert my in-progress answers (open surveys only; closed ones silently ignore).
create or replace function public.save_survey_draft(p_survey uuid, p_scores jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_status text;
begin
  select team_id, status into v_team, v_status from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not a team member' using errcode = '42501'; end if;
  if v_status <> 'open' then return; end if;
  insert into public.survey_response_draft (survey_id, respondent_id, scores, updated_at)
  values (p_survey, (select auth.uid()), coalesce(p_scores, '{}'::jsonb), now())
  on conflict (survey_id, respondent_id) do update set scores = excluded.scores, updated_at = now();
end;
$$;
revoke execute on function public.save_survey_draft(uuid, jsonb) from public, anon;
grant execute on function public.save_survey_draft(uuid, jsonb) to authenticated;

-- Read my draft (null when none).
create or replace function public.get_survey_draft(p_survey uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_scores jsonb;
begin
  select scores into v_scores from public.survey_response_draft
   where survey_id = p_survey and respondent_id = (select auth.uid());
  return v_scores;
end;
$$;
revoke execute on function public.get_survey_draft(uuid) from public, anon;
grant execute on function public.get_survey_draft(uuid) to authenticated;

-- Submitting the real response clears the draft. Behaviour otherwise unchanged.
create or replace function public.submit_survey_response(p_survey uuid, p_scores jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_status text;
begin
  select team_id, status into v_team, v_status from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not a team member' using errcode = '42501'; end if;
  if v_status <> 'open' then raise exception 'survey is closed' using errcode = '22023'; end if;
  insert into public.survey_response (survey_id, respondent_id, scores)
  values (p_survey, (select auth.uid()), p_scores)
  on conflict (survey_id, respondent_id) do update set scores = excluded.scores, created_at = now();
  delete from public.survey_response_draft where survey_id = p_survey and respondent_id = (select auth.uid());
end;
$$;
revoke execute on function public.submit_survey_response(uuid, jsonb) from public, anon;
grant execute on function public.submit_survey_response(uuid, jsonb) to authenticated;
