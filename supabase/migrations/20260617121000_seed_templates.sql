-- =====================================================================
-- OwnTheAgenda · 0010 · System workshop templates (global reference)
-- ---------------------------------------------------------------------
-- workspace_id = null → readable by every workspace. The `definition`
-- jsonb is the data-not-code payload (phases). Idempotent on `key`.
-- =====================================================================

-- System templates have unique keys (enables idempotent re-seed).
create unique index if not exists template_system_key_idx
  on public.template (key) where workspace_id is null;

insert into public.template (key, name, category, source, default_duration, description, definition) values
('ldj','Lightning Decision Jam','ideation','AJ&Smart',60,
 'Turn problems into prioritised, testable actions — no open debate.',
 '{"phases":[
   {"title":"Sketch problems","type":"canvas","minutes":7,"prompt":"Write the problems you see — one per sticky, in silence."},
   {"title":"Vote on the problem","type":"vote","minutes":5},
   {"title":"Reframe as How-Might-We","type":"canvas","minutes":6,"prompt":"Turn the top problem into an optimistic \"How might we…?\""},
   {"title":"Sketch solutions","type":"canvas","minutes":7,"prompt":"One idea per sticky. Quantity over polish."},
   {"title":"Prioritise solutions","type":"vote","minutes":6},
   {"title":"Impact / Effort map","type":"vote","minutes":10},
   {"title":"Define next steps","type":"outcome","minutes":10,"prompt":"Turn quick wins into owned actions."}
 ]}'),
('ssc','Start / Stop / Continue','retro','Classic retro',45,
 'The simplest balanced retro. Three columns, fast to run.',
 '{"phases":[
   {"title":"Check-in","type":"checkin","minutes":5},
   {"title":"Fill the three columns","type":"canvas","minutes":15,"prompt":"What should we start, stop, and continue?"},
   {"title":"Group & vote","type":"vote","minutes":12},
   {"title":"Commit to changes","type":"outcome","minutes":10}
 ]}'),
('sailboat','Sailboat retrospective','retro','Luke Hohmann',50,
 'Wind, anchors, rocks and an island — what helps and holds you back.',
 '{"phases":[
   {"title":"Set the scene","type":"checkin","minutes":5},
   {"title":"Wind & anchors","type":"canvas","minutes":15,"prompt":"What pushes us forward (wind) and what holds us back (anchors)?"},
   {"title":"Rocks (risks)","type":"canvas","minutes":8,"prompt":"What risks lie ahead?"},
   {"title":"Vote on focus","type":"vote","minutes":10},
   {"title":"Actions","type":"outcome","minutes":10}
 ]}'),
('impact','Impact / Effort matrix','prioritization','2×2 method',30,
 'Plot ideas on impact vs effort to find the quick wins.',
 '{"phases":[
   {"title":"Gather ideas","type":"canvas","minutes":10},
   {"title":"Place on the 2×2","type":"canvas","minutes":12,"prompt":"Position each idea by impact and effort."},
   {"title":"Pick the quick wins","type":"vote","minutes":8}
 ]}'),
('team-canvas','Team Canvas','team','Alex Ivanov & Mitya Voloshchuk',60,
 'A Business Model Canvas for teamwork: purpose, goals, roles, values, rules.',
 '{"phases":[
   {"title":"Purpose & goals","type":"canvas","minutes":12,"prompt":"Why does this team exist, and what are we aiming for?"},
   {"title":"Roles & skills","type":"canvas","minutes":12},
   {"title":"Values","type":"canvas","minutes":10},
   {"title":"Rules & activities","type":"canvas","minutes":12},
   {"title":"One key insight each","type":"outcome","minutes":8}
 ]}'),
('five-beh','Five Behaviours','team','Patrick Lencioni',90,
 'Trust → conflict → commitment → accountability → results.',
 '{"phases":[
   {"title":"Trust audit","type":"canvas","minutes":18,"dynamic":"psych_safety","prompt":"Where did we avoid a hard conversation last quarter — and what did it cost us?"},
   {"title":"Conflict norms","type":"canvas","minutes":18,"dynamic":"conflict_norms","prompt":"Agree two norms for how this team disagrees in the open."},
   {"title":"Commitment clarity","type":"canvas","minutes":15},
   {"title":"Accountability","type":"discuss","minutes":15,"dynamic":"decision_rights"},
   {"title":"Results focus","type":"canvas","minutes":12},
   {"title":"Commit","type":"outcome","minutes":10,"prompt":"Each person names one commitment and an owner."}
 ]}'),
('health','Team Health Monitor','team','Atlassian',90,
 'Rate the team red/yellow/green against high-performing-team attributes.',
 '{"phases":[
   {"title":"Rate each attribute","type":"vote","minutes":20},
   {"title":"Discuss the reds","type":"discuss","minutes":25},
   {"title":"Pick two to fix","type":"vote","minutes":10},
   {"title":"Owner & first step","type":"outcome","minutes":12}
 ]}'),
('premortem','Pre-mortem','kickoff','Gary Klein, HBR 2007',30,
 'Imagine the project already failed, then work backwards to de-risk it.',
 '{"phases":[
   {"title":"Imagine total failure","type":"checkin","minutes":3,"prompt":"It is six months from now and this failed. What happened?"},
   {"title":"Write every reason","type":"canvas","minutes":8},
   {"title":"Consolidate (round robin)","type":"canvas","minutes":10},
   {"title":"Revise the plan","type":"outcome","minutes":8}
 ]}')
on conflict (key) where workspace_id is null do nothing;
