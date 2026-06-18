-- Perception gap: contrast a designated subject's view (usually the leader)
-- against the rest of the team's aggregate, on the same team instrument.
alter table public.survey add column if not exists subject_user_id uuid references auth.users(id) on delete set null;

-- Designate (or clear) the subject. Lead/admin only; subject must be on the team.
create or replace function public.set_survey_subject(p_survey uuid, p_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_manage_team(v_team) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_subject is not null and not exists (
    select 1 from public.team_member where team_id = v_team and user_id = p_subject
  ) then
    raise exception 'subject is not on this team' using errcode = '22023';
  end if;
  update public.survey set subject_user_id = p_subject where id = p_survey;
end;
$$;
revoke execute on function public.set_survey_subject(uuid, uuid) from public, anon;
grant execute on function public.set_survey_subject(uuid, uuid) to authenticated;

-- The gap. Visible to a team manager or the subject themselves. The subject's
-- own self-score is shown (they are named); the rest stay aggregated behind the
-- min-3 mask, so individual raters are never identified.
create or replace function public.survey_perception_gap(p_survey uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_subject uuid; v_kind text; v_ws uuid; v_def jsonb; v_min numeric; v_max numeric;
  v_others_n int; v_subj_present bool; v_per jsonb; v_subj_raw numeric; v_oth_raw numeric; v_span numeric;
begin
  select team_id, subject_user_id, kind into v_team, v_subject, v_kind from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not (private.can_manage_team(v_team) or (select auth.uid()) = v_subject) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_subject is null then return jsonb_build_object('has_subject', false); end if;

  select workspace_id into v_ws from public.team where id = v_team;
  select definition into v_def from public.assessment_template
    where key = v_kind and (workspace_id = v_ws or workspace_id is null)
    order by workspace_id nulls last limit 1;
  if v_def is null then return jsonb_build_object('has_subject', true, 'unknown_instrument', true); end if;
  v_min := coalesce((v_def->'scale'->>'min')::numeric, 1);
  v_max := coalesce((v_def->'scale'->>'max')::numeric, 7);
  v_span := nullif(v_max - v_min, 0);

  select exists(select 1 from public.survey_response where survey_id = p_survey and respondent_id = v_subject) into v_subj_present;
  select count(*) into v_others_n from public.survey_response where survey_id = p_survey and respondent_id <> v_subject;

  with def_items as (
    select it->>'key' as item_key, it->>'dimension' as dim from jsonb_array_elements(v_def->'items') it
  ),
  def_dims as (
    select d->>'key' as dim, d->>'label' as label, ord,
           coalesce((v_def->'weights'->>(d->>'key'))::numeric, 1) as w
    from jsonb_array_elements(v_def->'dimensions') with ordinality as t(d, ord)
  ),
  subj as (
    select di.dim, avg((e.value)::numeric) as m
    from public.survey_response r, jsonb_each_text(r.scores) e join def_items di on di.item_key = e.key
    where r.survey_id = p_survey and r.respondent_id = v_subject group by di.dim
  ),
  oth as (
    select di.dim, avg((e.value)::numeric) as m
    from public.survey_response r, jsonb_each_text(r.scores) e join def_items di on di.item_key = e.key
    where r.survey_id = p_survey and r.respondent_id <> v_subject group by di.dim
  ),
  per as (
    select dd.dim, dd.label, dd.ord, dd.w,
           (select round(m, 2) from subj where subj.dim = dd.dim) as subject,
           case when v_others_n >= 3 then (select round(m, 2) from oth where oth.dim = dd.dim) else null end as others
    from def_dims dd
  )
  select
    jsonb_agg(jsonb_build_object('key', dim, 'label', label, 'subject', subject, 'others', others) order by ord),
    sum(subject * w) / nullif(sum(case when subject is not null then w end), 0),
    sum(others * w)  / nullif(sum(case when others is not null then w end), 0)
  into v_per, v_subj_raw, v_oth_raw
  from per;

  return jsonb_build_object(
    'has_subject', true,
    'subject_present', v_subj_present,
    'others_n', v_others_n,
    'others_masked', v_others_n < 3,
    'per_dim', coalesce(v_per, '[]'::jsonb),
    'subject_composite', case when v_subj_present and v_span is not null then round(((v_subj_raw - v_min) / v_span) * 100, 1) else null end,
    'others_composite',  case when v_others_n >= 3 and v_span is not null then round(((v_oth_raw - v_min) / v_span) * 100, 1) else null end,
    'gap', case when v_subj_present and v_others_n >= 3 and v_span is not null
                then round((((v_subj_raw - v_min) / v_span) - ((v_oth_raw - v_min) / v_span)) * 100, 1) else null end
  );
end;
$$;
revoke execute on function public.survey_perception_gap(uuid) from public, anon;
grant execute on function public.survey_perception_gap(uuid) to authenticated;
