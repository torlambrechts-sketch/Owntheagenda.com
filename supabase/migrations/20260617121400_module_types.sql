-- =====================================================================
-- OwnTheAgenda · 0014 · Module activity types + per-block config
-- ---------------------------------------------------------------------
-- The builder grows from "prompt steps" into composable modules. Two new
-- activity types join the existing set, and every block gains a `config`
-- jsonb so a module can carry its own settings (vote budget, poll
-- options, feedback lanes) — still data-not-code.
--
-- New enum values must be added in their own transaction before anything
-- can use them as a value, so this migration is intentionally tiny.
-- =====================================================================

alter type public.activity_type add value if not exists 'brainstorm';
alter type public.activity_type add value if not exists 'feedback';

alter table public.block add column if not exists config jsonb not null default '{}'::jsonb;
