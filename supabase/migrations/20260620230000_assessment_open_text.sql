-- =====================================================================
-- Assessment open-text — Phase N. Surveys can now collect free-text
-- comments alongside the Likert scores. Comments are keyed by dimension
-- (or 'general'). They surface only above the privacy floor (>=3 responses),
-- and identity follows the survey's anonymity mode: attributed comments
-- carry the author's name, anonymous comments are "Anonymous Participant".
-- =====================================================================

alter table public.survey_response add column if not exists comments jsonb not null default '{}'::jsonb;

-- submit accepts optional comments (keyed by dimension, e.g. {"general":"…"}).
drop function if exists public.submit_survey_response(uuid, jsonb);
create function public.submit_survey_response(p_survey uuid, p_scores jsonb, p_comments jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_status text; v_anon text; v_salt text; v_uid uuid := (select auth.uid()); v_hash text;
        v_comments jsonb := coalesce(p_comments, '{}'::jsonb);
begin
  select team_id, status, anonymity, respondent_salt into v_team, v_status, v_anon, v_salt
    from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not a team member' using errcode = '42501'; end if;
  if v_status <> 'open' then raise exception 'survey is closed' using errcode = '22023'; end if;

  if v_anon = 'attributed' then
    insert into public.survey_response (survey_id, respondent_id, scores, comments)
    values (p_survey, v_uid, p_scores, v_comments)
    on conflict (survey_id, respondent_id) where respondent_id is not null
      do update set scores = excluded.scores, comments = excluded.comments, created_at = now();
  else
    v_hash := md5(v_salt || v_uid::text);
    insert into public.survey_response (survey_id, respondent_id, respondent_hash, scores, comments)
    values (p_survey, null, v_hash, p_scores, v_comments)
    on conflict (survey_id, respondent_hash) where respondent_hash is not null
      do update set scores = excluded.scores, comments = excluded.comments, created_at = now();
  end if;

  delete from public.survey_response_draft where survey_id = p_survey and respondent_id = v_uid;
end;
$$;

-- Grouped comments for a survey. Masked below the privacy floor. Author name
-- only in attributed mode (and only for team-readable callers).
create or replace function public.survey_comments(p_survey uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_anon text; v_n int; v_rows jsonb;
begin
  select team_id, anonymity into v_team, v_anon from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < 3 then
    return jsonb_build_object('masked', true, 'respondents', v_n, 'comments', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'dimension', c.dim,
           'text', c.txt,
           'author', case when v_anon = 'attributed'
                          then coalesce(pr.full_name, pr.display_name, pr.email, 'Member')
                          else 'Anonymous Participant' end
         ) order by c.dim), '[]'::jsonb)
    into v_rows
  from public.survey_response r
  cross join lateral jsonb_each_text(r.comments) as c(dim, txt)
  left join public.profile pr on pr.id = r.respondent_id
  where r.survey_id = p_survey and coalesce(btrim(c.txt), '') <> '';

  return jsonb_build_object('masked', false, 'respondents', v_n, 'comments', v_rows);
end;
$$;

grant execute on function
  public.submit_survey_response(uuid, jsonb, jsonb),
  public.survey_comments(uuid)
to authenticated;
revoke execute on function
  public.submit_survey_response(uuid, jsonb, jsonb),
  public.survey_comments(uuid)
from public, anon;
