// Plays — curated, one-click recipes that run the assess → collect → workshop
// Flow with a sensible workshop already chosen. A Play is just a Flow with a
// named outcome and a pre-selected workshop template, so non-experts pick a
// goal instead of assembling steps. The workshop is auto-built from
// `workshopTemplateKey` the moment the response threshold is met.
//
// `workshopTemplateKey` must match a seeded template key (see
// supabase/migrations/*_seed_templates.sql). `focusDynamic` seeds a sensible
// default for branch conditions in the Flow Builder. `assessmentKind` is the
// team instrument the Play opens (a survey) — see the team-scope rows in
// public.assessment_template.

export type Play = {
  key: string;
  name: string;
  blurb: string;
  workshopTemplateKey: string;
  workshopName: string;
  assessmentKind: string;
  focusDynamic: "psych_safety" | "trust" | "conflict_norms" | "role_clarity" | "decision_rights";
  minResponses: number;
};

export const PLAYS: Play[] = [
  {
    key: "psych_safety_tuneup",
    name: "Psychological Safety Tune-up",
    blurb:
      "Pulse the team on safety and behavioural integration, then run a health workshop on what the responses surface.",
    workshopTemplateKey: "health",
    workshopName: "Team Health Monitor",
    assessmentKind: "psych_safety_bang",
    focusDynamic: "psych_safety",
    minResponses: 4,
  },
  {
    key: "team_effectiveness_sprint",
    name: "Team Effectiveness Sprint",
    blurb:
      "Measure how the team performs and decides, then run a Start / Stop / Continue retro to commit to changes.",
    workshopTemplateKey: "ssc",
    workshopName: "Start / Stop / Continue",
    assessmentKind: "team_effectiveness_bang",
    focusDynamic: "decision_rights",
    minResponses: 4,
  },
  {
    key: "clear_the_air_retro",
    name: "Clear-the-Air Retro",
    blurb:
      "Surface trust and conflict norms with a quick pulse, then sail the Sailboat retro to name what holds the team back.",
    workshopTemplateKey: "sailboat",
    workshopName: "Sailboat retrospective",
    assessmentKind: "team_learning_edmondson",
    focusDynamic: "trust",
    minResponses: 4,
  },
  {
    key: "role_clarity_reset",
    name: "Role Clarity Reset",
    blurb:
      "Check role clarity and decision rights, then prioritise the fixes on an Impact / Effort matrix.",
    workshopTemplateKey: "impact",
    workshopName: "Impact / Effort matrix",
    assessmentKind: "team_performance",
    focusDynamic: "role_clarity",
    minResponses: 4,
  },
];

export const PLAY_BY_KEY: Record<string, Play> = Object.fromEntries(PLAYS.map((p) => [p.key, p]));
