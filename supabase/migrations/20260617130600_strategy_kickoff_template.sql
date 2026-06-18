-- Strategy Kickoff for leadership teams: run the Strategy Health diagnostic as
-- pre-work, read it together, then turn the few choices that matter into committed
-- priorities. Mirrors the bang-psych-safety prerequisite-survey pattern.
insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, 'strategy-kickoff', 'Strategy Kickoff — Leadership Teams', 'strategy',
  'OwnTheAgenda original · strategy diagnostic → alignment → committed priorities', 110,
  'Walk in with the data: the team runs the Strategy Health diagnostic ahead, reads the quality-vs-readiness gap together, names the few choices that matter, and commits to 3–5 strategic priorities. ~2 hours.',
  $json$
  {"meta":{"framework":"Strategy kickoff — diagnose, align, commit","instrument":"strategy_health"},"phases":[
    {"title":"Where we stand — strategy health","type":"survey","minutes":10,"prompt":"A short, anonymous read on the quality of our strategy and how ready we are to deliver it. Best done ahead as pre-work, so we walk in with the data.","config":{"kind":"strategy_health","timing":"prerequisite"}},
    {"title":"Read the diagnostic together","type":"discuss","minutes":25,"prompt":"What stands out in the Strategy Health results? Where are we strong on quality but weak on readiness — or the reverse? Look especially at where we disagree: that gap is the conversation."},
    {"title":"The few choices that matter","type":"brainstorm","minutes":20,"prompt":"Write privately first: what are the 3–5 strategic choices we must get right this year? Be specific — a real choice has a credible alternative we are saying no to.","config":{"budget":3,"silent":true}},
    {"title":"Pressure-test the strategy","type":"feedback","minutes":20,"prompt":"Sort our thinking honestly into the columns — be candid about what we are dodging.","config":{"lanes":["Clear & differentiated","Fuzzy or me-too","Avoiding the decision"]}},
    {"title":"Commit to strategic priorities","type":"charter","minutes":20,"dynamic":"decision_rights","prompt":"Turn the best choices into 3–5 strategic priorities we commit to — sharp enough to guide real trade-offs. Captured as goals in the team charter.","config":{"section":"goals"}},
    {"title":"Owners, milestones & re-measure","type":"outcome","minutes":15,"dynamic":"role_clarity","prompt":"Capture owned, dated commitments (leaders go first), name the first milestone for each priority, and schedule a Strategy Health re-measure next quarter."}
  ]}
  $json$::jsonb
where not exists (select 1 from public.template where key = 'strategy-kickoff');

insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, 'strategy-kickoff-remeasure', 'Strategy Health — Re-measure', 'strategy',
  'OwnTheAgenda original · strategy diagnostic re-measure', 45,
  'Re-run the Strategy Health read a quarter on, see the shift in quality and readiness, and adjust the team''s strategic priorities.',
  $json$
  {"meta":{"framework":"Strategy kickoff","instrument":"strategy_health","variant":"remeasure"},"phases":[
    {"title":"Re-measure strategy health","type":"survey","minutes":10,"prompt":"The same short read as last time — let us see how our strategy quality and readiness have shifted.","config":{"kind":"strategy_health","timing":"live"}},
    {"title":"What moved, what didn't","type":"discuss","minutes":15,"prompt":"Compare with last quarter. Which priorities are we actually delivering? Where has readiness improved — and where are we still stuck?"},
    {"title":"Adjust the priorities","type":"charter","minutes":10,"dynamic":"decision_rights","prompt":"Update our strategic priorities in the charter — drop what is done or wrong, sharpen what remains.","config":{"section":"goals"}},
    {"title":"Commit","type":"outcome","minutes":10,"prompt":"Capture new owned, dated commitments for the quarter ahead."}
  ]}
  $json$::jsonb
where not exists (select 1 from public.template where key = 'strategy-kickoff-remeasure');
