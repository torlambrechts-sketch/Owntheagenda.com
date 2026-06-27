-- =====================================================================
-- OwnTheAgenda · Project Aristotle — browsable follow-up template
-- ---------------------------------------------------------------------
-- A team-agnostic system workshop template (workspace_id null) that works
-- all five Aristotle pillars in one ~90-minute session — one core activity
-- per pillar, bracketed by a grounding assess and a re-measure close.
--
-- This is the browsable, generic counterpart to the *generated* follow-up:
-- a closed aristotle_team pulse still produces a version tailored to a
-- team's actual deficits via aristotle_diagnostic / create_workshop_from_
-- diagnostic. This template is for picking off the shelf, deficits unknown.
-- =====================================================================

insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, 'aristotle-follow-up', 'Project Aristotle — Team Follow-up', 'team',
  'OwnTheAgenda · grounded in Google re:Work, "Project Aristotle"', 91,
  'Work all five Aristotle pillars in one session — psychological safety, dependability, structure & clarity, meaning and impact. Or let a closed Aristotle pulse generate a version tailored to your team''s deficits.',
  $json$
  {"phases":[
    {"title":"Where we stand","type":"assess","minutes":8,"prompt":"Ground the session in the team's Project Aristotle read — what stands out across the five pillars, and what surprised us?","config":{"timing":"live"}},
    {"title":"Safety to speak","type":"feedback","minutes":15,"dynamic":"psych_safety","prompt":"What would make it safer to speak up, disagree and admit mistakes here?","config":{"lanes":["Start doing","Stop doing","Leaders model"]}},
    {"title":"Reliable by design","type":"discuss","minutes":14,"prompt":"Agree what 'done' means here, and how we make and track commitments so nothing needs chasing.","config":{"capture":"commitments"}},
    {"title":"Lanes & decisions","type":"charter","minutes":16,"dynamic":"role_clarity","prompt":"Map each key responsibility to a single owner and agree who decides what (RAPID/RACI). Name the gaps and overlaps.","config":{"section":"roles"}},
    {"title":"Why this matters","type":"discuss","minutes":14,"prompt":"Connect our work to the mission and to what each of us cares about. Where do they meet — and where is the gap?"},
    {"title":"Line of sight","type":"canvas","minutes":14,"prompt":"Map our work to the outcomes it drives — activity → result → who it serves. Where does the line break?"},
    {"title":"Commit & schedule the re-measure","type":"outcome","minutes":10,"prompt":"Turn today into owned, dated commitments and schedule the follow-up pulse to re-measure the shift."}
  ]}
  $json$::jsonb
where not exists (select 1 from public.template where key = 'aristotle-follow-up' and workspace_id is null);
