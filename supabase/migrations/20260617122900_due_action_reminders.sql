-- Due-action reminders (in-app) + precise owner targeting.

-- 1. Link an action to a real owner so reminders reach the right person.
--    owner_name stays for display / free-text (non-platform) owners.
alter table public.action_item
  add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists action_item_owner_idx
  on public.action_item(owner_id) where owner_id is not null;

-- 2. Generator: in-app reminders for due-soon and overdue open actions.
--    Recipient = the linked owner, else the creator (who can chase / reassign).
--    Idempotent: due-soon fires once per action; overdue re-nudges at most weekly.
create or replace function private.generate_due_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_soon integer := 0; v_over integer := 0;
begin
  with cand as (
    select a.workspace_id as ws, coalesce(a.owner_id, a.created_by) as uid,
           a.id, a.text, a.due_at
    from public.action_item a
    where a.status = 'open' and a.due_at is not null
      and a.due_at >= current_date and a.due_at <= current_date + 2
      and coalesce(a.owner_id, a.created_by) is not null
  )
  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  select c.ws, c.uid, 'action_due_soon',
    (case when c.due_at = current_date then 'Due today: '
          when c.due_at = current_date + 1 then 'Due tomorrow: '
          else 'Due soon: ' end) || left(c.text, 80),
    'Due ' || to_char(c.due_at, 'Mon DD') || '.',
    '/actions', 'action', c.id
  from cand c
  where not exists (
    select 1 from public.notification n
    where n.user_id = c.uid and n.entity_type = 'action'
      and n.entity_id = c.id and n.kind = 'action_due_soon'
  );
  get diagnostics v_soon = row_count;

  with cand as (
    select a.workspace_id as ws, coalesce(a.owner_id, a.created_by) as uid,
           a.id, a.text, a.due_at
    from public.action_item a
    where a.status = 'open' and a.due_at is not null and a.due_at < current_date
      and coalesce(a.owner_id, a.created_by) is not null
  )
  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  select c.ws, c.uid, 'action_overdue',
    'Overdue: ' || left(c.text, 80),
    'Was due ' || to_char(c.due_at, 'Mon DD') || ' — still open.',
    '/actions', 'action', c.id
  from cand c
  where not exists (
    select 1 from public.notification n
    where n.user_id = c.uid and n.entity_type = 'action'
      and n.entity_id = c.id and n.kind = 'action_overdue'
      and n.created_at > now() - interval '7 days'
  );
  get diagnostics v_over = row_count;

  return v_soon + v_over;
end;
$$;

revoke execute on function private.generate_due_reminders() from public;

-- 3. Schedule daily at 07:00 UTC. Idempotent by job name (pg_cron >= 1.4 upserts).
create extension if not exists pg_cron;
select cron.schedule('due-action-reminders', '0 7 * * *',
  $$select private.generate_due_reminders();$$);
