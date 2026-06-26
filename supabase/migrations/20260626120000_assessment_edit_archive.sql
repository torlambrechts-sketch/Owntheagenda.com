-- =====================================================================
-- Assessment edit / delete / archive (handoff 3).
--  * update_assessment: edit the editable metadata (title, schedule,
--    reminders, min-participants) and ADD recipients (teams/emails). The
--    anonymity mode and the instrument/questions are intentionally NOT
--    editable here — changing them after responses exist would corrupt
--    scoring or de-anonymise. Schedule edits flip draft<->scheduled.
--  * delete_or_archive_assessment: a draft / response-less assessment is
--    hard-deleted; anything with responses is soft-archived (archived_at)
--    and closed, so its data is retained but it drops out of the lists.
--  * assessment_suite_overview now excludes archived assessments.
-- Manage rights follow private.survey_can_manage (lead/admin of any
-- targeted team) plus the creator.
-- =====================================================================

alter table public.survey add column if not exists archived_at timestamptz;
create index if not exists survey_archived_idx on public.survey (workspace_id) where archived_at is null;

-- ---- edit metadata + additive recipients + schedule ------------------
create or replace function public.update_assessment(
  p_survey           uuid,
  p_name             text        default null,
  p_start            timestamptz default null,
  p_due              timestamptz default null,
  p_clear_start      boolean     default false,
  p_clear_due        boolean     default false,
  p_reminders        boolean     default null,
  p_min_participants int         default null,
  p_add_teams        uuid[]      default '{}',
  p_add_emails       text[]      default '{}'
) returns public.survey language plpgsql security definer set search_path = '' as $$
declare v_row public.survey; v_ws uuid; v_status text; v_start timestamptz; v_team uuid; v_email text;
begin
  select workspace_id, status, start_at into v_ws, v_status, v_start from public.survey where id = p_survey;
  if v_ws is null then raise exception 'assessment not found' using errcode = '23503'; end if;
  if not private.survey_can_manage(p_survey) then
    raise exception 'only a team lead or admin can edit this assessment' using errcode = '42501';
  end if;
  if (select archived_at from public.survey where id = p_survey) is not null then
    raise exception 'assessment is archived' using errcode = '22023';
  end if;

  -- additive recipients: every added team must be in the same workspace and
  -- managed by the caller; emails just append.
  foreach v_team in array coalesce(p_add_teams, '{}') loop
    if private.team_workspace(v_team) <> v_ws then
      raise exception 'teams must share a workspace' using errcode = '22023';
    end if;
    if not private.can_manage_team(v_team) then
      raise exception 'only a team lead or admin can target a team' using errcode = '42501';
    end if;
    insert into public.survey_team (survey_id, team_id) values (p_survey, v_team) on conflict do nothing;
  end loop;
  foreach v_email in array coalesce(p_add_emails, '{}') loop
    if position('@' in v_email) > 1 then
      insert into public.survey_invite (survey_id, email) values (p_survey, btrim(v_email)) on conflict do nothing;
    end if;
  end loop;

  -- compute the resulting start_at (clear wins over set)
  v_start := case when p_clear_start then null when p_start is not null then p_start else v_start end;

  update public.survey s set
    name = coalesce(nullif(btrim(p_name), ''), s.name),
    reminders = coalesce(p_reminders, s.reminders),
    min_participants = case when p_min_participants is not null then greatest(3, p_min_participants) else s.min_participants end,
    start_at = v_start,
    due_at = case when p_clear_due then null when p_due is not null then p_due else s.due_at end,
    -- a draft with a start date becomes scheduled; a scheduled one with the
    -- date cleared falls back to draft. open/closed/paused are untouched.
    status = case
      when s.status = 'draft'     and v_start is not null then 'scheduled'
      when s.status = 'scheduled' and v_start is null     then 'draft'
      else s.status end,
    updated_at = now()
  where s.id = p_survey
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.update_assessment(uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, int, uuid[], text[]) from public, anon;
grant  execute on function public.update_assessment(uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, int, uuid[], text[]) to authenticated;

