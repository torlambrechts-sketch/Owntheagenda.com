-- The redesigned builder is a phase kanban where blocks are dragged between
-- columns. Today a block's facilitation phase is *derived* from its activity_type
-- (ACTIVITY_PHASE), so it can't be moved independently. This adds an explicit,
-- nullable phase override: null = derive from activity_type (unchanged behaviour),
-- a value = the column the facilitator dragged it into.

alter table public.block
  add column if not exists phase text
  check (phase is null or phase in ('open','diverge','converge','decide','close'));

comment on column public.block.phase is
  'Explicit facilitation-phase override for the builder kanban; null = derived from activity_type.';
