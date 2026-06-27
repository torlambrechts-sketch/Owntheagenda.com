-- =====================================================================
-- Indexes supporting the assessment suite overview (and the existing
-- per-survey reads). Without these the suite_overview function — which, per
-- survey, checks for a linked workshop block and which scans surveys by
-- workspace — falls back to sequential scans:
--   * block had no index on survey_id (only workshop_id), so the
--     "linked workshop" lookup seq-scanned block per survey (also hit by
--     loadAssessmentDetail's block-by-survey query).
--   * survey had no index on workspace_id / team_id, so the overview's
--     workspace filter and the suite list's team filter seq-scanned survey.
-- All partial/plain btree, idempotent.
-- =====================================================================

create index if not exists block_survey_idx
  on public.block (survey_id) where survey_id is not null;

create index if not exists survey_workspace_idx
  on public.survey (workspace_id);

create index if not exists survey_team_idx
  on public.survey (team_id);

-- Cover the user_id foreign keys on the member tables (the composite/PK lead
-- with workspace_id, so a user-scoped FK check / cascade-on-user-delete would
-- otherwise seq-scan). Flagged by Supabase's unindexed_foreign_keys advisor.
create index if not exists member_detail_user_idx
  on public.member_detail (user_id);

create index if not exists member_competence_user_id_idx
  on public.member_competence (user_id);
