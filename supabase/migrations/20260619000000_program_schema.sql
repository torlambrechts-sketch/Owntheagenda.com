-- =====================================================================
-- Workflow / Program — tie assessments, workshops and follow-ups into one
-- tracked operating loop. A `program` is the loop for a team; ordered
-- `program_step` rows reference existing primitives (a pulse, a workshop,
-- a follow-up) so the builder *conducts* the flow rather than duplicating
-- the assessment / workshop builders. Phase 1: the connecting object plus
-- a minimal state machine (create + advance).
-- =====================================================================

create table if not exists public.program (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  team_id uuid references public.team(id) on delete set null,
  title text not null,
  status text not null default 'active' check (status in ('active','completed','archived')),
  current_ord int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists program_workspace_idx on public.program(workspace_id, status);

create table if not exists public.program_step (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.program(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  ord int not null,
  kind text not null check (kind in ('assessment','launch','interpret','workshop','commit','repulse','custom')),
  title text not null,
  status text not null default 'pending' check (status in ('pending','active','done','skipped')),
  ref_table text check (ref_table in ('pulse','survey','workshop','follow_up')),
  ref_id uuid,
  gate text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists program_step_program_idx on public.program_step(program_id, ord);

-- Backfill workspace_id from the parent program and keep updated_at fresh.
create or replace function private.set_program_step_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.program where id = new.program_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists program_step_defaults on public.program_step;
create trigger program_step_defaults before insert or update on public.program_step
  for each row execute function private.set_program_step_defaults();

drop trigger if exists program_updated_at on public.program;
create trigger program_updated_at before update on public.program
  for each row execute function private.set_updated_at();

alter table public.program enable row level security;
alter table public.program_step enable row level security;

-- Read: any active workspace member. Write: workspace admins / owners.
drop policy if exists program_read on public.program;
create policy program_read on public.program for select to authenticated
  using (private.is_workspace_member(workspace_id));
drop policy if exists program_write on public.program;
create policy program_write on public.program for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));
drop policy if exists program_update on public.program;
create policy program_update on public.program for update to authenticated
  using (private.is_workspace_admin(workspace_id)) with check (private.is_workspace_admin(workspace_id));
drop policy if exists program_delete on public.program;
create policy program_delete on public.program for delete to authenticated
  using (private.is_workspace_admin(workspace_id));

drop policy if exists program_step_read on public.program_step;
create policy program_step_read on public.program_step for select to authenticated
  using (private.is_workspace_member(workspace_id));
drop policy if exists program_step_write on public.program_step;
create policy program_step_write on public.program_step for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));
drop policy if exists program_step_update on public.program_step;
create policy program_step_update on public.program_step for update to authenticated
  using (private.is_workspace_admin(workspace_id)) with check (private.is_workspace_admin(workspace_id));
drop policy if exists program_step_delete on public.program_step;
create policy program_step_delete on public.program_step for delete to authenticated
  using (private.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------
-- Create a program with the standard six-stage operating loop.
-- ---------------------------------------------------------------------
create or replace function public.create_program(p_workspace uuid, p_title text, p_team uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required' using errcode = '22023';
  end if;
  insert into public.program (workspace_id, team_id, title, created_by)
  values (p_workspace, p_team, btrim(p_title), (select auth.uid()))
  returning id into v_id;

  insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
  values
    (v_id, p_workspace, 1, 'assessment', 'Create assessment',  'active',  'Select template, audience and scoring'),
    (v_id, p_workspace, 2, 'launch',     'Launch and collect', 'pending', 'Hold until the response threshold is met'),
    (v_id, p_workspace, 3, 'interpret',  'Interpret results',  'pending', 'Aggregate-only reading and recommendation'),
    (v_id, p_workspace, 4, 'workshop',   'Create workshop',    'pending', 'Build the linked session'),
    (v_id, p_workspace, 5, 'commit',     'Run and commit',     'pending', 'Agree behaviour changes and owners'),
    (v_id, p_workspace, 6, 'repulse',    'Track and re-pulse', 'pending', 'Re-measure at the checkpoint');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Advance / update a single step. Marking a step done (or skipped)
-- activates the next pending step and bumps the program cursor; finishing
-- the last step completes the program.
-- ---------------------------------------------------------------------
create or replace function public.set_program_step(
  p_step uuid, p_status text,
  p_ref_table text default null, p_ref_id uuid default null,
  p_scheduled_at timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_program uuid; v_workspace uuid; v_ord int; v_max int;
begin
  select program_id, workspace_id, ord into v_program, v_workspace, v_ord
    from public.program_step where id = p_step;
  if v_program is null then raise exception 'no such step' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_status not in ('pending','active','done','skipped') then
    raise exception 'bad status' using errcode = '22023';
  end if;

  update public.program_step set
    status = p_status,
    ref_table = coalesce(p_ref_table, ref_table),
    ref_id = coalesce(p_ref_id, ref_id),
    scheduled_at = coalesce(p_scheduled_at, scheduled_at),
    completed_at = case when p_status = 'done' then now() else null end
  where id = p_step;

  if p_status in ('done', 'skipped') then
    update public.program_step set status = 'active'
      where program_id = v_program and ord = v_ord + 1 and status = 'pending';
    update public.program set current_ord = v_ord + 1 where id = v_program;
    select max(ord) into v_max from public.program_step where program_id = v_program;
    if v_ord >= v_max then
      update public.program set status = 'completed' where id = v_program;
    end if;
  else
    update public.program set status = 'active' where id = v_program and status = 'completed';
  end if;
end;
$$;

grant execute on function
  public.create_program(uuid, text, uuid),
  public.set_program_step(uuid, text, text, uuid, timestamptz)
to authenticated;
revoke execute on function
  public.create_program(uuid, text, uuid),
  public.set_program_step(uuid, text, text, uuid, timestamptz)
from public, anon;
