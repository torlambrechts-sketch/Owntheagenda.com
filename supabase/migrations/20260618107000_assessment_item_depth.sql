-- =====================================================================
-- Item depth + reverse scoring for the individual catalog instruments
-- ---------------------------------------------------------------------
-- Closes the "thin instrument" gap: Working Style and Strengths Snapshot
-- go from 2 to 4 items per dimension, each dimension gaining one
-- reverse-keyed item ("reverse": true) to blunt acquiescence bias. Scoring
-- flips reverse items onto the dimension pole before averaging
-- (lib/survey.dimensionMeans + AssessmentLibrary.scoreFrom). These
-- instruments are scored entirely client-side, so the server composite /
-- benchmark path is unaffected — reverse keys stay off team instruments
-- until private.survey_composite is made reverse-aware.
--
-- Working Style's "focus" dimension is re-grounded on concentration/depth
-- (matching its authored trait copy and the "Focus" label); its two old
-- big-picture items are replaced with fresh keys (foc_*) so prior responses
-- are dropped from the new construct rather than silently reinterpreted.
-- =====================================================================

update public.assessment_template
set definition = $json${
  "scale": { "min": 1, "max": 7, "minLabel": "Strongly disagree", "maxLabel": "Strongly agree" },
  "dimensions": [
    { "key": "structure", "label": "Structure", "blurb": "Plan and process vs. improvise and adapt." },
    { "key": "pace", "label": "Pace", "blurb": "Act fast vs. deliberate." },
    { "key": "focus", "label": "Focus", "blurb": "Deep, single-task focus vs. ranging broadly." },
    { "key": "social", "label": "Social energy", "blurb": "Energised by people vs. solo focus." }
  ],
  "items": [
    { "key": "structure_1", "dimension": "structure", "text": "I plan my work in detail before starting." },
    { "key": "structure_2", "dimension": "structure", "text": "I prefer clear structure and defined process." },
    { "key": "structure_3", "dimension": "structure", "text": "I keep my commitments organised and visible." },
    { "key": "structure_4", "dimension": "structure", "text": "I'd rather improvise than work to a fixed plan.", "reverse": true },
    { "key": "pace_1", "dimension": "pace", "text": "I make decisions quickly and adjust as I go." },
    { "key": "pace_2", "dimension": "pace", "text": "I'd rather act now than wait for more information." },
    { "key": "pace_3", "dimension": "pace", "text": "I get impatient when work moves slowly." },
    { "key": "pace_4", "dimension": "pace", "text": "I prefer to wait until I'm certain before deciding.", "reverse": true },
    { "key": "foc_1", "dimension": "focus", "text": "I prefer to finish one thing before starting another." },
    { "key": "foc_2", "dimension": "focus", "text": "I can concentrate deeply without getting distracted." },
    { "key": "foc_3", "dimension": "focus", "text": "I notice details that others miss." },
    { "key": "foc_4", "dimension": "focus", "text": "I like juggling several different things at once.", "reverse": true },
    { "key": "social_1", "dimension": "social", "text": "I get energy from working closely with others." },
    { "key": "social_2", "dimension": "social", "text": "I think best by talking things through with people." },
    { "key": "social_3", "dimension": "social", "text": "I seek out other people when I'm working on something." },
    { "key": "social_4", "dimension": "social", "text": "I do my best work alone and undisturbed.", "reverse": true }
  ]
}$json$::jsonb
where key = 'working_style';

update public.assessment_template
set definition = $json${
  "scale": { "min": 1, "max": 7, "minLabel": "Strongly disagree", "maxLabel": "Strongly agree" },
  "dimensions": [
    { "key": "executing", "label": "Executing", "blurb": "Getting things done and following through." },
    { "key": "influencing", "label": "Influencing", "blurb": "Speaking up, persuading, taking charge." },
    { "key": "relating", "label": "Relating", "blurb": "Building trust and reading people." },
    { "key": "thinking", "label": "Thinking", "blurb": "Analysis, ideas, strategy." }
  ],
  "items": [
    { "key": "exec_1", "dimension": "executing", "text": "I'm great at getting things done and following through." },
    { "key": "exec_2", "dimension": "executing", "text": "I bring discipline and reliability to a team." },
    { "key": "exec_3", "dimension": "executing", "text": "I feel best once I've finished what I set out to do." },
    { "key": "exec_4", "dimension": "executing", "text": "I often lose momentum before a task is finished.", "reverse": true },
    { "key": "infl_1", "dimension": "influencing", "text": "I'm comfortable speaking up and persuading others." },
    { "key": "infl_2", "dimension": "influencing", "text": "I naturally take charge when direction is needed." },
    { "key": "infl_3", "dimension": "influencing", "text": "I enjoy convincing people of a direction." },
    { "key": "infl_4", "dimension": "influencing", "text": "I tend to hold back rather than push my view.", "reverse": true },
    { "key": "rel_1", "dimension": "relating", "text": "I build strong, trusting relationships easily." },
    { "key": "rel_2", "dimension": "relating", "text": "I'm attuned to how others are feeling." },
    { "key": "rel_3", "dimension": "relating", "text": "I invest in the people I work with." },
    { "key": "rel_4", "dimension": "relating", "text": "I find it hard to read how others are feeling.", "reverse": true },
    { "key": "think_1", "dimension": "thinking", "text": "I love analysing problems and finding patterns." },
    { "key": "think_2", "dimension": "thinking", "text": "I bring ideas and strategic thinking." },
    { "key": "think_3", "dimension": "thinking", "text": "I like to understand why before I act." },
    { "key": "think_4", "dimension": "thinking", "text": "I prefer to act rather than analyse.", "reverse": true }
  ]
}$json$::jsonb
where key = 'strengths_snapshot';
