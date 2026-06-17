-- =====================================================================
-- OwnTheAgenda · 0011 · Live session (run mode) + outcomes
-- ---------------------------------------------------------------------
-- The `session` row is the single source of truth for the live run:
-- current phase + timer. Facilitator RPCs mutate it; every client
-- subscribes via Supabase Realtime (Postgres Changes) and re-renders.
-- `participant` tracks who's in the room + ready; `action_item` captures
-- commitments (the loop); `agreement` is the anonymous fist-of-five.
-- =====================================================================

create type public.session_status as enum ('live', 'ended');
create type public.action_status  as enum ('open', 'done');

create table public.session (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspace(id) on delete cascade,
  workshop_id     uuid not null references public.workshop(id) on delete cascade,
  facilitator_id  uuid references auth.users(id) on delete set null,
  status          public.session_status not null default 'live',
  current_block_ord int not null default 1,
  timer_running   boolean not null default false,
  timer_ends_at   timestamptz,           -- absolute end while running
  timer_remaining int not null default 0,-- seconds, while paused / initial
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index session_workshop_idx on public.session (workshop_id);

create table public.participant (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.session(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  is_facilitator boolean not null default false,
  ready       boolean not null default false,
  joined_at   timestamptz not null default now(),
  unique (session_id, user_id)
);
create index participant_session_idx on public.participant (session_id);

create table public.action_item (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  workshop_id  uuid not null references public.workshop(id) on delete cascade,
  session_id   uuid references public.session(id) on delete set null,
  text         text not null,
  owner_name   text,
  status       public.action_status not null default 'open',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index action_item_workshop_idx on public.action_item (workshop_id);

create table public.agreement (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  block_ord  int not null,
  user_id    uuid references auth.users(id) on delete set null,
  value      int not null check (value between 1 and 5),
  created_at timestamptz not null default now(),
  unique (session_id, block_ord, user_id)
);

create trigger set_updated_at before update on public.session
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.action_item
  for each row execute function private.set_updated_at();

-- workspace_id denormalization
create or replace function private.set_session_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.workshop where id = new.workshop_id;
  if new.workspace_id is null then raise exception 'workshop not found' using errcode = '23503'; end if;
  return new;
end;
$$;
create trigger set_session_workspace before insert on public.session
  for each row execute function private.set_session_workspace();

-- ----- helpers -------------------------------------------------------
create or replace function private.session_workspace(p_session uuid)
returns uuid language sql security definer stable set search_path = '' as $$
  select workspace_id from public.session where id = p_session;
$$;
create or replace function private.can_read_session(p_session uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select private.is_workspace_member(private.session_workspace(p_session));
$$;
create or replace function private.is_session_facilitator(p_session uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.session s where s.id = p_session and s.facilitator_id = (select auth.uid()));
$$;
grant execute on function
  private.session_workspace(uuid), private.can_read_session(uuid), private.is_session_facilitator(uuid)
to authenticated;

-- ----- RPCs ----------------------------------------------------------
create or replace function public.start_session(p_workshop uuid)
returns public.session language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_secs int; v_row public.session; v_existing uuid;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead/admin can start a session' using errcode = '42501';
  end if;
  -- reuse a live session if one already exists
  select id into v_existing from public.session where workshop_id = p_workshop and status = 'live' limit 1;
  if v_existing is not null then
    select * into v_row from public.session where id = v_existing; return v_row;
  end if;
  select coalesce(duration,10) * 60 into v_secs from public.block where workshop_id = p_workshop and ord = 1;
  insert into public.session (workshop_id, facilitator_id, current_block_ord, timer_remaining)
  values (p_workshop, v_uid, 1, coalesce(v_secs, 600))
  returning * into v_row;
  insert into public.participant (session_id, user_id, is_facilitator, ready)
  values (v_row.id, v_uid, true, true);
  update public.workshop set status = 'live' where id = p_workshop;
  return v_row;
end;
$$;

create or replace function public.join_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.participant (session_id, user_id)
  values (p_session, (select auth.uid()))
  on conflict (session_id, user_id) do nothing;
end;
$$;

create or replace function public.set_ready(p_session uuid, p_ready boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.participant set ready = p_ready
  where session_id = p_session and user_id = (select auth.uid());
end;
$$;

create or replace function public.session_phase(p_session uuid, p_ord int)
returns public.session language plpgsql security definer set search_path = '' as $$
declare v_row public.session; v_secs int; v_max int;
begin
  if not private.is_session_facilitator(p_session) then raise exception 'facilitator only' using errcode = '42501'; end if;
  select count(*) into v_max from public.block b join public.session s on s.workshop_id = b.workshop_id where s.id = p_session;
  p_ord := greatest(1, least(p_ord, greatest(v_max, 1)));
  select coalesce(b.duration,10) * 60 into v_secs
  from public.block b join public.session s on s.workshop_id = b.workshop_id
  where s.id = p_session and b.ord = p_ord;
  update public.session
  set current_block_ord = p_ord, timer_running = false, timer_ends_at = null,
      timer_remaining = coalesce(v_secs, 600)
  where id = p_session returning * into v_row;
  -- reset ready flags for the new phase
  update public.participant set ready = false where session_id = p_session and is_facilitator = false;
  return v_row;
end;
$$;

create or replace function public.session_timer(p_session uuid, p_action text)
returns public.session language plpgsql security definer set search_path = '' as $$
declare v_row public.session; v_secs int;
begin
  if not private.is_session_facilitator(p_session) then raise exception 'facilitator only' using errcode = '42501'; end if;
  select * into v_row from public.session where id = p_session;
  if p_action = 'start' then
    update public.session set timer_running = true,
      timer_ends_at = now() + make_interval(secs => greatest(v_row.timer_remaining, 0))
    where id = p_session;
  elsif p_action = 'pause' then
    update public.session set timer_running = false, timer_ends_at = null,
      timer_remaining = case when v_row.timer_ends_at is null then v_row.timer_remaining
                             else greatest(0, ceil(extract(epoch from (v_row.timer_ends_at - now())))::int) end
    where id = p_session;
  else -- reset
    select coalesce(b.duration,10) * 60 into v_secs
    from public.block b join public.session s on s.workshop_id = b.workshop_id
    where s.id = p_session and b.ord = v_row.current_block_ord;
    update public.session set timer_running = false, timer_ends_at = null, timer_remaining = coalesce(v_secs, 600)
    where id = p_session;
  end if;
  select * into v_row from public.session where id = p_session;
  return v_row;
end;
$$;

create or replace function public.end_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_workshop uuid;
begin
  if not private.is_session_facilitator(p_session) then raise exception 'facilitator only' using errcode = '42501'; end if;
  update public.session set status = 'ended', ended_at = now(), timer_running = false where id = p_session
  returning workshop_id into v_workshop;
  update public.workshop set status = 'done' where id = v_workshop;
end;
$$;

create or replace function public.add_action(p_session uuid, p_text text, p_owner text default null)
returns public.action_item language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_workshop uuid; v_row public.action_item;
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select workspace_id, workshop_id into v_ws, v_workshop from public.session where id = p_session;
  insert into public.action_item (workspace_id, workshop_id, session_id, text, owner_name, created_by)
  values (v_ws, v_workshop, p_session, p_text, nullif(btrim(coalesce(p_owner,'')),''), (select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.toggle_action(p_action uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.action_item
  set status = case when status = 'open' then 'done' else 'open' end
  where id = p_action
    and private.is_workspace_member(workspace_id);
end;
$$;

create or replace function public.submit_agreement(p_session uuid, p_block_ord int, p_value int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.agreement (session_id, block_ord, user_id, value)
  values (p_session, p_block_ord, (select auth.uid()), p_value)
  on conflict (session_id, block_ord, user_id) do update set value = excluded.value, created_at = now();
end;
$$;

-- Anonymous distribution of fist-of-five for a block (counts only).
create or replace function public.agreement_summary(p_session uuid, p_block_ord int)
returns table (value int, count int)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select v.value, count(a.*)::int
    from generate_series(1,5) as v(value)
    left join public.agreement a on a.session_id = p_session and a.block_ord = p_block_ord and a.value = v.value
    group by v.value order by v.value;
end;
$$;

grant execute on function
  public.start_session(uuid), public.join_session(uuid), public.set_ready(uuid, boolean),
  public.session_phase(uuid, int), public.session_timer(uuid, text), public.end_session(uuid),
  public.add_action(uuid, text, text), public.toggle_action(uuid),
  public.submit_agreement(uuid, int, int), public.agreement_summary(uuid, int)
to authenticated;
revoke execute on function
  public.start_session(uuid), public.join_session(uuid), public.set_ready(uuid, boolean),
  public.session_phase(uuid, int), public.session_timer(uuid, text), public.end_session(uuid),
  public.add_action(uuid, text, text), public.toggle_action(uuid),
  public.submit_agreement(uuid, int, int), public.agreement_summary(uuid, int)
from public, anon;

-- ----- grants + RLS --------------------------------------------------
grant select, insert, update, delete on
  public.session, public.participant, public.action_item, public.agreement to authenticated;

alter table public.session     enable row level security;
alter table public.participant enable row level security;
alter table public.action_item enable row level security;
alter table public.agreement   enable row level security;

create policy session_select on public.session
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy participant_select on public.participant
  for select to authenticated using (private.can_read_session(session_id));
create policy action_item_select on public.action_item
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy action_item_insert on public.action_item
  for insert to authenticated with check (private.is_workspace_member(workspace_id));
create policy action_item_update on public.action_item
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
-- agreement: author-private (aggregates exposed via agreement_summary)
create policy agreement_select_own on public.agreement
  for select to authenticated using (user_id = (select auth.uid()));

-- ----- realtime (Postgres Changes) -----------------------------------
alter table public.session     replica identity full;
alter table public.participant replica identity full;
alter table public.action_item replica identity full;
alter publication supabase_realtime add table public.session;
alter publication supabase_realtime add table public.participant;
alter publication supabase_realtime add table public.action_item;
