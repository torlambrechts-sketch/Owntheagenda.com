-- Snapshot the instrument definition onto each survey at open time, so editing a
-- template later never desyncs an open or historical survey from the responses
-- already collected under its item keys. Reads (composite scoring, dimension
-- mapping) resolve from the survey's own snapshot, falling back to the live
-- template for legacy rows whose `definition` is null.

alter table public.survey add column if not exists definition jsonb;

-- create_survey now snapshots the matching template's definition (workspace-
-- custom preferred over global). Behaviour is otherwise unchanged: deadline body
-- + notify the team's non-responders.
create or replace function public.create_survey(p_team uuid, p_kind text, p_name text, p_due timestamptz default null)
returns public.survey language plpgsql security definer set search_path = '' as $$
declare v_row public.survey; v_uid uuid := (select auth.uid()); v_body text; v_ws uuid; v_def jsonb;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can open a survey' using errcode = '42501';
  end if;
  v_ws := private.team_workspace(p_team);
  select t.definition into v_def from public.assessment_template t
   where t.key = p_kind and (t.workspace_id = v_ws or t.workspace_id is null)
   order by t.workspace_id nulls last limit 1;
  insert into public.survey (team_id, kind, name, status, opened_at, due_at, created_by, definition)
  values (p_team, p_kind, p_name, 'open', now(), p_due, v_uid, v_def)
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

-- Composite scoring resolves the definition from the survey snapshot first,
-- falling back to the live template for legacy rows. Logic otherwise unchanged.
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
    select it->>'key' as item_key, it->>'dimension' as dim
    from jsonb_array_elements(v_def->'items') it
  ),
  dim_mean as (
    select di.dim,
           avg(im.m) as dm,
           coalesce((v_def->'weights'->>di.dim)::numeric, 1) as w
    from def_items di join item_mean im on im.item_key = di.item_key
    group by di.dim
  )
  select sum(dm * w) / nullif(sum(w), 0) into v_comp from dim_mean;
  if v_comp is null then return null; end if;
  return round(((v_comp - v_min) / (v_max - v_min)) * 100, 1);
end;
$$;

-- Backfill: lock every existing survey to its current template definition so a
-- later template edit can't retroactively reinterpret historical responses.
update public.survey s
set definition = (
  select t.definition from public.assessment_template t
  where t.key = s.kind and (t.workspace_id = s.workspace_id or t.workspace_id is null)
  order by t.workspace_id nulls last limit 1
)
where s.definition is null;
