-- =====================================================================
-- OwnTheAgenda · Project Aristotle — one workshop that mirrors the assessment
-- ---------------------------------------------------------------------
-- Consolidates the Aristotle workshop offering into a SINGLE, team-agnostic
-- system template, divided into one section per pillar. Each pillar section
-- opens by walking the exact statements the team rated in the assessment
-- (so the workshop mirrors the instrument), then works that pillar. Bracketed
-- by a grounding review of all five scores and a commitment + re-measure close.
--
-- The five standalone per-pillar module templates are removed from the
-- browsable library (their intervention_module rows remain — the diagnostic
-- generator still composes a deficit-tailored subset from them).
-- =====================================================================

-- Retire the five standalone module *templates* from the library (keep the
-- intervention_module rows that drive tailored generation).
delete from public.template
where workspace_id is null
  and key in ('mod_safety_to_speak','mod_reliable_by_design','mod_lanes_and_decisions',
              'mod_why_this_matters','mod_line_of_sight');

-- One workshop for the whole assessment. Upsert by key (replaces the earlier
-- thin follow-up template).
update public.template set
  name = 'Project Aristotle — Team Workshop',
  category = 'team',
  source = 'OwnTheAgenda · grounded in Google re:Work, "Project Aristotle"',
  default_duration = 150,
  description = 'One workshop across all five Aristotle pillars, sectioned pillar by pillar. Each section reviews the exact statements the team rated, then works that pillar — psychological safety, dependability, structure & clarity, meaning and impact.',
  definition = $json$
  {"phases":[
    {"title":"Where we stand — the Aristotle read","type":"assess","minutes":10,"prompt":"Review the team's scores across all five pillars. Which land true? Which surprised us? We'll work each pillar in turn.","config":{"timing":"live","section":"Open"}},

    {"title":"Psychological safety — review the read","type":"discuss","minutes":12,"dynamic":"psych_safety","prompt":"This pillar measured risk tolerance, candor, error response and inclusion. The statements you rated: (1) It is safe to take a risk on this team; (2) I can raise problems and tough issues with this team; (3) When I make a mistake on this team, it is not held against me; (4) My unique skills and perspective are valued and drawn on by this team; (5, reversed) People on this team would think less of me if I admitted I did not know something; (6, reversed) It is difficult to ask other members of this team for help. Where is the read right, and where is it off?","config":{"section":"Psychological safety","subareas":["risk_tolerance","candor","error_response","inclusion"]}},
    {"title":"Make it safer","type":"feedback","minutes":14,"dynamic":"psych_safety","prompt":"What would make it safer to speak up, disagree and admit mistakes here? Then agree two norms that protect candor.","config":{"section":"Psychological safety","lanes":["Start doing","Stop doing","Leaders model"]}},

    {"title":"Dependability — review the read","type":"discuss","minutes":12,"prompt":"This pillar measured follow-through, quality bar, accountability and mutual reliance. The statements you rated: (1) When members of this team say they will do something, they follow through; (2) This team consistently delivers work that meets the quality bar we have agreed; (3) Members of this team hold each other accountable for our commitments; (4) I can count on my teammates to do their share of the work; (5, reversed) I often have to chase teammates to get their part of the work done; (6, reversed) Work on this team frequently has to be redone because it was not done right the first time. Where is the read right, and where is it off?","config":{"section":"Dependability","subareas":["follow_through","quality_bar","accountability","mutual_reliance"]}},
    {"title":"Reliable by design","type":"discuss","minutes":14,"prompt":"Agree what 'done' means here, and how we make and track commitments so nothing needs chasing. Name one accountability practice to adopt.","config":{"section":"Dependability","capture":"commitments"}},

    {"title":"Structure & clarity — review the read","type":"discuss","minutes":12,"prompt":"This pillar measured role clarity, goal clarity, decision rights and process predictability. The statements you rated: (1) I have a clear understanding of my role and responsibilities on this team; (2) This team has clear goals that I can articulate; (3) It is clear who has the authority to make which decisions on this team; (4) Our processes for getting work done are clear and predictable; (5, reversed) There is confusion or overlap about who owns what on this team; (6, reversed) I am often unsure what this team is actually trying to achieve. Where is the read right, and where is it off?","config":{"section":"Structure & clarity","subareas":["role_clarity","goal_clarity","decision_rights","process_predictability"]}},
    {"title":"Lanes & decisions","type":"charter","minutes":16,"dynamic":"role_clarity","prompt":"Map each key responsibility to a single owner and agree who decides what (RAPID/RACI). Name the gaps and the overlaps.","config":{"section":"Structure & clarity","charterSection":"roles"}},

    {"title":"Meaning — review the read","type":"discuss","minutes":12,"prompt":"This pillar measured personal resonance, purpose alignment, growth and recognition. The statements you rated: (1) The work I do for this team is personally meaningful to me; (2) My personal values are aligned with the purpose of this team's work; (3) Being on this team helps me learn and grow in ways I care about; (4) The contributions I make to this team are genuinely valued; (5, reversed) Most of my work here feels like I am just going through the motions; (6, reversed) The effort I put into this team largely goes unnoticed. Where is the read right, and where is it off?","config":{"section":"Meaning","subareas":["personal_resonance","purpose_alignment","growth","recognition"]}},
    {"title":"Why this matters","type":"discuss","minutes":12,"prompt":"Connect our work to the mission and to what each of us cares about — where do they meet, and where is the gap? Recognise a contribution that deserves it.","config":{"section":"Meaning"}},

    {"title":"Impact — review the read","type":"discuss","minutes":12,"prompt":"This pillar measured significance, line of sight, efficacy and visible outcomes. The statements you rated: (1) The work of this team makes a real difference to the organisation; (2) I can clearly see how my work connects to outcomes that matter; (3) I believe the work we do here actually creates the impact we intend; (4) We can point to concrete results that this team has produced; (5, reversed) It is hard to tell whether the work I do here actually matters; (6, reversed) A lot of what this team produces ends up having little real effect. Where is the read right, and where is it off?","config":{"section":"Impact","subareas":["significance","line_of_sight","efficacy","visible_outcomes"]}},
    {"title":"Line of sight","type":"canvas","minutes":14,"prompt":"Map our work to the outcomes it drives — activity then result then who it serves. Where does the line break? Choose 1–2 outcomes to make visible on a cadence.","config":{"section":"Impact"}},

    {"title":"Commit & schedule the re-measure","type":"outcome","minutes":10,"prompt":"Turn today into owned, dated commitments across the pillars we worked, and schedule the follow-up Aristotle pulse to re-measure the shift.","config":{"section":"Close"}}
  ]}
  $json$::jsonb
where key = 'aristotle-follow-up' and workspace_id is null;
