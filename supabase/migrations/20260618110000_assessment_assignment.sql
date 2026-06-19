-- =====================================================================
-- Assessment assignment (closes the "no way to assign an instrument" gap)
-- ---------------------------------------------------------------------
-- An admin assigns an individual instrument to specific workspace members.
-- The assignee sees it flagged in the library; completing it (an
-- individual_response row) satisfies the assignment. Completion is derived,
-- never written, so it can't drift. Individual results stay private — the
-- admin status view returns only completion booleans, never scores.
-- (Team instruments already get whole-team participation via open surveys,
-- so assignment is scoped to individual instruments.)
-- =====================================================================

create table if not exists public.assessment_assignment (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspace(id) on delete cascade,
  template_key     text not null,
  assignee_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by      uuid not null references auth.users(id),
  note             text,
  due_at           timestamptz,
  created_at       timestamptz not null default now(),
  unique (workspace_id, template_key, assignee_user_id)
);
create index if not exists assessment_assignment_assignee
  on public.assessment_assignment (assignee_user_id, workspace_id);

alter table public.assessment_assignment enable row level security;
-- Assignees read their own; admins read all in their workspace. Writes only
-- through the security-definer RPCs below (no insert/update/delete policy).
drop policy if exists assessment_assignment_select on public.assessment_assignment;
create policy assessment_assignment_select on public.assessment_assignment
  for select to authenticated using (
    assignee_user_id = (select auth.uid()) or private.is_workspace_admin(workspace_id)
  );

-- Assign an instrument to a set of members (admin only). Idempotent per
-- (workspace, template, assignee); ignores ids that aren't active members.
create or replace function public.assign_assessment(
  p_workspace uuid, p_template_key text, p_assignees uuid[],
  p_note text default null, p_due timestamptz default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.assessment_assignment (workspace_id, template_key, assignee_user_id, assigned_by, note, due_at)
  select p_workspace, p_template_key, u, (select auth.uid()), p_note, p_due
  from unnest(p_assignees) as u
  where exists (
    select 1 from public.membership m
    where m.workspace_id = p_workspace and m.user_id = u and m.status = 'active'
  )
  on conflict (workspace_id, template_key, assignee_user_id)
    do update set note = excluded.note, due_at = excluded.due_at, assigned_by = excluded.assigned_by;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- Remove an assignment (admin only).
create or replace function public.unassign_assessment(
  p_workspace uuid, p_template_key text, p_assignee uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.assessment_assignment
   where workspace_id = p_workspace and template_key = p_template_key and assignee_user_id = p_assignee;
end; $$;

-- Per-assignee completion status for one instrument (admin only). Returns
-- whether each assignee has responded — booleans only, never their scores.
create or replace function public.assessment_assignment_status(
  p_workspace uuid, p_template_key text
) returns table (assignee_user_id uuid, due_at timestamptz, completed boolean)
language sql security definer set search_path = '' as $$
  select a.assignee_user_id, a.due_at,
         exists (
           select 1 from public.individual_response r
           where r.workspace_id = a.workspace_id
             and r.user_id = a.assignee_user_id
             and r.template_key = a.template_key
         ) as completed
  from public.assessment_assignment a
  where a.workspace_id = p_workspace
    and a.template_key = p_template_key
    and private.is_workspace_admin(p_workspace);
$$;

revoke execute on function public.assign_assessment(uuid, text, uuid[], text, timestamptz) from public, anon;
grant  execute on function public.assign_assessment(uuid, text, uuid[], text, timestamptz) to authenticated;
revoke execute on function public.unassign_assessment(uuid, text, uuid) from public, anon;
grant  execute on function public.unassign_assessment(uuid, text, uuid) to authenticated;
revoke execute on function public.assessment_assignment_status(uuid, text) from public, anon;
grant  execute on function public.assessment_assignment_status(uuid, text) to authenticated;
