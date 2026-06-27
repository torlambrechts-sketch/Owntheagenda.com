-- =====================================================================
-- OwnTheAgenda · Project Aristotle — team assessment instrument
-- ---------------------------------------------------------------------
-- Google's re:Work "Project Aristotle" five keys to an effective team,
-- operationalised as a single team-scoped pulse. One instrument, five
-- dimensions (the pillars), six construct-isolated items each (30 total),
-- two reverse-keyed items per pillar to detect acquiescence bias.
--
-- PSYCHOMETRIC CONTRACT (enforced by 20260624121500_aristotle_validate.sql):
--   * Construct isolation — every item maps to exactly one pillar and one
--     named sub-area; no double-barreled phrasing.
--   * Balance — 6 items per pillar (equal statistical weight), 2 reverse.
--   * Scale — 1–5 Likert. The composite engine is scale-agnostic
--     (normalizes over [min,max]); reverse items are reflected across the
--     midpoint by private.survey_composite (now reverse-aware) and by the
--     client scorer (lib/survey.dimensionMeans).
--
-- ARCHITECTURE: this is pure data. The row drops into the existing
-- assessment_template catalog; the delivery engine renders `items`, maps
-- responses onto the dynamic schema, and hands raw scores to the scorer.
-- No UI or application code is touched to ship the framework.
--
-- Pillar order follows Aristotle's empirical importance ranking, with
-- Psychological Safety as the foundation (and the climate-strength read).
-- =====================================================================

insert into public.assessment_template (workspace_id, key, name, category, scope, source, description, definition)
select null, 'aristotle_team', 'Project Aristotle — Team Effectiveness', 'team_effectiveness', 'team',
  'Grounded in Google re:Work, "Project Aristotle" (Rozovsky, 2015); psychological-safety items after Edmondson (1999)',
  'The five keys to an effective team — psychological safety, dependability, structure & clarity, meaning and impact — as one balanced, reverse-scored pulse.',
  $j${
    "framework": "project_aristotle",
    "likert": 5,
    "scale": { "min": 1, "max": 5, "minLabel": "Strongly disagree", "midLabel": "Neither agree nor disagree", "maxLabel": "Strongly agree" },
    "strengthDimension": "psych_safety",
    "dimensions": [
      { "key": "psych_safety",      "label": "Psychological safety",  "blurb": "Can we take interpersonal risks — speak up, admit mistakes, ask for help — without fear?", "subareas": ["risk_tolerance","candor","error_response","inclusion"] },
      { "key": "dependability",     "label": "Dependability",         "blurb": "Do we reliably get quality work done, on time, and hold each other to our commitments?", "subareas": ["follow_through","quality_bar","accountability","mutual_reliance"] },
      { "key": "structure_clarity", "label": "Structure & clarity",   "blurb": "Are roles, goals, decision rights and processes clear and predictable?", "subareas": ["role_clarity","goal_clarity","decision_rights","process_predictability"] },
      { "key": "meaning",           "label": "Meaning",               "blurb": "Is the work personally meaningful, and does it connect to what we care about?", "subareas": ["personal_resonance","purpose_alignment","growth","recognition"] },
      { "key": "impact",            "label": "Impact",                "blurb": "Do we believe our work matters and can we see it making a difference?", "subareas": ["significance","line_of_sight","efficacy","visible_outcomes"] }
    ],
    "items": [
      { "key": "ps_1", "dimension": "psych_safety", "subarea": "risk_tolerance", "text": "It is safe to take a risk on this team." },
      { "key": "ps_2", "dimension": "psych_safety", "subarea": "candor",         "text": "I can raise problems and tough issues with this team." },
      { "key": "ps_3", "dimension": "psych_safety", "subarea": "error_response", "text": "When I make a mistake on this team, it is not held against me." },
      { "key": "ps_4", "dimension": "psych_safety", "subarea": "inclusion",      "text": "My unique skills and perspective are valued and drawn on by this team." },
      { "key": "ps_5", "dimension": "psych_safety", "subarea": "risk_tolerance", "text": "People on this team would think less of me if I admitted I did not know something.", "reverse": true },
      { "key": "ps_6", "dimension": "psych_safety", "subarea": "candor",         "text": "It is difficult to ask other members of this team for help.", "reverse": true },

      { "key": "dep_1", "dimension": "dependability", "subarea": "follow_through",  "text": "When members of this team say they will do something, they follow through." },
      { "key": "dep_2", "dimension": "dependability", "subarea": "quality_bar",     "text": "This team consistently delivers work that meets the quality bar we have agreed." },
      { "key": "dep_3", "dimension": "dependability", "subarea": "accountability",  "text": "Members of this team hold each other accountable for our commitments." },
      { "key": "dep_4", "dimension": "dependability", "subarea": "mutual_reliance", "text": "I can count on my teammates to do their share of the work." },
      { "key": "dep_5", "dimension": "dependability", "subarea": "follow_through",  "text": "I often have to chase teammates to get their part of the work done.", "reverse": true },
      { "key": "dep_6", "dimension": "dependability", "subarea": "quality_bar",     "text": "Work on this team frequently has to be redone because it was not done right the first time.", "reverse": true },

      { "key": "sc_1", "dimension": "structure_clarity", "subarea": "role_clarity",            "text": "I have a clear understanding of my role and responsibilities on this team." },
      { "key": "sc_2", "dimension": "structure_clarity", "subarea": "goal_clarity",            "text": "This team has clear goals that I can articulate." },
      { "key": "sc_3", "dimension": "structure_clarity", "subarea": "decision_rights",         "text": "It is clear who has the authority to make which decisions on this team." },
      { "key": "sc_4", "dimension": "structure_clarity", "subarea": "process_predictability",  "text": "Our processes for getting work done are clear and predictable." },
      { "key": "sc_5", "dimension": "structure_clarity", "subarea": "role_clarity",            "text": "There is confusion or overlap about who owns what on this team.", "reverse": true },
      { "key": "sc_6", "dimension": "structure_clarity", "subarea": "goal_clarity",            "text": "I am often unsure what this team is actually trying to achieve.", "reverse": true },

      { "key": "mn_1", "dimension": "meaning", "subarea": "personal_resonance", "text": "The work I do for this team is personally meaningful to me." },
      { "key": "mn_2", "dimension": "meaning", "subarea": "purpose_alignment",  "text": "My personal values are aligned with the purpose of this team's work." },
      { "key": "mn_3", "dimension": "meaning", "subarea": "growth",             "text": "Being on this team helps me learn and grow in ways I care about." },
      { "key": "mn_4", "dimension": "meaning", "subarea": "recognition",        "text": "The contributions I make to this team are genuinely valued." },
      { "key": "mn_5", "dimension": "meaning", "subarea": "personal_resonance", "text": "Most of my work here feels like I am just going through the motions.", "reverse": true },
      { "key": "mn_6", "dimension": "meaning", "subarea": "recognition",        "text": "The effort I put into this team largely goes unnoticed.", "reverse": true },

      { "key": "im_1", "dimension": "impact", "subarea": "significance",     "text": "The work of this team makes a real difference to the organisation." },
      { "key": "im_2", "dimension": "impact", "subarea": "line_of_sight",    "text": "I can clearly see how my work connects to outcomes that matter." },
      { "key": "im_3", "dimension": "impact", "subarea": "efficacy",         "text": "I believe the work we do here actually creates the impact we intend." },
      { "key": "im_4", "dimension": "impact", "subarea": "visible_outcomes", "text": "We can point to concrete results that this team has produced." },
      { "key": "im_5", "dimension": "impact", "subarea": "line_of_sight",    "text": "It is hard to tell whether the work I do here actually matters.", "reverse": true },
      { "key": "im_6", "dimension": "impact", "subarea": "efficacy",         "text": "A lot of what this team produces ends up having little real effect.", "reverse": true }
    ]
  }$j$::jsonb
