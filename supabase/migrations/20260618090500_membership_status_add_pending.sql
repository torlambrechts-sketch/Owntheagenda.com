-- RBAC P2: a self-join request that an admin must approve sits in 'pending'.
-- is_workspace_member only counts 'active', so pending users have no access
-- until approved. Additive + safe on the existing enum.
alter type public.membership_status add value if not exists 'pending';
