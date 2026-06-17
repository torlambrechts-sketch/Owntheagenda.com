-- =====================================================================
-- OwnTheAgenda · 0004 · Row-Level Security
-- ---------------------------------------------------------------------
-- RLS is enabled on every table. Reads are scoped to workspace members;
-- writes are scoped to admins / team managers; tenant provisioning and
-- invitation acceptance happen only through the SECURITY DEFINER RPCs in
-- 0003 (which is why workspace/audit_log have no INSERT policy).
--
-- `(select auth.uid())` is wrapped in a sub-select so Postgres caches it
-- as an initplan once per statement instead of per row.
-- =====================================================================

-- Grant table DML to the API role; RLS then decides which rows are visible.
grant select, insert, update, delete on
  public.workspace, public.profile, public.membership,
  public.team, public.team_member, public.invitation
to authenticated;
grant select on public.audit_log to authenticated;

alter table public.workspace   enable row level security;
alter table public.profile     enable row level security;
alter table public.membership  enable row level security;
alter table public.team        enable row level security;
alter table public.team_member enable row level security;
alter table public.invitation  enable row level security;
alter table public.audit_log   enable row level security;

-- ----- workspace -----------------------------------------------------
-- Created only via provision_workspace(); no INSERT policy on purpose.
create policy workspace_select on public.workspace
  for select to authenticated using (private.is_workspace_member(id));

create policy workspace_update on public.workspace
  for update to authenticated
  using (private.is_workspace_admin(id))
  with check (private.is_workspace_admin(id));

create policy workspace_delete on public.workspace
  for delete to authenticated using (private.workspace_role(id) = 'owner');

-- ----- profile -------------------------------------------------------
create policy profile_select on public.profile
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_workspace(id));

create policy profile_insert_self on public.profile
  for insert to authenticated with check (id = (select auth.uid()));

create policy profile_update_self on public.profile
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ----- membership ----------------------------------------------------
create policy membership_select on public.membership
  for select to authenticated using (private.is_workspace_member(workspace_id));

create policy membership_insert_admin on public.membership
  for insert to authenticated with check (private.is_workspace_admin(workspace_id));

create policy membership_update_admin on public.membership
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

-- Admins remove anyone; a member may remove themselves (leave).
create policy membership_delete on public.membership
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id) or user_id = (select auth.uid()));

-- ----- team ----------------------------------------------------------
create policy team_select on public.team
  for select to authenticated using (private.is_workspace_member(workspace_id));

create policy team_insert on public.team
  for insert to authenticated with check (private.is_workspace_admin(workspace_id));

create policy team_update on public.team
  for update to authenticated
  using (private.can_manage_team(id))
  with check (private.is_workspace_member(workspace_id));

create policy team_delete on public.team
  for delete to authenticated using (private.is_workspace_admin(workspace_id));

-- ----- team_member ---------------------------------------------------
create policy team_member_select on public.team_member
  for select to authenticated using (private.can_read_team(team_id));

create policy team_member_insert on public.team_member
  for insert to authenticated with check (private.can_manage_team(team_id));

-- Managers edit team_member rows; a user edits their own consent only via
-- public.set_team_consent() (a definer RPC), not a broad self-update policy.
create policy team_member_update on public.team_member
  for update to authenticated
  using (private.can_manage_team(team_id))
  with check (private.can_manage_team(team_id));

create policy team_member_delete on public.team_member
  for delete to authenticated
  using (private.can_manage_team(team_id) or user_id = (select auth.uid()));

-- ----- invitation ----------------------------------------------------
-- Admins see all invites; an invitee can see their own (matched by email).
create policy invitation_select on public.invitation
  for select to authenticated
  using (private.is_workspace_admin(workspace_id)
         or lower(email) = lower((select auth.email())));

-- Direct row management for the admin UI (revoke etc.); issuing tokens is
-- done through create_invitation() so the raw token is never persisted.
create policy invitation_insert_admin on public.invitation
  for insert to authenticated with check (private.is_workspace_admin(workspace_id));

create policy invitation_update_admin on public.invitation
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

create policy invitation_delete_admin on public.invitation
  for delete to authenticated using (private.is_workspace_admin(workspace_id));

-- ----- audit_log -----------------------------------------------------
-- Read-only to workspace admins; writes happen only via private.write_audit().
create policy audit_select_admin on public.audit_log
  for select to authenticated using (private.is_workspace_admin(workspace_id));
