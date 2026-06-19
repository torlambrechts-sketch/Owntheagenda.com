-- =====================================================================
-- Reaction / comment visibility mirrors card visibility
-- ---------------------------------------------------------------------
-- Review fix: idea_select hides silent / pre-work cards until they're
-- revealed (own + facilitator excepted). The reaction/comment select
-- policies only checked can_read_session, so during silent ideation a
-- plain member could read engagement (and comment bodies) on cards they
-- can't see. Gate both on block visibility, same as the card itself.
-- =====================================================================

drop policy idea_reaction_select on public.idea_reaction;
create policy idea_reaction_select on public.idea_reaction
  for select to authenticated
  using (private.can_read_session(session_id)
         and (private.is_session_facilitator(session_id)
              or private.block_revealed(session_id, block_ord)));

drop policy idea_comment_select on public.idea_comment;
create policy idea_comment_select on public.idea_comment
  for select to authenticated
  using (private.can_read_session(session_id)
         and (private.is_session_facilitator(session_id)
              or private.block_revealed(session_id, block_ord)));
