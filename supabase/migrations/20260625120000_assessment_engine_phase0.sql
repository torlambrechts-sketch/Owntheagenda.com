-- =====================================================================
-- Assessment Engine — Phase 0 (schema & scoring foundation)
-- ---------------------------------------------------------------------
-- 1. Multi-recipient model: one assessment can target several teams
--    (survey_team) plus individual/external email invites (survey_invite),
--    instead of one survey per team. Eligibility, the response roster,
--    reminders and the suite "invited" count all become multi-team aware
--    via centralised helpers.
-- 2. Configurable privacy floor: survey.min_participants (default 5) gates
--    when aggregates unmask — never below the hard floor of 3.
-- 3. Scheduled launch: survey.start_at + 'scheduled'/'draft' statuses; the
--    daily maintenance job flips a scheduled survey to 'open' at start_at.
-- 4. Rating-10 questions roll into section bands like Likert, normalised
--    onto the instrument scale before averaging.
-- All additive / idempotent; existing surveys keep their current behaviour
-- (backfilled to a floor of 3).
-- =====================================================================

-- ---- 1. new survey columns ------------------------------------------
alter table public.survey
  add column if not exists start_at        timestamptz,
  add column if not exists min_participants int  not null default 5,
  add column if not exists channels         text[] not null default '{email}',
  add column if not exists reminders        boolean not null default true;

-- Hard privacy floor is 3; never let the configurable value drop below it.
alter table public.survey drop constraint if exists survey_min_participants_floor;
alter table public.survey add constraint survey_min_participants_floor
  check (min_participants >= 3);

-- Preserve current visibility for surveys created before this change
-- (the new default of 5 only applies to assessments created from here on).
update public.survey set min_participants = 3 where min_participants = 5;

-- ---- 2. recipient tables --------------------------------------------
-- Extra target teams (the survey's own team_id is the primary; this holds
-- every selected team, primary included, so the helpers can union cleanly).
create table if not exists public.survey_team (
  survey_id uuid not null references public.survey(id) on delete cascade,
  team_id   uuid not null references public.team(id)   on delete cascade,
  primary key (survey_id, team_id)
);
alter table public.survey_team enable row level security;
drop policy if exists survey_team_select on public.survey_team;
create policy survey_team_select on public.survey_team
  for select to authenticated using (private.can_read_team(team_id));
grant select on public.survey_team to authenticated;

