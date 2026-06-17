-- =====================================================================
-- OwnTheAgenda · 0020 · Decision & accountability layer (the wedge)
-- ---------------------------------------------------------------------
-- Turns a session's discussion into owned, resourced, accountable
-- decisions — the anti-"consensus theatre" core both research documents
-- call the differentiator. A `decision` is a first-class object with a
-- named decider (DACI Approver), captured gradients of agreement, and a
-- resourcing note; committing is gated (decider + resource note + no
-- unresolved opposition); actions spawned from a decision require an
-- owner and a due date; closing a session is gated on all of the above.
-- All writes go through SECURITY DEFINER RPCs; clients read under RLS.
-- =====================================================================

create table public.decision (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.session(id) on delete cascade,
  workspace_id    uuid not null references public.workspace(id) on delete cascade,
  title           text not null,
  rationale       text,
  decision_type   text not null default 'consensus',   -- consensus|consent|decider|majority
  decider_user_id uuid references auth.users(id) on delete set null,  -- DACI Approver
  driver_user_id  uuid references auth.users(id) on delete set null,  -- DACI Driver
  resource_note   text,                                -- "what are we stopping/moving to fund this?"
  override_note   text,                                -- facilitator rationale to commit over opposition
  status          text not null default 'draft',       -- draft|committed|superseded
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index decision_session_idx on public.decision (session_id);

create table public.decision_contributor (
  id           uuid primary key default gen_random_uuid(),
  decision_id  uuid not null references public.decision(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  daci_role    text not null default 'contributor',    -- driver|approver|contributor|informed
  agreement    int check (agreement between 1 and 5),  -- fist-of-five; 1 = oppose
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (decision_id, user_id)
);
create index decision_contributor_decision_idx on public.decision_contributor (decision_id);

alter table public.action_item add column if not exists decision_id uuid references public.decision(id) on delete set null;
alter table public.workshop   add column if not exists objective text;

create trigger set_updated_at before update on public.decision
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.decision_contributor
  for each row execute function private.set_updated_at();

-- workspace stamp + author
create or replace function private.set_decision_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.session where id = new.session_id;
  if new.workspace_id is null then raise exception 'session not found' using errcode = '23503'; end if;
  if new.created_by is null then new.created_by := (select auth.uid()); end if;
  return new;
end;
$$;
create trigger set_decision_defaults before insert on public.decision
  for each row execute function private.set_decision_defaults();

-- ----- helpers -------------------------------------------------------
create or replace function private.decision_session(p_decision uuid)
returns uuid language sql security definer stable set search_path = '' as $$
  select session_id from public.decision where id = p_decision;
$$;
grant execute on function private.decision_session(uuid) to authenticated;

-- ----- RPCs ----------------------------------------------------------
create or replace function public.create_decision(p_session uuid, p_title text, p_rationale text default null)
returns public.decision language plpgsql security definer set search_path = '' as $$
declare v_row public.decision;
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  if btrim(coalesce(p_title,'')) = '' then raise exception 'a decision needs a title' using errcode = '23514'; end if;
  insert into public.decision (session_id, title, rationale)
  values (p_session, btrim(p_title), nullif(btrim(coalesce(p_rationale,'')),''))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.update_decision(
  p_decision uuid, p_title text default null, p_rationale text default null,
  p_type text default null, p_decider uuid default null, p_driver uuid default null,
  p_resource_note text default null)
returns public.decision language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_status text; v_row public.decision;
begin
  select session_id, status into v_session, v_status from public.decision where id = p_decision;
  if v_session is null then raise exception 'not found' using errcode = '23503'; end if;
  if not private.can_read_session(v_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status <> 'draft' then raise exception 'a committed decision cannot be edited' using errcode = '42501'; end if;
  update public.decision set
    title         = coalesce(nullif(btrim(coalesce(p_title,'')),''), title),
    rationale     = coalesce(p_rationale, rationale),
    decision_type = coalesce(nullif(p_type,''), decision_type),
    decider_user_id = coalesce(p_decider, decider_user_id),
    driver_user_id  = coalesce(p_driver, driver_user_id),
    resource_note   = coalesce(p_resource_note, resource_note)
  where id = p_decision returning * into v_row;
  return v_row;
end;
$$;

-- a participant records their own gradient of agreement (1..5)
create or replace function public.record_agreement(p_decision uuid, p_level int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_session uuid;
begin
  select session_id into v_session from public.decision where id = p_decision;
  if v_session is null then raise exception 'not found' using errcode = '23503'; end if;
  if not private.can_read_session(v_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_level < 1 or p_level > 5 then raise exception 'level out of range' using errcode = '23514'; end if;
  insert into public.decision_contributor (decision_id, user_id, daci_role, agreement)
  values (p_decision, (select auth.uid()), 'contributor', p_level)
  on conflict (decision_id, user_id) do update set agreement = excluded.agreement;
end;
$$;

-- facilitator assigns a DACI role to a participant
create or replace function public.set_daci(p_decision uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_session uuid;
begin
  select session_id into v_session from public.decision where id = p_decision;
  if v_session is null then raise exception 'not found' using errcode = '23503'; end if;
  if not private.is_session_facilitator(v_session) then raise exception 'facilitator only' using errcode = '42501'; end if;
  if p_role not in ('driver','approver','contributor','informed') then raise exception 'bad role' using errcode = '23514'; end if;
  insert into public.decision_contributor (decision_id, user_id, daci_role)
  values (p_decision, p_user, p_role)
  on conflict (decision_id, user_id) do update set daci_role = excluded.daci_role;
  if p_role = 'approver' then update public.decision set decider_user_id = p_user where id = p_decision; end if;
  if p_role = 'driver'   then update public.decision set driver_user_id  = p_user where id = p_decision; end if;
end;
$$;

-- commit a decision (gated: facilitator/decider · decider set · resource note · no unresolved oppose)
create or replace function public.commit_decision(p_decision uuid, p_override_note text default null)
returns public.decision language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_decider uuid; v_resource text; v_status text; v_oppose int; v_uid uuid := (select auth.uid()); v_row public.decision;
begin
  select session_id, decider_user_id, resource_note, status
    into v_session, v_decider, v_resource, v_status
  from public.decision where id = p_decision;
  if v_session is null then raise exception 'not found' using errcode = '23503'; end if;
  if not (private.is_session_facilitator(v_session) or v_uid = v_decider) then
    raise exception 'only the facilitator or the decider can commit' using errcode = '42501';
  end if;
  if v_status = 'committed' then return (select d from public.decision d where d.id = p_decision); end if;
  if v_decider is null then raise exception 'name a decider before committing' using errcode = '42501'; end if;
  if coalesce(btrim(v_resource),'') = '' then
    raise exception 'add a resourcing note (what are we stopping or moving to fund this?) before committing' using errcode = '42501';
  end if;
  select count(*) into v_oppose from public.decision_contributor where decision_id = p_decision and agreement = 1;
  if v_oppose > 0 and coalesce(btrim(p_override_note),'') = '' then
    raise exception 'opposition recorded — resolve it, or provide a written override rationale to commit' using errcode = '42501';
  end if;
  update public.decision
    set status = 'committed', override_note = nullif(btrim(coalesce(p_override_note,'')),'')
  where id = p_decision returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.supersede_decision(p_decision uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_creator uuid;
begin
  select session_id, created_by into v_session, v_creator from public.decision where id = p_decision;
  if v_session is null then raise exception 'not found' using errcode = '23503'; end if;
  if not (private.is_session_facilitator(v_session) or (select auth.uid()) = v_creator) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.decision set status = 'superseded' where id = p_decision;
end;
$$;

-- spawn an action from a decision — owner + due date REQUIRED (no orphan actions)
create or replace function public.add_decision_action(p_decision uuid, p_text text, p_owner text, p_due date)
returns public.action_item language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_ws uuid; v_workshop uuid; v_team uuid; v_row public.action_item;
begin
  select session_id into v_session from public.decision where id = p_decision;
  if v_session is null then raise exception 'not found' using errcode = '23503'; end if;
  if not private.can_read_session(v_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  if btrim(coalesce(p_text,'')) = '' then raise exception 'an action needs a description' using errcode = '23514'; end if;
  if btrim(coalesce(p_owner,'')) = '' then raise exception 'every action needs an owner' using errcode = '23514'; end if;
  if p_due is null then raise exception 'every action needs a due date' using errcode = '23514'; end if;
  select s.workspace_id, s.workshop_id, w.team_id into v_ws, v_workshop, v_team
  from public.session s join public.workshop w on w.id = s.workshop_id where s.id = v_session;
  insert into public.action_item (workspace_id, workshop_id, team_id, session_id, decision_id, text, owner_name, due_at, created_by)
  values (v_ws, v_workshop, v_team, v_session, p_decision, btrim(p_text), btrim(p_owner), p_due, (select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function
  public.create_decision(uuid, text, text),
  public.update_decision(uuid, text, text, text, uuid, uuid, text),
  public.record_agreement(uuid, int),
  public.set_daci(uuid, uuid, text),
  public.commit_decision(uuid, text),
  public.supersede_decision(uuid),
  public.add_decision_action(uuid, text, text, date)
to authenticated;
revoke execute on function
  public.create_decision(uuid, text, text),
  public.update_decision(uuid, text, text, text, uuid, uuid, text),
  public.record_agreement(uuid, int),
  public.set_daci(uuid, uuid, text),
  public.commit_decision(uuid, text),
  public.supersede_decision(uuid),
  public.add_decision_action(uuid, text, text, date)
from public, anon;

-- ----- close-session gates (anti-theatre) ----------------------------
create or replace function public.end_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_workshop uuid; v_obj text;
begin
  if not private.is_session_facilitator(p_session) then raise exception 'facilitator only' using errcode = '42501'; end if;
  select workshop_id into v_workshop from public.session where id = p_session;
  select objective into v_obj from public.workshop where id = v_workshop;

  if exists (select 1 from public.decision where session_id = p_session and status = 'draft') then
    raise exception 'Resolve or supersede draft decisions before closing.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.decision d
    where d.session_id = p_session and d.status = 'committed'
      and not exists (
        select 1 from public.action_item a
        where a.decision_id = d.id and coalesce(btrim(a.owner_name),'') <> '' and a.due_at is not null
      )
  ) then
    raise exception 'Every committed decision needs an action with an owner and a due date.' using errcode = '42501';
  end if;
  if exists (select 1 from public.decision where session_id = p_session)
     and coalesce(btrim(v_obj),'') = '' then
    raise exception 'Set the session objective before closing.' using errcode = '42501';
  end if;

  update public.session set status = 'ended', ended_at = now(), timer_running = false where id = p_session;
  update public.workshop set status = 'done' where id = v_workshop;
end;
$$;

-- ----- grants + RLS --------------------------------------------------
grant select on public.decision to authenticated;
grant select on public.decision_contributor to authenticated;

alter table public.decision             enable row level security;
alter table public.decision_contributor enable row level security;

create policy decision_select on public.decision
  for select to authenticated using (private.can_read_session(session_id));
create policy decision_contributor_select on public.decision_contributor
  for select to authenticated using (private.can_read_session(private.decision_session(decision_id)));

-- ----- realtime ------------------------------------------------------
alter table public.decision             replica identity full;
alter table public.decision_contributor replica identity full;
alter publication supabase_realtime add table public.decision;
alter publication supabase_realtime add table public.decision_contributor;
