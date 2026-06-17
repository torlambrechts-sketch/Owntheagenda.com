-- =====================================================================
-- OwnTheAgenda · 0016 · Module-aware templates
-- ---------------------------------------------------------------------
-- Rework the system templates so they drive the new modules
-- (brainstorm / vote-poll / feedback), and add a set of common
-- frameworks. Templates carry `config` per phase (lanes, options,
-- vote budget). Re-runnable: existing keys are updated, new keys are
-- inserted on conflict-do-nothing.
-- =====================================================================

update public.template set default_duration = 40, description =
  'Turn problems into prioritised, testable actions — no open debate.',
  definition = '{"phases":[
    {"title":"Sketch problems","type":"brainstorm","minutes":8,"prompt":"Write the problems you see — one idea per card. Then dot-vote the most important.","config":{"budget":3}},
    {"title":"Reframe as How-Might-We","type":"canvas","minutes":6,"prompt":"Turn the top problem into an optimistic How might we…?"},
    {"title":"Sketch solutions","type":"brainstorm","minutes":8,"prompt":"One solution per card. Quantity over polish — then vote the strongest.","config":{"budget":3}},
    {"title":"Impact / effort sanity check","type":"discuss","minutes":8,"prompt":"Are the top votes low-effort and high-impact? Adjust together."},
    {"title":"Define next steps","type":"outcome","minutes":10,"prompt":"Turn quick wins into owned actions."}
  ]}'::jsonb
where key = 'ldj' and workspace_id is null;

update public.template set default_duration = 45, definition = '{"phases":[
    {"title":"Check-in","type":"checkin","minutes":5},
    {"title":"Start / Stop / Continue","type":"feedback","minutes":15,"prompt":"What should we start, stop, and continue?","config":{"lanes":["Start","Stop","Continue"]}},
    {"title":"Group & pick changes","type":"discuss","minutes":12,"prompt":"Cluster the themes and choose what to change."},
    {"title":"Commit to changes","type":"outcome","minutes":10}
  ]}'::jsonb
where key = 'ssc' and workspace_id is null;

update public.template set default_duration = 45, definition = '{"phases":[
    {"title":"Set the scene","type":"checkin","minutes":5},
    {"title":"Map the sailboat","type":"feedback","minutes":18,"prompt":"Add cards to each part of the boat.","config":{"lanes":["Wind (pushes us forward)","Anchors (holds us back)","Rocks (risks ahead)","Island (our goal)"]}},
    {"title":"Discuss the anchors","type":"discuss","minutes":12,"prompt":"What is slowing us most, and why?"},
    {"title":"Actions","type":"outcome","minutes":10}
  ]}'::jsonb
where key = 'sailboat' and workspace_id is null;

update public.template set default_duration = 30, definition = '{"phases":[
    {"title":"Gather ideas","type":"brainstorm","minutes":10,"prompt":"Add every idea on the table — one per card. Vote the ones worth plotting.","config":{"budget":5}},
    {"title":"Place on the 2×2","type":"canvas","minutes":12,"prompt":"Position each idea by impact (vertical) and effort (horizontal)."},
    {"title":"Pick the quick wins","type":"outcome","minutes":8,"prompt":"High impact, low effort — make them owned actions."}
  ]}'::jsonb
where key = 'impact' and workspace_id is null;

update public.template set default_duration = 65, definition = '{"phases":[
    {"title":"Rate the team","type":"vote","minutes":18,"prompt":"Dot-vote every attribute that feels strong right now.","config":{"budget":8,"options":["Shared goals","Clear roles & decision rights","Psychological safety","Pace & energy","Dependencies handled","Customer focus","Healthy conflict","Continuous improvement"]}},
    {"title":"Discuss the gaps","type":"discuss","minutes":25,"prompt":"Talk through the attributes that got few dots."},
    {"title":"Pick two to improve","type":"vote","minutes":10,"prompt":"Where will focus pay off most? Two dots each.","config":{"budget":2,"options":["Shared goals","Clear roles & decision rights","Psychological safety","Pace & energy","Dependencies handled","Customer focus","Healthy conflict","Continuous improvement"]}},
    {"title":"Owner & first step","type":"outcome","minutes":12}
  ]}'::jsonb
where key = 'health' and workspace_id is null;

