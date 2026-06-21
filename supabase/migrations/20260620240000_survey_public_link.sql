-- =====================================================================
-- Tokenized distribution — Phase O. A lead/admin can mint a public link to
-- an *anonymous* survey so people outside the app (or not yet signed in) can
-- respond without an account. Mirrors the session share-token pattern.
--
-- Public submissions are always anonymous: there is no auth.uid() on the
-- public path, so each response is stored with a random respondent_hash
-- (one row = one respondent, which the flow gate already counts via count(*)).
-- Only anonymous surveys can be shared — an attributed survey can't honour a
-- nameless link, so minting on one is refused.
-- =====================================================================

alter table public.survey add column if not exists share_token text unique;
alter table public.survey add column if not exists shared_at   timestamptz;

-- ----- mint / revoke the public link (lead or admin; anonymous only) -----
create or replace function public.survey_share_set(p_survey uuid, p_on boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_anon text; v_tok text;
begin
  select team_id, anonymity into v_team, v_anon from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_manage_team(v_team) then
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

-- ----- public render metadata (anon-readable by valid token) -----
-- Returns just enough to render the form: the instrument snapshot, the name,
-- and whether it's still open. Never exposes responses or team identity.
create or replace function public.public_survey_meta(p_token text)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare v_s public.survey;
begin
  if p_token is null or length(p_token) < 16 then return null; end if;
  select * into v_s from public.survey where share_token = p_token;
  if v_s.id is null then return null; end if;
  return jsonb_build_object(
    'name', v_s.name,
    'kind', v_s.kind,
    'open', v_s.status = 'open',
    'definition', coalesce(v_s.definition, '{}'::jsonb)
  );
end;
$$;

-- ----- public submit (anon) — always anonymous, random per-response hash -----
create or replace function public.submit_public_survey_response(
  p_token text, p_scores jsonb, p_comments jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status text; v_hash text;
        v_comments jsonb := coalesce(p_comments, '{}'::jsonb);
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid link' using errcode = '22023';
  end if;
  select id, status into v_id, v_status from public.survey where share_token = p_token;
  if v_id is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if v_status <> 'open' then raise exception 'survey is closed' using errcode = '22023'; end if;

  -- Each public response is a distinct anonymous row. A random hash keeps the
  -- (survey_id, respondent_hash) partial-unique index satisfied without ever
  -- tying the row to a person.
  v_hash := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.survey_response (survey_id, respondent_id, respondent_hash, scores, comments)
  values (v_id, null, v_hash, p_scores, v_comments);
end;
$$;

grant execute on function public.survey_share_set(uuid, boolean) to authenticated;
revoke execute on function public.survey_share_set(uuid, boolean) from public, anon;
grant execute on function public.public_survey_meta(text) to anon, authenticated;
grant execute on function public.submit_public_survey_response(text, jsonb, jsonb) to anon, authenticated;
