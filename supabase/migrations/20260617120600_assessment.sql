-- =====================================================================
-- OwnTheAgenda · 0006 · Assessment layer (Phase 3)
-- ---------------------------------------------------------------------
-- Team-dynamics pulses + individual fingerprints, both privacy-first:
--   * pulse_response is readable only by its author; the team only ever
--     sees AGGREGATES via the SECURITY DEFINER team_dynamics() function.
--   * fingerprint rows are visible to their owner always, and to other
--     workspace members only when the member has consented to share.
-- Healthy "bands" live in a data-driven reference table (dynamic_band),
-- so the band visualization is config, not code.
-- =====================================================================

create type public.pulse_status  as enum ('draft', 'open', 'closed');
create type public.team_dynamic  as enum
  ('psych_safety', 'trust', 'conflict_norms', 'role_clarity', 'decision_rights');

-- ----- reference: healthy band per dynamic (global config) -----------
create table public.dynamic_band (
  dynamic     public.team_dynamic primary key,
  label       text not null,
  question    text not null,
  target_low  int  not null check (target_low between 0 and 100),
  target_high int  not null check (target_high between 0 and 100),
  ord         int  not null default 0
);
insert into public.dynamic_band (dynamic, label, question, target_low, target_high, ord) values
  ('psych_safety',    'Psychological safety', 'Can we take risks here?',    55, 92, 1),
  ('trust',           'Trust',                'Do we assume good intent?',  50, 92, 2),
  ('conflict_norms',  'Conflict norms',       'Do we disagree well?',       52, 92, 3),
  ('role_clarity',    'Role clarity',         'Do we know our lanes?',      50, 94, 4),
  ('decision_rights', 'Decision rights',      'Do we know who decides?',    55, 92, 5);

