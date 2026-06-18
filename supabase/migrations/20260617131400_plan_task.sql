-- Project-plan tasks for an Outcome step: tasks + sub-tasks with owners and
-- start/end dates, edited live in the run (list + waterfall views) and synced via
-- realtime. Mirrors the canvas pattern: direct table access under can_read_session.
create table if not exists public.plan_task (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  block_ord int not null,
  parent_id uuid references public.plan_task(id) on delete cascade,
  title text not null default '',
  owner_name text,
  owner_id uuid,
  start_date date,
  end_date date,
  status text not null default 'todo',
  ord int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_task_session_idx on public.plan_task(session_id, block_ord);

create or replace function private.set_plan_task_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.session where id = new.session_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists plan_task_defaults on public.plan_task;
create trigger plan_task_defaults before insert or update on public.plan_task
  for each row execute function private.set_plan_task_defaults();

alter table public.plan_task enable row level security;
drop policy if exists plan_task_read on public.plan_task;
create policy plan_task_read on public.plan_task for select to authenticated using (private.can_read_session(session_id));
drop policy if exists plan_task_write on public.plan_task;
create policy plan_task_write on public.plan_task for insert to authenticated with check (private.can_read_session(session_id));
drop policy if exists plan_task_update on public.plan_task;
create policy plan_task_update on public.plan_task for update to authenticated using (private.can_read_session(session_id)) with check (private.can_read_session(session_id));
drop policy if exists plan_task_delete on public.plan_task;
create policy plan_task_delete on public.plan_task for delete to authenticated using (private.can_read_session(session_id));

alter table public.plan_task replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='plan_task') then
    alter publication supabase_realtime add table public.plan_task;
  end if;
end $$;
