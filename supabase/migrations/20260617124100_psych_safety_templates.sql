-- Psychological safety in leadership teams (Bang) — workshop templates as data.
insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, 'bang-psych-safety', 'Psychological Safety — Leadership Teams (Bang)', 'team',
  'OwnTheAgenda original · grounded in Bang & Midelfart; Edmondson (1999); Fyhn et al. (2023)', 110,
  'Henning Bang''s research-based approach for leadership teams: measure psychological safety + behavioural integration, read the climate gap, and commit to safety-building norms. ~2 hours.',
  $json$
  {"meta":{"framework":"Bang — psychological safety in leadership teams","instrument":"psych_safety_bang"},"phases":[
    {"title":"Where we stand — psychological safety","type":"survey","minutes":10,"dynamic":"psych_safety","prompt":"A short, anonymous read on psychological safety and how we work together. Done ahead as a pre-assessment, or live now.","config":{"kind":"psych_safety_bang","timing":"prerequisite"}},
    {"title":"Read the results together","type":"discuss","minutes":25,"dynamic":"psych_safety","prompt":"What stands out? Look at where we score — and especially where we disagree (the climate gap). What might explain it?"},
    {"title":"What makes it hard to speak up?","type":"brainstorm","minutes":20,"dynamic":"psych_safety","prompt":"Write privately first: when have you held back a question, concern or mistake here — and what stopped you?","config":{"budget":3,"silent":true}},
    {"title":"Behaviours that build safety","type":"feedback","minutes":20,"dynamic":"conflict_norms","prompt":"What concrete behaviours would raise safety? Add them to the right column.","config":{"lanes":["Make it safe to speak up","Make it safe to disagree","Make it safe to fail"]}},
    {"title":"Agree our safety norms","type":"charter","minutes":20,"dynamic":"conflict_norms","prompt":"Turn the best behaviours into 3–5 norms we commit to — captured in the team charter.","config":{"section":"norms"}},
    {"title":"Commit & re-measure","type":"outcome","minutes":15,"dynamic":"decision_rights","prompt":"Capture owned, dated commitments (leaders go first), and schedule a re-measure in 8–10 weeks."}
  ]}
  $json$::jsonb
where not exists (select 1 from public.template where key = 'bang-psych-safety');

insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, 'bang-psych-safety-remeasure', 'Psychological Safety — Re-measure (Bang)', 'team',
  'OwnTheAgenda original · grounded in Bang & Midelfart; Edmondson (1999); Fyhn et al. (2023)', 45,
  'Re-run the psychological-safety read 8–10 weeks on, see the shift, and adjust the team''s safety norms.',
  $json$
  {"meta":{"framework":"Bang — psychological safety","instrument":"psych_safety_bang","variant":"remeasure"},"phases":[
    {"title":"Re-measure psychological safety","type":"survey","minutes":10,"dynamic":"psych_safety","prompt":"The same short read as last time — let's see the shift.","config":{"kind":"psych_safety_bang","timing":"live"}},
    {"title":"What moved, what didn't","type":"discuss","minutes":15,"dynamic":"psych_safety","prompt":"Compare with last time. Which norms are we living? Where is the climate still split?"},
    {"title":"Adjust our norms","type":"charter","minutes":10,"dynamic":"conflict_norms","prompt":"Update the safety norms in our charter — drop what isn't working, sharpen what is.","config":{"section":"norms"}},
    {"title":"Commit","type":"outcome","minutes":10,"prompt":"Capture new owned, dated commitments."}
  ]}
  $json$::jsonb
where not exists (select 1 from public.template where key = 'bang-psych-safety-remeasure');