-- ---- delete (drafts) / archive (has responses) ----------------------
create or replace function public.delete_or_archive_assessment(p_survey uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_creator uuid; v_uid uuid := (select auth.uid()); v_n int;
begin
  select created_by into v_creator from public.survey where id = p_survey;
  if not found then raise exception 'assessment not found' using errcode = '23503'; end if;
  if not (private.survey_can_manage(p_survey) or v_creator = v_uid) then
    raise exception 'only a manager or the creator can remove this assessment' using errcode = '42501';
  end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n = 0 then
    delete from public.survey where id = p_survey;  -- cascades survey_team / survey_invite
    return 'deleted';
  end if;
  update public.survey set archived_at = now(),
    status = case when status in ('open','scheduled','paused') then 'closed' else status end,
    closed_at = coalesce(closed_at, now()), updated_at = now()
  where id = p_survey;
  return 'archived';
end;
$$;
revoke execute on function public.delete_or_archive_assessment(uuid) from public, anon;
grant  execute on function public.delete_or_archive_assessment(uuid) to authenticated;

-- ---- keep archived assessments out of the suite overview ------------
create or replace function public.assessment_suite_overview(p_workspace uuid)
returns table(
  survey_id uuid, respondents int, invited int, masked boolean,
  overall_mean numeric, overall_pct numeric, below_count int, has_workshop boolean
)
language plpgsql security definer set search_path = '' as $$
declare r record; v_eff int; v_floor int; v_min numeric; v_max numeric; v_overall numeric; v_below int;
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in
    select s.id, s.team_id, s.subject_user_id, greatest(3, s.min_participants) as floor,
      coalesce(
        (select t.definition from public.assessment_template t
          where t.key = s.kind and (t.workspace_id = p_workspace or t.workspace_id is null)
          order by t.workspace_id nulls last limit 1),
        s.definition
      ) as definition
    from public.survey s
    where s.workspace_id = p_workspace and s.archived_at is null
      and private.survey_can_read(s.id)
  loop
    select count(*) into respondents from public.survey_response sr where sr.survey_id = r.id;
    select count(*) into invited from private.survey_member_ids(r.id);
    select invited + count(*) into invited from public.survey_invite si where si.survey_id = r.id;
    select exists(select 1 from public.block b where b.survey_id = r.id and b.workshop_id is not null) into has_workshop;
    v_floor := r.floor;
    if r.subject_user_id is not null then
      select count(*) into v_eff from public.survey_response sr where sr.survey_id = r.id and sr.respondent_id <> r.subject_user_id;
    else
      v_eff := respondents;
    end if;
    survey_id := r.id; masked := true; overall_mean := null; overall_pct := null; below_count := 0;
    if v_eff >= v_floor
       and coalesce(jsonb_typeof(r.definition -> 'dimensions'), '') = 'array'
       and coalesce(jsonb_typeof(r.definition -> 'items'), '') = 'array' then
      v_min := (r.definition #>> '{scale,min}')::numeric;
      v_max := (r.definition #>> '{scale,max}')::numeric;
      if v_min is not null and v_max is not null and v_max <> v_min then
        with per_item as (
          select e.key as item_key, avg((e.value)::numeric) as mean
          from public.survey_response sr, jsonb_each_text(sr.scores) e
          where sr.survey_id = r.id group by e.key
        ),
        def_dims as ( select d ->> 'key' as key from jsonb_array_elements(r.definition -> 'dimensions') d ),
        def_items as (
          select it ->> 'key' as key, it ->> 'dimension' as dimension,
                 coalesce(it ->> 'type', 'likert') as typ, coalesce((it ->> 'reverse')::boolean, false) as reverse
          from jsonb_array_elements(r.definition -> 'items') it
          where coalesce(it ->> 'type', 'likert') in ('likert','rating10')
        ),
        scaled as (
          select di.dimension, di.reverse,
                 case when di.typ = 'rating10' then v_min + (pi.mean - 1) / 9.0 * (v_max - v_min) else pi.mean end as mean
          from def_items di join def_dims dd on dd.key = di.dimension join per_item pi on pi.item_key = di.key
        ),
        dim_means as (
          select dimension, round(avg(case when reverse then v_min + v_max - mean else mean end), 2) as dmean
          from scaled group by dimension
        )
        select round(avg(dmean), 2), count(*) filter (where ((dmean - v_min) / (v_max - v_min)) * 100 < 45)
          into v_overall, v_below from dim_means where dmean is not null;
        if v_overall is not null then
          masked := false; overall_mean := v_overall;
          overall_pct := round(((v_overall - v_min) / (v_max - v_min)) * 100, 1);
          below_count := coalesce(v_below, 0);
        end if;
      end if;
    end if;
    return next;
  end loop;
end;
$$;
grant execute on function public.assessment_suite_overview(uuid) to authenticated;
revoke execute on function public.assessment_suite_overview(uuid) from public, anon;
