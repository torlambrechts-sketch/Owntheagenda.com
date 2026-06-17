-- Multi-item assessment surveys (e.g. Bang's psychological-safety instrument).
alter type public.activity_type add value if not exists 'survey';

-- A survey instance; the instrument is identified by `kind` (items live in app code).
create table if not exists public.survey (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  team_id uuid not null references public.team(id) on delete cascade,
  kind text not null,
  name text not null,
  status text not null default 'open',
  opened_at timestamptz default now(),
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.set_survey_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.workspace_id := private.team_workspace(new.team_id);
  if new.workspace_id is null then raise exception 'team not found' using errcode = '23503'; end if;
  return new;
end;
$$;
create trigger set_survey_ws before insert or update of team_id on public.survey
  for each row execute function private.set_survey_workspace();
create trigger set_survey_updated before update on public.survey
  for each row execute function private.set_updated_at();

alter table public.survey enable row level security;
create policy survey_select on public.survey
  for select to authenticated using (private.can_read_team(team_id));

-- One row per respondent; individual answers are private (anonymity), aggregates via RPC.
create table if not exists public.survey_response (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.survey(id) on delete cascade,
  respondent_id uuid not null references auth.users(id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (survey_id, respondent_id)
);
alter table public.survey_response enable row level security;
create policy survey_response_select_own on public.survey_response
  for select to authenticated using (respondent_id = (select auth.uid()));

-- Link a survey to a workshop (mirrors workshop.pulse_id) for the in-session block.
alter table public.workshop add column if not exists survey_id uuid references public.survey(id) on delete set null;

-- RPCs --------------------------------------------------------------------
create or replace function public.create_survey(p_team uuid, p_kind text, p_name text)
returns public.survey language plpgsql security definer set search_path = '' as $$
declare v_row public.survey;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can open a survey' using errcode = '42501';
  end if;
  insert into public.survey (team_id, kind, name, status, opened_at, created_by)
  values (p_team, p_kind, p_name, 'open', now(), (select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;

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
end;
$$;

-- Aggregates with the min-3 anonymity mask + climate-strength dispersion.
create or replace function public.survey_results(p_survey uuid, p_strength_items text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_n integer; v_result jsonb;
begin
  select team_id into v_team from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_read_team(v_team) then raise exception 'not allowed' using errcode = '42501'; end if;
  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < 3 then
    return jsonb_build_object('respondents', v_n, 'masked', true, 'items', '[]'::jsonb, 'strength_sd', null);
  end if;
  with exploded as (
    select r.respondent_id, e.key as item_key, (e.value)::numeric as score
    from public.survey_response r, jsonb_each_text(r.scores) e
    where r.survey_id = p_survey
  ),
  per_item as (
    select item_key, round(avg(score), 2) as mean, count(*)::int as n from exploded group by item_key
  ),
  strength as (
    select round(stddev_pop(rmean), 2) as sd from (
      select respondent_id, avg(score) as rmean from exploded
      where p_strength_items = '{}' or item_key = any(p_strength_items)
      group by respondent_id
    ) s
  )
  select jsonb_build_object(
    'respondents', v_n,
    'masked', false,
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_key', item_key, 'mean', mean, 'n', n)) from per_item), '[]'::jsonb),
    'strength_sd', (select sd from strength)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.close_survey(p_survey uuid)
returns public.survey language plpgsql security definer set search_path = '' as $$
declare v_row public.survey;
begin
  if not private.can_manage_team((select team_id from public.survey where id = p_survey)) then
    raise exception 'only a team lead or admin can close a survey' using errcode = '42501';
  end if;
  update public.survey set status = 'closed', closed_at = now(), updated_at = now()
  where id = p_survey returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.ensure_workshop_survey(p_workshop uuid, p_kind text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_survey uuid; v_team uuid;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead or facilitator can open the survey' using errcode = '42501';
  end if;
  select survey_id, team_id into v_survey, v_team from public.workshop where id = p_workshop;
  if v_team is null then raise exception 'workshop not found' using errcode = '23503'; end if;
  if v_survey is not null then return v_survey; end if;
  v_survey := (public.create_survey(v_team, p_kind, p_name)).id;
  update public.workshop set survey_id = v_survey where id = p_workshop;
  return v_survey;
end;
$$;

revoke execute on function public.create_survey(uuid, text, text) from public, anon;
grant execute on function public.create_survey(uuid, text, text) to authenticated;
revoke execute on function public.submit_survey_response(uuid, jsonb) from public, anon;
grant execute on function public.submit_survey_response(uuid, jsonb) to authenticated;
revoke execute on function public.survey_results(uuid, text[]) from public, anon;
grant execute on function public.survey_results(uuid, text[]) to authenticated;
revoke execute on function public.close_survey(uuid) from public, anon;
grant execute on function public.close_survey(uuid) to authenticated;
revoke execute on function public.ensure_workshop_survey(uuid, text, text) from public, anon;
grant execute on function public.ensure_workshop_survey(uuid, text, text) to authenticated;

alter table public.survey replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'survey') then
    alter publication supabase_realtime add table public.survey;
  end if;
end $$;
