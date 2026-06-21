-- Non-Likert question answers (single choice / multi-select / free text) for
-- builder-authored assessments. These are NOT numerically scored, so they live
-- in a dedicated `answers` jsonb — `scores` stays numeric-only and the scoring
-- casts (jsonb_each_text -> numeric) remain valid.

alter table public.survey_response add column if not exists answers jsonb not null default '{}'::jsonb;

-- Recreate the submit RPCs with an added p_answers (defaulted, so existing
-- 2-/3-arg named calls keep resolving). Drop first to keep a single overload.
drop function if exists public.submit_survey_response(uuid, jsonb, jsonb);
create function public.submit_survey_response(
  p_survey uuid, p_scores jsonb, p_comments jsonb default '{}'::jsonb, p_answers jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_status text; v_anon text; v_salt text; v_uid uuid := (select auth.uid()); v_hash text;
        v_comments jsonb := coalesce(p_comments, '{}'::jsonb);
        v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
begin
  select team_id, status, anonymity, respondent_salt into v_team, v_status, v_anon, v_salt
    from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not a team member' using errcode = '42501'; end if;
  if v_status <> 'open' then raise exception 'survey is closed' using errcode = '22023'; end if;

  if v_anon = 'attributed' then
    insert into public.survey_response (survey_id, respondent_id, scores, comments, answers)
    values (p_survey, v_uid, p_scores, v_comments, v_answers)
    on conflict (survey_id, respondent_id) where respondent_id is not null
      do update set scores = excluded.scores, comments = excluded.comments, answers = excluded.answers, created_at = now();
  else
    v_hash := md5(v_salt || v_uid::text);
    insert into public.survey_response (survey_id, respondent_id, respondent_hash, scores, comments, answers)
    values (p_survey, null, v_hash, p_scores, v_comments, v_answers)
    on conflict (survey_id, respondent_hash) where respondent_hash is not null
      do update set scores = excluded.scores, comments = excluded.comments, answers = excluded.answers, created_at = now();
  end if;

  delete from public.survey_response_draft where survey_id = p_survey and respondent_id = v_uid;
end;
$$;
grant execute on function public.submit_survey_response(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;

drop function if exists public.submit_public_survey_response(text, jsonb, jsonb);
create function public.submit_public_survey_response(
  p_token text, p_scores jsonb, p_comments jsonb default '{}'::jsonb, p_answers jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status text; v_hash text;
        v_comments jsonb := coalesce(p_comments, '{}'::jsonb);
        v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid link' using errcode = '22023';
  end if;
  select id, status into v_id, v_status from public.survey where share_token = p_token;
  if v_id is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if v_status <> 'open' then raise exception 'survey is closed' using errcode = '22023'; end if;

  v_hash := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.survey_response (survey_id, respondent_id, respondent_hash, scores, comments, answers)
  values (v_id, null, v_hash, p_scores, v_comments, v_answers);
end;
$$;
grant execute on function public.submit_public_survey_response(text, jsonb, jsonb, jsonb) to anon, authenticated, service_role;
