-- =====================================================================
-- OwnTheAgenda · 0009 · Workshop layer (data-not-code)
-- ---------------------------------------------------------------------
-- A `template` is a framework whose `definition` jsonb holds the phases
-- (data, not code) — new frameworks ship without a deploy. A `workshop`
-- is a configured, runnable session built from a template for a team;
-- `block`s are its agenda steps. System templates (workspace_id null) are
-- readable by everyone; workspace-owned templates by that workspace.
-- =====================================================================

create type public.template_category as enum
  ('team', 'retro', 'ideation', 'prioritization', 'strategy', 'design', 'kickoff', 'checkin');
create type public.activity_type as enum
  ('canvas', 'vote', 'discuss', 'checkin', 'outcome');
create type public.workshop_status as enum
  ('draft', 'scheduled', 'live', 'done');

-- ----- template ------------------------------------------------------
create table public.template (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references public.workspace(id) on delete cascade,  -- null = system/global
  key              text,
  name             text not null,
  category         public.template_category not null,
  source           text,
  default_duration int not null default 60,
  description      text,
  definition       jsonb not null default '{"phases":[]}'::jsonb,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index template_workspace_idx on public.template (workspace_id);
create index template_category_idx  on public.template (category);

-- ----- workshop ------------------------------------------------------
create table public.workshop (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  team_id      uuid not null references public.team(id) on delete cascade,
  title        text not null,
  template_id  uuid references public.template(id) on delete set null,
  pulse_id     uuid references public.pulse(id) on delete set null,
  status       public.workshop_status not null default 'draft',
  scheduled_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index workshop_team_idx      on public.workshop (team_id);
create index workshop_workspace_idx on public.workshop (workspace_id);

-- ----- block (agenda step) -------------------------------------------
create table public.block (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshop(id) on delete cascade,
  ord           int not null,
  title         text not null,
  activity_type public.activity_type not null default 'canvas',
  duration      int not null default 10,
  prompt        text,
  linked_dynamic public.team_dynamic,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index block_workshop_idx on public.block (workshop_id, ord);

create trigger set_updated_at before update on public.template
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.workshop
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.block
  for each row execute function private.set_updated_at();

-- ----- denormalize workshop.workspace_id from the team ---------------
create or replace function private.set_workshop_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.team where id = new.team_id;
  if new.workspace_id is null then raise exception 'team not found' using errcode = '23503'; end if;
  return new;
end;
$$;
create trigger set_workshop_workspace before insert on public.workshop
  for each row execute function private.set_workshop_workspace();

-- ----- helpers -------------------------------------------------------
create or replace function private.workshop_workspace(p_workshop uuid)
returns uuid language sql security definer stable set search_path = '' as $$
  select workspace_id from public.workshop where id = p_workshop;
$$;
create or replace function private.workshop_team(p_workshop uuid)
returns uuid language sql security definer stable set search_path = '' as $$
  select team_id from public.workshop where id = p_workshop;
$$;
create or replace function private.can_read_workshop(p_workshop uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select private.is_workspace_member(private.workshop_workspace(p_workshop));
$$;
create or replace function private.can_manage_workshop(p_workshop uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select private.can_manage_team(private.workshop_team(p_workshop));
$$;

grant execute on function
  private.workshop_workspace(uuid), private.workshop_team(uuid),
  private.can_read_workshop(uuid), private.can_manage_workshop(uuid)
to authenticated;

-- ----- RPC: build a workshop (+ blocks) from a template --------------
create or replace function public.create_workshop_from_template(
  p_team uuid, p_template uuid, p_title text, p_pulse uuid default null
) returns public.workshop language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_def jsonb; v_tname text; v_row public.workshop;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.can_manage_team(p_team) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select definition, name into v_def, v_tname from public.template
  where id = p_template and (workspace_id is null or workspace_id = v_ws);
  if v_def is null then raise exception 'template not available' using errcode = '23503'; end if;

  insert into public.workshop (team_id, title, template_id, pulse_id, created_by)
  values (p_team, coalesce(nullif(btrim(p_title), ''), v_tname), p_template, p_pulse, (select auth.uid()))
  returning * into v_row;

  insert into public.block (workshop_id, ord, title, activity_type, duration, prompt, linked_dynamic)
  select v_row.id, ph.ord,
         coalesce(ph.elem ->> 'title', 'Step'),
         coalesce((ph.elem ->> 'type')::public.activity_type, 'canvas'),
         coalesce((ph.elem ->> 'minutes')::int, 10),
         ph.elem ->> 'prompt',
         (ph.elem ->> 'dynamic')::public.team_dynamic
  from jsonb_array_elements(coalesce(v_def -> 'phases', '[]'::jsonb)) with ordinality as ph(elem, ord);

  perform private.write_audit(v_ws, (select auth.uid()), 'workshop.created', 'workshop', v_row.id,
                              jsonb_build_object('template', v_tname));
  return v_row;
end;
$$;

grant execute on function public.create_workshop_from_template(uuid, uuid, text, uuid) to authenticated;
revoke execute on function public.create_workshop_from_template(uuid, uuid, text, uuid) from public, anon;

-- ----- grants + RLS --------------------------------------------------
grant select, insert, update, delete on public.template, public.workshop, public.block to authenticated;

alter table public.template enable row level security;
alter table public.workshop enable row level security;
alter table public.block    enable row level security;

-- template: system templates readable by all; workspace templates by members; writes by workspace admins
create policy template_select on public.template
  for select to authenticated
  using (workspace_id is null or private.is_workspace_member(workspace_id));
create policy template_insert on public.template
  for insert to authenticated with check (private.is_workspace_admin(workspace_id));
create policy template_update on public.template
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));
create policy template_delete on public.template
  for delete to authenticated using (private.is_workspace_admin(workspace_id));

-- workshop: members read; lead/admin manage
create policy workshop_select on public.workshop
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy workshop_insert on public.workshop
  for insert to authenticated with check (private.can_manage_team(team_id));
create policy workshop_update on public.workshop
  for update to authenticated
  using (private.can_manage_team(team_id))
  with check (private.is_workspace_member(workspace_id));
create policy workshop_delete on public.workshop
  for delete to authenticated using (private.can_manage_team(team_id));

-- block: follows workshop access
create policy block_select on public.block
  for select to authenticated using (private.can_read_workshop(workshop_id));
create policy block_insert on public.block
  for insert to authenticated with check (private.can_manage_workshop(workshop_id));
create policy block_update on public.block
  for update to authenticated
  using (private.can_manage_workshop(workshop_id))
  with check (private.can_manage_workshop(workshop_id));
create policy block_delete on public.block
  for delete to authenticated using (private.can_manage_workshop(workshop_id));
