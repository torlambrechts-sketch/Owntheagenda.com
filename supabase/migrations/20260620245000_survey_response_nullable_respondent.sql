-- =====================================================================
-- Fix: anonymous responses must allow a null respondent_id.
-- Phase M introduced the anonymous path (respondent_id null + respondent_hash)
-- but the original survey_subsystem migration declared respondent_id NOT NULL,
-- so every anonymous submission — the DEFAULT mode — and every public-link
-- response was rejected with a not-null violation. Drop the constraint; the
-- two partial unique indexes (attributed on respondent_id, anonymous on
-- respondent_hash) already enforce one-row-per-respondent in each mode.
-- =====================================================================

alter table public.survey_response alter column respondent_id drop not null;
