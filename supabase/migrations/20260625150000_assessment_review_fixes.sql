-- =====================================================================
-- Assessment engine — review fixes
-- 1. Lifecycle RPCs (close / pause / share / subject) gated the PRIMARY team
--    only; the multi-team model grants manage rights to a lead/admin of ANY
--    targeted team. Switch them to private.survey_can_manage so the UI's
--    manage affordances and the server agree.
-- 2. Anonymous responses store respondent_id = NULL, so a direct
--    survey_response read (RLS: respondent_id = auth.uid()) returns nothing —
--    the detail "Responses" timestamp list was always empty for anonymous
--    surveys. Expose timestamps via a SECURITY DEFINER RPC gated on
--    survey_can_manage and the privacy floor, never exposing respondent_id.
-- =====================================================================

create or replace function public.close_survey(p_survey uuid)
returns public.survey language plpgsql security definer set search_path = '' as $$
declare v_row public.survey;
begin
  if not private.survey_can_manage(p_survey) then
    raise exception 'only a team lead or admin can close a survey' using errcode = '42501';
  end if;
  update public.survey set status = 'closed', closed_at = now(), updated_at = now()
  where id = p_survey returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.set_survey_paused(p_survey uuid, p_paused boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.survey where id = p_survey;
  if v_status is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.survey_can_manage(p_survey) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status not in ('open', 'paused') then raise exception 'can only pause an open assessment' using errcode = '22023'; end if;
  update public.survey set status = case when p_paused then 'paused' else 'open' end, updated_at = now()
  where id = p_survey;
end;
$$;

create or replace function public.survey_share_set(p_survey uuid, p_on boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_anon text; v_tok text;
begin
  select anonymity into v_anon from public.survey where id = p_survey;
  if v_anon is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.survey_can_manage(p_survey) then
    raise exception 'only a team lead or admin can share a survey' using errcode = '42501';
  end if;
  if p_on then
    if v_anon <> 'anonymous' then
      raise exception 'only anonymous surveys can be shared by public link' using errcode = '22023';
    end if;
    select share_token into v_tok from public.survey where id = p_survey;
    if v_tok is null then
      v_tok := encode(extensions.gen_random_bytes(16), 'hex');
      update public.survey set share_token = v_tok, shared_at = now() where id = p_survey;
    end if;
    return v_tok;
  end if;
  update public.survey set share_token = null, shared_at = null where id = p_survey;
  return null;
end;
$$;

create or replace function public.set_survey_subject(p_survey uuid, p_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select id from public.survey where id = p_survey) is null then
    raise exception 'survey not found' using errcode = '23503';
  end if;
  if not private.survey_can_manage(p_survey) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- the subject must belong to one of the targeted teams
  if p_subject is not null and not exists (
    select 1 from public.team_member tm
    where tm.user_id = p_subject and tm.team_id in (select private.survey_team_ids(p_survey))
  ) then
    raise exception 'subject is not on this team' using errcode = '22023';
  end if;
  update public.survey set subject_user_id = p_subject where id = p_survey;
end;
$$;

-- Anonymous submission timestamps for the detail "Responses" tab. Manager-only,
-- masked under the privacy floor, and never exposes respondent_id / identity.
create or replace function public.survey_submissions(p_survey uuid)
returns table(submitted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_floor int; v_n int;
begin
  select greatest(3, min_participants) into v_floor from public.survey where id = p_survey;
  if v_floor is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.survey_can_manage(p_survey) then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < v_floor then return; end if;
  return query
    select sr.created_at from public.survey_response sr
    where sr.survey_id = p_survey order by sr.created_at desc;
end;
$$;

revoke execute on function public.survey_submissions(uuid) from public, anon;
grant execute on function public.survey_submissions(uuid) to authenticated;
