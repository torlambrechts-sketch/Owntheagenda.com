-- The run cockpit's decision module records block-scoped decisions by stamping
-- decision.block_ord and committing rationale/status via UPDATE. The decision
-- table only had a SELECT policy (writes went through the create_decision
-- definer RPC), so those UPDATEs were silently RLS-blocked. Grant session
-- members INSERT/UPDATE on decisions in sessions they can read — consistent with
-- idea / action_item / session_comment.
drop policy if exists decision_insert on decision;
create policy decision_insert on decision for insert
  with check (private.can_read_session(session_id));
drop policy if exists decision_update on decision;
create policy decision_update on decision for update
  using (private.can_read_session(session_id))
  with check (private.can_read_session(session_id));
