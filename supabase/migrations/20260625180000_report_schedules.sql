-- Insight Reports subsystem: durable scheduled/one-off report definitions + a
-- run log. Delivery (Resend) + cadence (pg_cron + edge function) are wired in a
-- later step; this is the persistence the Reports tab reads/writes.

create table if not exists report_schedule (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  name text not null,
  format text not null default 'pdf',
  frequency text not null default 'once',
  recipients text[] not null default '{}',
  include jsonb not null default '{}'::jsonb,
  scope jsonb not null default '{}'::jsonb,
  message text,
  status text not null default 'active',
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists report_schedule_ws_idx on report_schedule(workspace_id, created_at desc);
create index if not exists report_schedule_due_idx on report_schedule(next_run_at)
  where status = 'active' and frequency <> 'once';

create table if not exists report_run (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references report_schedule(id) on delete set null,
  workspace_id uuid not null references workspace(id) on delete cascade,
  format text not null,
  recipients text[] not null default '{}',
  status text not null default 'queued',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists report_run_ws_idx on report_run(workspace_id, created_at desc);

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists set_updated_at on report_schedule;
create trigger set_updated_at before update on report_schedule
  for each row execute function private.touch_updated_at();

alter table report_schedule enable row level security;
alter table report_run enable row level security;

drop policy if exists report_schedule_select on report_schedule;
create policy report_schedule_select on report_schedule for select
  using (private.is_workspace_member(workspace_id));
drop policy if exists report_schedule_insert on report_schedule;
create policy report_schedule_insert on report_schedule for insert
  with check (private.is_workspace_admin(workspace_id));
drop policy if exists report_schedule_update on report_schedule;
create policy report_schedule_update on report_schedule for update
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));
drop policy if exists report_schedule_delete on report_schedule;
create policy report_schedule_delete on report_schedule for delete
  using (private.is_workspace_admin(workspace_id));

drop policy if exists report_run_select on report_run;
create policy report_run_select on report_run for select
  using (private.is_workspace_member(workspace_id));
drop policy if exists report_run_insert on report_run;
create policy report_run_insert on report_run for insert
  with check (private.is_workspace_admin(workspace_id));