where not exists (select 1 from public.assessment_template where workspace_id is null and key = 'aristotle_team');

-- ----- authored per-pillar report copy (global reference, like dynamic_band) ----
-- definition / advantages (when high) / risks (when low) / recognisable statements.
insert into public.assessment_trait_copy (template_key, dimension_key, definition, advantages, risks, statements) values
('aristotle_team','psych_safety',
 'Whether people can take interpersonal risks — speak up, disagree, admit mistakes and ask for help — without fear of being judged or punished.',
 array['Problems and bad news surface early, while they are still cheap to fix','Dissent and quiet voices reach the table, so decisions are better stress-tested'],
 array['Low safety hides risk until it is expensive, and silences the people closest to the work','Mistakes get concealed rather than learned from, repeating the same failures'],
 array['It is safe to take a risk on this team','I can raise tough issues without it being held against me']),
('aristotle_team','dependability',
 'Whether team members reliably get quality work done on time and hold one another to their commitments.',
 array['Commitments hold, so the team can plan and the load is shared fairly','A shared quality bar means work rarely has to be redone'],
 array['When follow-through slips, trust erodes and a few people quietly carry the team','Missed handoffs and rework cascade into missed deadlines'],
 array['When people here say they will do something, they follow through','I can count on my teammates to do their share']),
('aristotle_team','structure_clarity',
 'Whether roles, goals, decision rights and processes are clear and predictable — a structural property of how the team is set up, not a measure of trust.',
 array['Clear lanes and decision rights remove friction and duplicated effort','Articulable goals let everyone prioritise the same work'],
 array['Ambiguity about who owns what stalls decisions and creates overlap or gaps','Unclear goals scatter effort across work that does not matter'],
 array['I have a clear understanding of my role and responsibilities','It is clear who has the authority to make which decisions']),
('aristotle_team','meaning',
 'Whether the work is personally meaningful to members and connects to what they care about — a felt, individual sense of purpose.',
 array['Personal resonance fuels discretionary effort and resilience under pressure','People grow and feel recognised, so engagement compounds'],
 array['Without meaning, work becomes going-through-the-motions and effort drops','Low recognition shows up later as disengagement and turnover'],
 array['The work I do here is personally meaningful to me','The contributions I make are genuinely valued']),
('aristotle_team','impact',
 'Whether members believe their work matters and can see it producing results that make a difference.',
 array['A clear line of sight to outcomes keeps effort aimed at what counts','Belief in efficacy sustains motivation and a results focus'],
 array['When impact is invisible, motivation drains and effort scatters','Doubt that the work matters quietly lowers the bar on everything'],
 array['I can see how my work connects to outcomes that matter','We can point to concrete results this team has produced'])
on conflict (template_key, dimension_key) do nothing;
