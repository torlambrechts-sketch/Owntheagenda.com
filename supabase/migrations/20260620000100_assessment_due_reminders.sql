-- In-app due reminders for assigned assessments.
--
-- Mirrors private.generate_due_reminders() (action items): a recipient gets a
-- due-soon nudge once and an overdue re-nudge at most weekly, until they've
-- completed the assessment. Completion is derived from individual_response so it
-- can't drift. Kept as its own function + cron job so the working action-item
-- generator is untouched. The email digest picks these up via the new kinds
-- (see the due-reminders Edge Function); email stays dormant until RESEND_API_KEY
-- is set, exactly like the existing reminders.

create or replace function private.generate_assessment_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_soon integer := 0; v_over integer := 0;
begin
  -- Due soon (today … +2 days), not yet completed.
  with cand as (
    select aa.workspace_id as ws, aa.assignee_user_id as uid, aa.id, aa.due_at::date as due,
      coalesce((
        select t.name from public.assessment_template t
        where t.key = aa.template_key
        order by (t.workspace_id = aa.workspace_id) desc nulls last
        limit 1
      ), aa.template_key) as nm
    from public.assessment_assignment aa
    where aa.due_at is not null
      and aa.due_at::date >= current_date and aa.due_at::date <= current_date + 2
      and not exists (
        select 1 from public.individual_response ir
        where ir.workspace_id = aa.workspace_id
          and ir.user_id = aa.assignee_user_id
          and ir.template_key = aa.template_key
      )
  )
  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  select c.ws, c.uid, 'assessment_due_soon',
    (case when c.due = current_date then 'Due today: '
          when c.due = current_date + 1 then 'Due tomorrow: '
          else 'Due soon: ' end) || left(c.nm, 80),
    'Assessment due ' || to_char(c.due, 'Mon DD') || '.',
    '/assessments', 'assessment_assignment', c.id
  from cand c
  where not exists (
    select 1 from public.notification n
    where n.user_id = c.uid and n.entity_type = 'assessment_assignment'
      and n.entity_id = c.id and n.kind = 'assessment_due_soon'
  );
  get diagnostics v_soon = row_count;

  -- Overdue, re-nudge at most weekly.
  with cand as (
    select aa.workspace_id as ws, aa.assignee_user_id as uid, aa.id, aa.due_at::date as due,
      coalesce((
        select t.name from public.assessment_template t
        where t.key = aa.template_key
        order by (t.workspace_id = aa.workspace_id) desc nulls last
        limit 1
      ), aa.template_key) as nm
    from public.assessment_assignment aa
    where aa.due_at is not null and aa.due_at::date < current_date
      and not exists (
        select 1 from public.individual_response ir
        where ir.workspace_id = aa.workspace_id
          and ir.user_id = aa.assignee_user_id
          and ir.template_key = aa.template_key
      )
  )
  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  select c.ws, c.uid, 'assessment_overdue',
    'Overdue: ' || left(c.nm, 80),
    'Assessment was due ' || to_char(c.due, 'Mon DD') || ' — not completed.',
    '/assessments', 'assessment_assignment', c.id
  from cand c
  where not exists (
    select 1 from public.notification n
    where n.user_id = c.uid and n.entity_type = 'assessment_assignment'
      and n.entity_id = c.id and n.kind = 'assessment_overdue'
      and n.created_at > now() - interval '7 days'
  );
  get diagnostics v_over = row_count;

  return v_soon + v_over;
end;
$$;

revoke execute on function private.generate_assessment_reminders() from public;

-- Run just after the action-item generator. Idempotent by job name.
create extension if not exists pg_cron;
select cron.schedule('assessment-due-reminders', '5 7 * * *',
  $$select private.generate_assessment_reminders();$$);