-- Individual / external email invites (no-login link recipients).
create table if not exists public.survey_invite (
  id         uuid primary key default gen_random_uuid(),
  survey_id  uuid not null references public.survey(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists survey_invite_uq
  on public.survey_invite (survey_id, lower(email));
alter table public.survey_invite enable row level security;
grant select on public.survey_invite to authenticated;

-- ---- 3. eligibility helpers -----------------------------------------
-- Every team a survey targets (primary + extras). SECURITY DEFINER so it can
-- be used inside the survey RLS policy without recursing into that policy.
create or replace function private.survey_team_ids(p_survey uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.team_id from public.survey s where s.id = p_survey
  union
  select st.team_id from public.survey_team st where st.survey_id = p_survey;
$$;

-- Union of member user_ids across all targeted teams.
create or replace function private.survey_member_ids(p_survey uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct tm.user_id
  from public.team_member tm
  where tm.team_id in (select private.survey_team_ids(p_survey));
$$;

-- Can the current user respond? Member of any targeted team, or invited by email.
create or replace function private.survey_can_respond(p_survey uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_member tm
    where tm.team_id in (select private.survey_team_ids(p_survey))
      and tm.user_id = (select auth.uid())
  ) or exists (
    select 1 from public.survey_invite si
    join auth.users u on lower(u.email) = lower(si.email)
    where si.survey_id = p_survey and u.id = (select auth.uid())
  );
$$;

-- Can the current user read the survey (respond, or manage/read any targeted team)?
create or replace function private.survey_can_read(p_survey uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.survey_can_respond(p_survey)
      or exists (select 1 from private.survey_team_ids(p_survey) t(id)
                 where private.can_read_team(t.id));
$$;

-- Can the current user manage the survey (lead/admin of any targeted team)?
create or replace function private.survey_can_manage(p_survey uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.survey_team_ids(p_survey) t(id)
                 where private.can_manage_team(t.id));
$$;

grant execute on function
  private.survey_team_ids(uuid), private.survey_member_ids(uuid),
  private.survey_can_respond(uuid), private.survey_can_read(uuid),
  private.survey_can_manage(uuid)
to authenticated;

-- survey_invite visibility: managers of the survey, or the invited user.
drop policy if exists survey_invite_select on public.survey_invite;
create policy survey_invite_select on public.survey_invite
  for select to authenticated using (
    private.survey_can_manage(survey_id)
    or exists (select 1 from auth.users u
               where u.id = (select auth.uid()) and lower(u.email) = lower(email))
  );

-- Additive survey visibility for secondary-team members + invitees (the
-- original survey_select policy still covers the primary team).
drop policy if exists survey_select_targeted on public.survey;
create policy survey_select_targeted on public.survey
  for select to authenticated using (private.survey_can_read(id));

-- ---- 4. eligibility wired into the response path --------------------
create or replace function public.submit_survey_response(
  p_survey uuid, p_scores jsonb, p_comments jsonb default '{}'::jsonb, p_answers jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_anon text; v_salt text; v_uid uuid := (select auth.uid()); v_hash text;
        v_comments jsonb := coalesce(p_comments, '{}'::jsonb);
        v_answers  jsonb := coalesce(p_answers, '{}'::jsonb);
begin
  select status, anonymity, respondent_salt into v_status, v_anon, v_salt
    from public.survey where id = p_survey;
  if v_status is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.survey_can_respond(p_survey) then
    raise exception 'not an invited respondent' using errcode = '42501';
  end if;
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

-- Roster across every targeted team (lead/admin of any targeted team).
create or replace function public.survey_participation(p_survey uuid)
returns table (user_id uuid, completed boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.survey_can_manage(p_survey) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.id as user_id,
           exists (
             select 1 from public.survey_response sr
             where sr.survey_id = p_survey and sr.respondent_id = m.id
           )
    from private.survey_member_ids(p_survey) m(id);
end;
$$;
grant execute on function public.survey_participation(uuid) to authenticated;

-- Reminders nudge non-responders across every targeted team.
create or replace function public.remind_survey(p_survey uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_name text; v_count int;
begin
  select workspace_id, name into v_ws, v_name from public.survey where id = p_survey;
  if v_ws is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.survey_can_manage(p_survey) then raise exception 'only a lead or admin can remind' using errcode = '42501'; end if;
  select count(*) into v_count from private.survey_member_ids(p_survey) m(id)
    where not exists (select 1 from public.survey_response sr where sr.survey_id = p_survey and sr.respondent_id = m.id);
  perform private.notify(v_ws, m.id, 'survey_due', v_name, 'A reminder to share your read — it only takes ~2 minutes.', '/assessments/take', 'survey', p_survey)
  from private.survey_member_ids(p_survey) m(id)
  where not exists (select 1 from public.survey_response sr where sr.survey_id = p_survey and sr.respondent_id = m.id);
  return v_count;
end;
$$;
grant execute on function public.remind_survey(uuid) to authenticated;

-- ---- 5. configurable privacy floor in the aggregators ---------------
-- survey_results: floor = greatest(3, min_participants).
create or replace function public.survey_results(p_survey uuid, p_strength_items text[] default '{}'::text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_subject uuid; v_floor int; v_n integer; v_eff integer; v_comp numeric; v_result jsonb;
begin
  select kind, subject_user_id, greatest(3, min_participants) into v_kind, v_subject, v_floor
    from public.survey where id = p_survey;
  if v_kind is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.survey_can_read(p_survey) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_subject is not null then
    select count(*) into v_eff from public.survey_response where survey_id = p_survey and respondent_id <> v_subject;
  else
    v_eff := v_n;
  end if;
  if v_eff < v_floor then
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
grant execute on function public.survey_results(uuid, text[]) to authenticated;

-- survey_comments: same configurable floor; multi-team read gate.
create or replace function public.survey_comments(p_survey uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_anon text; v_floor int; v_n int; v_rows jsonb;
begin
  select anonymity, greatest(3, min_participants) into v_anon, v_floor from public.survey where id = p_survey;
  if v_anon is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.survey_can_read(p_survey) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < v_floor then
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
grant execute on function public.survey_comments(uuid) to authenticated;

-- ---- 6. rating-10 aware server composite ----------------------------
-- Rating-10 item means are normalised onto the instrument scale
-- (1..10 -> min..max) before reverse-flip + dimension averaging, so a
-- rating question rolls into the same band as Likert.
create or replace function private.survey_composite(p_survey uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_team uuid; v_ws uuid; v_def jsonb; v_min numeric; v_max numeric; v_n int; v_comp numeric;
begin
  select s.kind, s.team_id, s.definition into v_kind, v_team, v_def from public.survey s where s.id = p_survey;
  if v_kind is null then return null; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < 3 then return null; end if;
  if v_def is null then
    select workspace_id into v_ws from public.team where id = v_team;
    select t.definition into v_def from public.assessment_template t
      where t.key = v_kind and (t.workspace_id = v_ws or t.workspace_id is null)
      order by t.workspace_id nulls last limit 1;
  end if;
  if v_def is null then return null; end if;
  v_min := coalesce((v_def->'scale'->>'min')::numeric, 1);
  v_max := coalesce((v_def->'scale'->>'max')::numeric, 7);
  if v_max = v_min then return null; end if;

  with item_mean as (
    select e.key as item_key, avg((e.value)::numeric) as m
    from public.survey_response r, jsonb_each_text(r.scores) e
    where r.survey_id = p_survey group by e.key
  ),
  def_items as (
    select it->>'key' as item_key,
           it->>'dimension' as dim,
           coalesce(it->>'type','likert') as typ,
           coalesce((it->>'reverse')::boolean, false) as rev
    from jsonb_array_elements(v_def->'items') it
    where coalesce(it->>'type','likert') in ('likert','rating10')
  ),
  norm as (
    -- put rating-10 onto the instrument scale, then reverse-flip if needed.
    select di.dim, di.w,
           case when di.rev then (v_min + v_max - di.scaled) else di.scaled end as val
    from (
      select di.dim,
             coalesce((v_def->'weights'->>di.dim)::numeric, 1) as w,
             di.rev,
             case when di.typ = 'rating10' then v_min + (im.m - 1) / 9.0 * (v_max - v_min) else im.m end as scaled
      from def_items di join item_mean im on im.item_key = di.item_key
    ) di
  ),
  dim_mean as (
    select dim, avg(val) as dm, max(w) as w from norm group by dim
  )
  select sum(dm * w) / nullif(sum(w), 0) into v_comp from dim_mean;
  if v_comp is null then return null; end if;
  return round(((v_comp - v_min) / (v_max - v_min)) * 100, 1);
end;
$$;

-- ---- 7. suite overview: multi-team invited + floor + rating-10 ------
create or replace function public.assessment_suite_overview(p_workspace uuid)
returns table(
  survey_id uuid,
  respondents int,
  invited int,
  masked boolean,
  overall_mean numeric,
  overall_pct numeric,
  below_count int,
  has_workshop boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_eff int;
  v_floor int;
  v_min numeric;
  v_max numeric;
  v_overall numeric;
  v_below int;
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
    where s.workspace_id = p_workspace
      and private.survey_can_read(s.id)
  loop
    select count(*) into respondents from public.survey_response sr where sr.survey_id = r.id;
    -- invited = members across every targeted team + external invites.
    select count(*) into invited from private.survey_member_ids(r.id);
    select invited + count(*) into invited from public.survey_invite si where si.survey_id = r.id;
    select exists(select 1 from public.block b where b.survey_id = r.id and b.workshop_id is not null)
      into has_workshop;
    v_floor := r.floor;

    if r.subject_user_id is not null then
      select count(*) into v_eff from public.survey_response sr
        where sr.survey_id = r.id and sr.respondent_id <> r.subject_user_id;
    else
      v_eff := respondents;
    end if;

    survey_id := r.id;
    masked := true;
    overall_mean := null;
    overall_pct := null;
    below_count := 0;

    if v_eff >= v_floor
       and coalesce(jsonb_typeof(r.definition -> 'dimensions'), '') = 'array'
       and coalesce(jsonb_typeof(r.definition -> 'items'), '') = 'array' then
      v_min := (r.definition #>> '{scale,min}')::numeric;
      v_max := (r.definition #>> '{scale,max}')::numeric;
      if v_min is not null and v_max is not null and v_max <> v_min then
        with per_item as (
          select e.key as item_key, avg((e.value)::numeric) as mean
          from public.survey_response sr, jsonb_each_text(sr.scores) e
          where sr.survey_id = r.id
          group by e.key
        ),
        def_dims as (
          select d ->> 'key' as key from jsonb_array_elements(r.definition -> 'dimensions') d
        ),
        def_items as (
          select it ->> 'key' as key,
                 it ->> 'dimension' as dimension,
                 coalesce(it ->> 'type', 'likert') as typ,
                 coalesce((it ->> 'reverse')::boolean, false) as reverse
          from jsonb_array_elements(r.definition -> 'items') it
          where coalesce(it ->> 'type', 'likert') in ('likert','rating10')
        ),
        scaled as (
          select di.dimension, di.reverse,
                 case when di.typ = 'rating10' then v_min + (pi.mean - 1) / 9.0 * (v_max - v_min) else pi.mean end as mean
          from def_items di
          join def_dims dd on dd.key = di.dimension
          join per_item pi on pi.item_key = di.key
        ),
        dim_means as (
          select dimension,
                 round(avg(case when reverse then v_min + v_max - mean else mean end), 2) as dmean
          from scaled group by dimension
        )
        select round(avg(dmean), 2),
               count(*) filter (where ((dmean - v_min) / (v_max - v_min)) * 100 < 45)
          into v_overall, v_below
        from dim_means
        where dmean is not null;

        if v_overall is not null then
          masked := false;
          overall_mean := v_overall;
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

-- ---- 8. scheduled launch in the daily maintenance job ---------------
create or replace function private.process_surveys()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_opened int; v_closed int; v_reminded int;
begin
  -- Flip scheduled assessments to open once their start date arrives, and
  -- notify the recipients across every targeted team.
  with opened as (
    update public.survey set status = 'open', opened_at = now(), updated_at = now()
    where status = 'scheduled' and start_at is not null and start_at <= now()
    returning id, workspace_id, name
  )
  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  select o.workspace_id, m.id, 'survey_open', o.name, 'Now open — share your read (~2 min).', '/assessments/take', 'survey', o.id
  from opened o, lateral private.survey_member_ids(o.id) m(id);
  get diagnostics v_opened = row_count;

  update public.survey set status = 'closed', closed_at = now(), updated_at = now()
  where status = 'open' and due_at is not null and due_at < now();
  get diagnostics v_closed = row_count;

  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  select s.workspace_id, m.id, 'survey_due', s.name, 'Closing soon — share your read (~2 min).', '/assessments/take', 'survey', s.id
  from public.survey s
  join lateral private.survey_member_ids(s.id) m(id) on true
  where s.status = 'open' and s.reminders and s.due_at is not null and s.due_at >= now() and s.due_at <= now() + interval '2 days'
    and not exists (select 1 from public.survey_response sr where sr.survey_id = s.id and sr.respondent_id = m.id)
    and not exists (
      select 1 from public.notification n
      where n.user_id = m.id and n.entity_type = 'survey' and n.entity_id = s.id
        and n.kind = 'survey_due' and n.created_at > now() - interval '2 days'
    );
  get diagnostics v_reminded = row_count;
  return v_opened + v_closed + v_reminded;
end;
$$;

-- ---- 9. create_assessment: the send-wizard's one-shot RPC -----------
-- Creates a single assessment that targets many teams + email invites, in
-- one of three launch states (now/scheduled/draft), from a template key or
-- an inline definition. Returns the survey row.
create or replace function public.create_assessment(
  p_team             uuid,
  p_name             text,
  p_extra_teams      uuid[]      default '{}',
  p_emails           text[]      default '{}',
  p_kind             text        default null,
  p_definition       jsonb       default null,
  p_anonymity        text        default 'anonymous',
  p_min_participants int         default 5,
  p_channels         text[]      default '{email}',
  p_launch           text        default 'now',
  p_start            timestamptz default null,
  p_due              timestamptz default null,
  p_reminders        boolean     default true
) returns public.survey language plpgsql security definer set search_path = '' as $$
declare
  v_row public.survey; v_uid uuid := (select auth.uid()); v_ws uuid; v_def jsonb;
  v_anon text := case when p_anonymity = 'attributed' then 'attributed' else 'anonymous' end;
  v_status text := case p_launch when 'scheduled' then 'scheduled' when 'draft' then 'draft' else 'open' end;
  v_min int := greatest(3, coalesce(p_min_participants, 5));
  v_kind text := coalesce(nullif(btrim(p_kind), ''), 'custom');
  v_token text; v_team uuid; v_email text;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can open an assessment' using errcode = '42501';
  end if;
  v_ws := private.team_workspace(p_team);
  -- Every extra team must also be managed by the caller and live in the same workspace.
  foreach v_team in array coalesce(p_extra_teams, '{}') loop
    if v_team <> p_team then
      if private.team_workspace(v_team) <> v_ws then
        raise exception 'teams must share a workspace' using errcode = '22023';
      end if;
      if not private.can_manage_team(v_team) then
        raise exception 'only a team lead or admin can target a team' using errcode = '42501';
      end if;
    end if;
  end loop;

  -- definition: explicit inline wins, else the resolved template snapshot.
  if p_definition is not null then
    v_def := p_definition;
  elsif nullif(btrim(p_kind), '') is not null then
    select t.definition into v_def from public.assessment_template t
      where t.key = p_kind and (t.workspace_id = v_ws or t.workspace_id is null)
      order by t.workspace_id nulls last limit 1;
  end if;

  -- mint a public no-login token when the URL channel is on (anonymous only).
  if v_anon = 'anonymous' and 'url' = any(coalesce(p_channels, '{}')) then
    v_token := encode(extensions.gen_random_bytes(16), 'hex');
  end if;

  insert into public.survey (team_id, kind, name, status, opened_at, start_at, due_at, created_by,
                             definition, anonymity, min_participants, channels, reminders,
                             share_token, shared_at)
  values (p_team, v_kind, coalesce(nullif(btrim(p_name), ''), 'Untitled assessment'), v_status,
          case when v_status = 'open' then now() else null end,
          p_start, p_due, v_uid, v_def, v_anon, v_min, coalesce(p_channels, '{email}'), coalesce(p_reminders, true),
          v_token, case when v_token is not null then now() else null end)
  returning * into v_row;

  -- record every targeted team (primary + extras).
  insert into public.survey_team (survey_id, team_id) values (v_row.id, p_team)
    on conflict do nothing;
  foreach v_team in array coalesce(p_extra_teams, '{}') loop
    insert into public.survey_team (survey_id, team_id) values (v_row.id, v_team)
      on conflict do nothing;
  end loop;

  -- record email invites.
  foreach v_email in array coalesce(p_emails, '{}') loop
    if position('@' in v_email) > 1 then
      insert into public.survey_invite (survey_id, email) values (v_row.id, btrim(v_email))
        on conflict do nothing;
    end if;
  end loop;

  -- notify recipients now only when launched immediately over the email channel.
  if v_status = 'open' and 'email' = any(coalesce(p_channels, '{email}')) then
    perform private.notify(v_row.workspace_id, m.id, 'survey_open', v_row.name,
      'Share your read in ~2 minutes — ' || v_anon || '.', '/assessments/take', 'survey', v_row.id)
    from private.survey_member_ids(v_row.id) m(id)
    where m.id <> v_uid;
  end if;

  return v_row;
end;
$$;
revoke execute on function public.create_assessment(uuid, text, uuid[], text[], text, jsonb, text, int, text[], text, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.create_assessment(uuid, text, uuid[], text[], text, jsonb, text, int, text[], text, timestamptz, timestamptz, boolean) to authenticated;
