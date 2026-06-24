-- Workshop objectives become an ordered list (design: Overview "Objectives" card
-- + builder multi-objective editor). The legacy single `objective` text column is
-- kept and mirrored to objectives[1] so existing readers (run cockpit, overview
-- note) keep working untouched.

alter table public.workshop
  add column if not exists objectives text[] not null default '{}';

-- Backfill the list from the legacy single objective where one exists.
update public.workshop
   set objectives = array[objective]
 where objective is not null
   and btrim(objective) <> ''
   and (objectives is null or array_length(objectives, 1) is null);

comment on column public.workshop.objectives is
  'Ordered list of session objectives. workshop.objective mirrors objectives[1] for legacy readers.';
