-- Phase 8: remap legacy block types to the design taxonomy now that the run
-- cockpit renders the design modules. Run data is session-scoped (not derived
-- from block type) so historical sessions are unaffected; this changes future
-- runs + the builder. Deliberately KEEP charter/manual/assess/survey — they have
-- dedicated modules (charter, user-manual, assessment) that flattening to a
-- design type would lose. checkin/vote/canvas are already design types.
update block set activity_type = 'discussion' where activity_type = 'discuss';
update block set activity_type = 'discussion' where activity_type = 'hmw';
update block set activity_type = 'canvas'     where activity_type = 'brainstorm';
update block set activity_type = 'breakout'   where activity_type = 'feedback';
update block set activity_type = 'reflect'    where activity_type = 'retrospective';
update block set activity_type = 'actions'    where activity_type = 'outcome';

update template t set definition = jsonb_set(
  t.definition, '{phases}',
  (select coalesce(jsonb_agg(
     case when elem->>'type' in ('discuss','hmw','brainstorm','feedback','retrospective','outcome')
       then jsonb_set(elem, '{type}', to_jsonb(
         case elem->>'type'
           when 'discuss' then 'discussion'
           when 'hmw' then 'discussion'
           when 'brainstorm' then 'canvas'
           when 'feedback' then 'breakout'
           when 'retrospective' then 'reflect'
           when 'outcome' then 'actions'
         end))
       else elem end), '[]'::jsonb)
   from jsonb_array_elements(t.definition->'phases') elem)
)
where t.definition ? 'phases' and jsonb_typeof(t.definition->'phases') = 'array';