-- ----- pulse (a survey instance for a team) --------------------------
create table public.pulse (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  team_id      uuid not null references public.team(id) on delete cascade,
  name         text not null,
  status       public.pulse_status not null default 'draft',
  opened_at    timestamptz,
  closed_at    timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index pulse_team_idx on public.pulse (team_id);

-- ----- pulse_response (per-construct score; author-private) ----------
create table public.pulse_response (
  id            uuid primary key default gen_random_uuid(),
  pulse_id      uuid not null references public.pulse(id) on delete cascade,
  respondent_id uuid references auth.users(id) on delete set null,
  dynamic       public.team_dynamic not null,
  score         int not null check (score between 1 and 5),
  created_at    timestamptz not null default now(),
  unique (pulse_id, respondent_id, dynamic)
);
create index pulse_response_pulse_idx on public.pulse_response (pulse_id);

-- ----- fingerprint (individual psychometrics as bands) ---------------
create table public.fingerprint (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspace(id) on delete cascade,
  team_member_id uuid not null references public.team_member(id) on delete cascade,
  trait          text not null,
  band_low       int not null check (band_low between 0 and 100),
  band_high      int not null check (band_high between 0 and 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (team_member_id, trait)
);
create index fingerprint_member_idx on public.fingerprint (team_member_id);

create trigger set_updated_at before update on public.pulse
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.fingerprint
  for each row execute function private.set_updated_at();

-- ----- denormalize workspace_id from the parent (keeps RLS cheap) ----
create or replace function private.set_pulse_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.team where id = new.team_id;
  if new.workspace_id is null then raise exception 'team not found' using errcode = '23503'; end if;
  return new;
end;
$$;
create trigger set_pulse_workspace before insert on public.pulse
  for each row execute function private.set_pulse_workspace();

create or replace function private.set_fingerprint_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select t.workspace_id into new.workspace_id
  from public.team_member tm join public.team t on t.id = tm.team_id
  where tm.id = new.team_member_id;
  if new.workspace_id is null then raise exception 'team member not found' using errcode = '23503'; end if;
  return new;
end;
$$;
create trigger set_fingerprint_workspace before insert on public.fingerprint
  for each row execute function private.set_fingerprint_workspace();

-- ----- helpers -------------------------------------------------------
create or replace function private.is_team_member(p_team uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.team_member tm
    where tm.team_id = p_team and tm.user_id = (select auth.uid()));
$$;

-- Own fingerprint always; others' only when they've consented to share.
create or replace function private.can_read_fingerprint(p_team_member uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.team_member tm join public.team t on t.id = tm.team_id
    where tm.id = p_team_member
      and ( tm.user_id = (select auth.uid())
            or (tm.consent_share and private.is_workspace_member(t.workspace_id)) )
  );
$$;

grant execute on function
  private.is_team_member(uuid), private.can_read_fingerprint(uuid)
to authenticated;

-- ----- RPCs ----------------------------------------------------------
-- Aggregate team dynamics for a team's latest (or given) pulse. Members
-- only ever see averages, never individual responses.
create or replace function public.team_dynamics(p_team uuid, p_pulse uuid default null)
returns table (
  dynamic public.team_dynamic, label text, question text,
  pct numeric, responses int, target_low int, target_high int, in_band boolean
) language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_pulse uuid;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.is_workspace_member(v_ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_pulse := coalesce(
    p_pulse,
    (select id from public.pulse where team_id = p_team and status in ('open','closed')
      order by coalesce(closed_at, opened_at, created_at) desc limit 1)
  );
  return query
    select db.dynamic, db.label, db.question,
           round(avg((pr.score - 1) / 4.0 * 100)::numeric, 0) as pct,
           count(pr.*)::int as responses,
           db.target_low, db.target_high,
           (avg((pr.score - 1) / 4.0 * 100) between db.target_low and db.target_high) as in_band
    from public.dynamic_band db
    left join public.pulse_response pr
      on pr.dynamic = db.dynamic and pr.pulse_id = v_pulse
    group by db.dynamic, db.label, db.question, db.target_low, db.target_high, db.ord
    order by db.ord;
end;
$$;

-- Open a new pulse for a team (admin or team lead).
create or replace function public.create_pulse(p_team uuid, p_name text)
returns public.pulse language plpgsql security definer set search_path = '' as $$
declare v_row public.pulse;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  insert into public.pulse (team_id, name, status, opened_at, created_by)
  values (p_team, coalesce(nullif(btrim(p_name), ''), 'Pulse'), 'open', now(), (select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.close_pulse(p_pulse uuid)
returns public.pulse language plpgsql security definer set search_path = '' as $$
declare v_row public.pulse; v_team uuid;
begin
  select team_id into v_team from public.pulse where id = p_pulse;
  if v_team is null or not private.can_manage_team(v_team) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  update public.pulse set status = 'closed', closed_at = now() where id = p_pulse returning * into v_row;
  return v_row;
end;
$$;

-- Submit (or update) the caller's own scores for an open pulse.
create or replace function public.submit_pulse_response(p_pulse uuid, p_scores jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_pulse public.pulse;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_pulse from public.pulse where id = p_pulse;
  if v_pulse.id is null then raise exception 'pulse not found' using errcode = '23503'; end if;
  if v_pulse.status <> 'open' then raise exception 'pulse is not open' using errcode = '22023'; end if;
  if not private.is_team_member(v_pulse.team_id) then
    raise exception 'not a member of this team' using errcode = '42501';
  end if;
  insert into public.pulse_response (pulse_id, respondent_id, dynamic, score)
  select p_pulse, v_uid, (key)::public.team_dynamic, (value)::int
  from jsonb_each_text(p_scores)
  on conflict (pulse_id, respondent_id, dynamic)
    do update set score = excluded.score, created_at = now();
end;
$$;

grant execute on function
  public.team_dynamics(uuid, uuid),
  public.create_pulse(uuid, text),
  public.close_pulse(uuid),
  public.submit_pulse_response(uuid, jsonb)
to authenticated;
revoke execute on function
  public.team_dynamics(uuid, uuid),
  public.create_pulse(uuid, text),
  public.close_pulse(uuid),
  public.submit_pulse_response(uuid, jsonb)
from public, anon;

-- ----- grants + RLS --------------------------------------------------
grant select, insert, update, delete on public.pulse, public.fingerprint to authenticated;
grant select on public.pulse_response, public.dynamic_band to authenticated;

alter table public.pulse          enable row level security;
alter table public.pulse_response enable row level security;
alter table public.fingerprint    enable row level security;
alter table public.dynamic_band   enable row level security;

-- pulse: members read; writes go through create_pulse/close_pulse; admins may delete
create policy pulse_select on public.pulse
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy pulse_delete on public.pulse
  for delete to authenticated using (private.is_workspace_admin(workspace_id));

-- pulse_response: author-private; all writes via submit_pulse_response()
create policy pulse_response_select_own on public.pulse_response
  for select to authenticated using (respondent_id = (select auth.uid()));

-- fingerprint: own always, consented otherwise; managed by admins
create policy fingerprint_select on public.fingerprint
  for select to authenticated using (private.can_read_fingerprint(team_member_id));
create policy fingerprint_write on public.fingerprint
  for all to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

-- dynamic_band: global read-only reference
create policy dynamic_band_select on public.dynamic_band
  for select to authenticated using (true);
