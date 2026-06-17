-- =====================================================================
-- OwnTheAgenda · 0024 · Covering indexes on hot-path foreign keys
-- ---------------------------------------------------------------------
-- From the performance advisor. Only the two FKs with a real query
-- pattern are indexed; the remaining created_by/workspace_id FKs are
-- low-traffic on small tables and left unindexed by design (the advisor
-- also flags over-indexing).
--   * action_item.decision_id — joined in the readout + close-session gate
--   * idea.author_id          — filtered in the idea RLS policy
-- =====================================================================

create index if not exists action_item_decision_idx on public.action_item (decision_id);
create index if not exists idea_author_idx           on public.idea (author_id);
