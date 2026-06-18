-- RBAC P1: extend the workspace role with Team Manager and Facilitator.
-- Ordered by descending privilege: owner, admin, manager, facilitator, member.
-- (ADD VALUE is additive and irreversible; safe on the existing enum.)
alter type public.workspace_role add value if not exists 'manager' before 'member';
alter type public.workspace_role add value if not exists 'facilitator' before 'member';
