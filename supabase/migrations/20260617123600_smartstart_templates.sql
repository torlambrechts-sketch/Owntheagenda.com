-- Start Smart templates (NHH) as data. Category 'kickoff'. Global (workspace_id null).
insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, 'start-smart-full', 'Start Smart — Team kickoff (full)', 'kickoff',
  'OwnTheAgenda original · grounded in NHH''s Start Smart (Schei & Sverdrup)', 210,
  'NHH''s research-based team start-up: purpose, goals, roles, work methods and norms → a living team charter, with a grounding assessment. ~3 hours.',
  $json$
  {"phases":[
    {"title":"Where we stand","type":"assess","minutes":10,"prompt":"A quick read on the five team dynamics to ground today — done ahead as a pre-assessment, or live now.","config":{"timing":"prerequisite"}},
    {"title":"Personal user manual","type":"manual","minutes":35,"dynamic":"psych_safety","prompt":"How do you work best, and how can we get the best from you? Share your strengths, what drains you, and how you like feedback. Pass on anything you'd rather not.","config":{"fields":["strengths","working_style","feedback_pref","watch_outs"],"allowPass":true,"leaderFirst":true}},
    {"title":"Purpose — why we exist","type":"discuss","minutes":25,"dynamic":"role_clarity","prompt":"In one sentence: why does this team exist? What is different because we are here?","config":{"capture":"purpose"}},
    {"title":"Goals — what, by when","type":"brainstorm","minutes":30,"dynamic":"role_clarity","prompt":"What must we achieve, and by when? Propose SMART goals; we'll prioritise the vital few.","config":{"budget":3,"capture":"goals"}},
    {"title":"Roles & responsibilities","type":"charter","minutes":30,"dynamic":"decision_rights","prompt":"Which functions must be covered to hit those goals — and who owns each? Name the gaps and overlaps.","config":{"section":"roles"}},
    {"title":"How we work","type":"feedback","minutes":20,"dynamic":"role_clarity","prompt":"Agree the practical mechanics of working together.","config":{"lanes":["Meetings","Communication","Tools","Decisions"],"capture":"work_methods"}},
    {"title":"Collaboration norms","type":"brainstorm","minutes":30,"dynamic":"conflict_norms","prompt":"How do we want to behave together — especially when it's hard? Write privately first; then we vote and commit.","config":{"budget":3,"silent":true,"capture":"norms"}},
    {"title":"Charter & commitments","type":"charter","minutes":20,"dynamic":"decision_rights","prompt":"Review our charter. Turn the first moves into owned, dated commitments and schedule our follow-up.","config":{"section":"review"}}
  ]}
  $json$::jsonb
where not exists (select 1 from public.template where key = 'start-smart-full');

insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, 'start-smart-short', 'Start Smart — Team kickoff (short)', 'kickoff',
  'OwnTheAgenda original · grounded in NHH''s Start Smart (Schei & Sverdrup)', 90,
  'The essential Start Smart in ~90 minutes: user manual, purpose, goals and norms → a living charter.',
  $json$
  {"phases":[
    {"title":"Personal user manual","type":"manual","minutes":25,"dynamic":"psych_safety","prompt":"How do you work best, and how can we get the best from you? Share strengths, what drains you, and how you like feedback. Pass on anything you'd rather not.","config":{"fields":["strengths","working_style","feedback_pref"],"allowPass":true,"leaderFirst":true}},
    {"title":"Purpose — why we exist","type":"discuss","minutes":15,"dynamic":"role_clarity","prompt":"In one sentence: why does this team exist?","config":{"capture":"purpose"}},
    {"title":"Goals — what, by when","type":"brainstorm","minutes":20,"dynamic":"role_clarity","prompt":"What must we achieve, and by when? Propose SMART goals; prioritise the vital few.","config":{"budget":3,"capture":"goals"}},
    {"title":"Collaboration norms","type":"brainstorm","minutes":20,"dynamic":"conflict_norms","prompt":"How do we want to behave together — especially when it's hard? Write privately first, then vote.","config":{"budget":3,"silent":true,"capture":"norms"}},
    {"title":"Charter & commitments","type":"charter","minutes":10,"dynamic":"decision_rights","prompt":"Review the charter and turn first moves into owned, dated commitments.","config":{"section":"review"}}
  ]}
  $json$::jsonb
where not exists (select 1 from public.template where key = 'start-smart-short');

insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, 'start-smart-followup', 'Start Smart — Follow-up', 'kickoff',
  'OwnTheAgenda original · grounded in NHH''s Start Smart (Schei & Sverdrup)', 60,
  'Revisit the charter and re-measure the dynamics ~6–8 weeks on — the single biggest driver of lasting impact.',
  $json$
  {"phases":[
    {"title":"Check-in","type":"checkin","minutes":5,"prompt":"One word: how has working together felt since we set the charter?"},
    {"title":"Charter review","type":"charter","minutes":20,"dynamic":"decision_rights","prompt":"Revisit our purpose, goals, roles and norms. What's working? What needs adjusting?","config":{"section":"review"}},
    {"title":"Re-rate the dynamics","type":"assess","minutes":10,"prompt":"Re-rate the five dynamics to see the shift since we started.","config":{"timing":"live"}},
    {"title":"Norm to add or adjust","type":"brainstorm","minutes":15,"dynamic":"conflict_norms","prompt":"What's one norm we should add, drop, or sharpen based on the last few weeks?","config":{"budget":2}},
    {"title":"Adjust & commit","type":"outcome","minutes":10,"prompt":"Update the charter and capture new owned, dated commitments."}
  ]}
  $json$::jsonb
where not exists (select 1 from public.template where key = 'start-smart-followup');
