-- Per-workspace integration connections (Slack, webhooks, …). Catalog of
-- providers lives in the app; this table stores connection state + config.
-- Config can hold secrets (webhook URLs), so reads are admin-only.
create table if not exists public.integration (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  provider text not null,
  status text not null default 'connected' check (status in ('connected','disabled')),
  config jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);
create index if not exists integration_ws_idx on public.integration(workspace_id);

alter table public.integration enable row level security;
drop policy if exists integration_read on public.integration;
create policy integration_read on public.integration for select to authenticated
  using (private.is_workspace_admin(workspace_id));
drop policy if exists integration_write on public.integration;
create policy integration_write on public.integration for all to authenticated
  using (private.is_workspace_admin(workspace_id)) with check (private.is_workspace_admin(workspace_id));