update public.template set default_duration = 25, definition = '{"phases":[
    {"title":"Imagine total failure","type":"checkin","minutes":3,"prompt":"It is six months from now and this failed. What happened?"},
    {"title":"Write every reason","type":"brainstorm","minutes":10,"prompt":"One failure reason per card. Then vote the scariest risks.","config":{"budget":3}},
    {"title":"Revise the plan","type":"outcome","minutes":8,"prompt":"For the top risks, name a mitigation and an owner."}
  ]}'::jsonb
where key = 'premortem' and workspace_id is null;

insert into public.template (key, name, category, source, default_duration, description, definition) values
('mad-sad-glad','Mad / Sad / Glad','retro','Classic retro',45,
 'Surface the emotional signal in how the work felt.',
 '{"phases":[
   {"title":"Check-in","type":"checkin","minutes":5},
   {"title":"Mad / Sad / Glad","type":"feedback","minutes":15,"prompt":"What made you mad, sad, or glad this sprint?","config":{"lanes":["Mad","Sad","Glad"]}},
   {"title":"Talk it through","type":"discuss","minutes":15},
   {"title":"Commit to changes","type":"outcome","minutes":10}
 ]}'),
('four-ls','The 4 Ls','retro','Mary Gorman & Ellen Gottesdiener',45,
 'Liked, Learned, Lacked, Longed for — a balanced look back.',
 '{"phases":[
   {"title":"Check-in","type":"checkin","minutes":5},
   {"title":"The four Ls","type":"feedback","minutes":16,"prompt":"Add cards under each L.","config":{"lanes":["Liked","Learned","Lacked","Longed for"]}},
   {"title":"Discuss & cluster","type":"discuss","minutes":14},
   {"title":"Actions","type":"outcome","minutes":10}
 ]}'),
('rose-thorn-bud','Rose / Thorn / Bud','retro','IDEO / LUMA',30,
 'A quick pulse: what is blooming, what is prickly, what is emerging.',
 '{"phases":[
   {"title":"Rose / Thorn / Bud","type":"feedback","minutes":14,"prompt":"Rose: a highlight. Thorn: a challenge. Bud: an opportunity.","config":{"lanes":["Rose (highlight)","Thorn (challenge)","Bud (opportunity)"]}},
   {"title":"Discuss the buds","type":"discuss","minutes":10},
   {"title":"Actions","type":"outcome","minutes":6}
 ]}'),
('lean-coffee','Lean Coffee','ideation','Jim Benson & Jeremy Lightsmith',45,
 'A structured, agenda-less discussion: propose, vote, talk in order.',
 '{"phases":[
   {"title":"Propose topics","type":"brainstorm","minutes":8,"prompt":"Add the topics you want to discuss — one per card. Then dot-vote.","config":{"budget":3}},
   {"title":"Discuss top topics","type":"discuss","minutes":25,"prompt":"Work down the ranked list, timeboxed. Thumbs to continue or move on."},
   {"title":"Decisions & actions","type":"outcome","minutes":10}
 ]}'),
('dot-vote','Dot Voting','prioritization','Dot democracy',25,
 'List the options, then spend dots to surface shared priorities.',
 '{"phases":[
   {"title":"List the options","type":"brainstorm","minutes":10,"prompt":"Add every option — one per card — then dot-vote your priorities.","config":{"budget":5}},
   {"title":"Commit to the top choices","type":"outcome","minutes":10}
 ]}'),
('plus-delta','Plus / Delta','checkin','Quick feedback',20,
 'Two columns, two minutes: what worked and what to change next time.',
 '{"phases":[
   {"title":"Plus / Delta","type":"feedback","minutes":10,"prompt":"Plus: keep doing. Delta: change next time.","config":{"lanes":["Plus (+)","Delta (change)"]}},
   {"title":"Pick one change","type":"outcome","minutes":8}
 ]}'),
('swot','SWOT Analysis','strategy','Albert Humphrey',50,
 'Strengths, Weaknesses, Opportunities, Threats — a strategic snapshot.',
 '{"phases":[
   {"title":"Build the SWOT","type":"feedback","minutes":20,"prompt":"Add cards to each quadrant.","config":{"lanes":["Strengths","Weaknesses","Opportunities","Threats"]}},
   {"title":"Find the strategic moves","type":"discuss","minutes":18,"prompt":"Where do strengths meet opportunities? Where do threats meet weaknesses?"},
   {"title":"Commit to priorities","type":"outcome","minutes":12}
 ]}')
on conflict (key) where workspace_id is null do nothing;
