-- A longer "detail" note on a brainstorm/check-in card. Authors (and the session
-- facilitator) can edit it; existing idea_update RLS already covers this.
alter table public.idea add column if not exists detail text;
