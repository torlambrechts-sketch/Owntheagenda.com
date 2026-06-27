// Typed client surface for the Project Aristotle diagnostic.
//
// The psychometric content — items, thresholds, structural-failure copy and
// the pillar→module map — lives in the database (assessment_template,
// diagnostic_rule, intervention_module, dimension_intervention) and is
// computed by the public.aristotle_diagnostic() RPC. This module only TYPES
// that payload and provides presentational helpers (band → tone/label). It
// deliberately hardcodes no rules, so tuning a threshold or rewording a
// failure is a data change, never a deploy.

import { createClient } from "@/lib/supabase/client";

export const ARISTOTLE_KIND = "aristotle_team";

export const ARISTOTLE_PILLARS = [
  "psych_safety",
  "dependability",
  "structure_clarity",
  "meaning",
  "impact",
] as const;
export type AristotlePillar = (typeof ARISTOTLE_PILLARS)[number];

// Banding mirrors public.aristotle_diagnostic: critical < deficit < moderate < strong.
export type PillarBand = "critical" | "deficit" | "moderate" | "strong" | "no_data";

export type PillarResult = {
  pillar: AristotlePillar;
  label: string;
  mean: number | null; // raw, reverse-corrected Likert mean (1–5)
  pct: number | null; // mean normalized to 0–100
  band: PillarBand;
  flagged: boolean; // mean below the structural-failure trigger
  severity: 0 | 1 | 2; // 0 ok · 1 deficit · 2 critical
  failure_mode: string | null;
  failure_label: string | null;
  structural_flag: string | null; // stable constant, e.g. STRUCTURE_ROLE_DEFINITION_FAILURE
  narrative: string | null;
  thresholds: { critical_at: number; trigger_at: number; strong_at: number };
};

export type RecommendedModule = {
  module: string; // intervention_module.key
  name: string;
  summary: string | null;
  minutes: number;
  targets: string[]; // pillar labels this module remediates
};

export type WorkshopSpecPhase = {
  title: string;
  type: string; // activity_type
  minutes: number;
  prompt?: string;
  dynamic?: string;
  config?: Record<string, unknown>;
};

export type GeneratedWorkshopSpec = {
  title: string;
  generated_from: string[];
  total_minutes: number;
  phases: WorkshopSpecPhase[];
};

export type AristotleDiagnostic = {
  survey: string;
  framework: "project_aristotle";
  respondents: number;
  masked: boolean; // true when < 3 respondents (privacy floor)
  scale_min: number;
  scale_max: number;
  pillars: PillarResult[];
  recommended_modules: RecommendedModule[];
  workshop_spec: GeneratedWorkshopSpec | null; // null when no pillar is flagged
};

// Presentational mapping only — no psychometric judgement lives here.
export function bandTone(band: PillarBand): "strong" | "moderate" | "deficit" | "critical" | "muted" {
  switch (band) {
    case "strong": return "strong";
    case "moderate": return "moderate";
    case "deficit": return "deficit";
    case "critical": return "critical";
    default: return "muted";
  }
}

export function bandLabel(band: PillarBand): string {
  switch (band) {
    case "strong": return "Strong";
    case "moderate": return "Moderate";
    case "deficit": return "Needs work";
    case "critical": return "Critical";
    default: return "No data";
  }
}

// Flagged pillars, most severe first — the team's structural deficits.
export function structuralFailures(diag: AristotleDiagnostic): PillarResult[] {
  return diag.pillars
    .filter((p) => p.flagged)
    .sort((a, b) => b.severity - a.severity);
}

// Run the diagnostic for a closed Aristotle survey.
export async function fetchAristotleDiagnostic(surveyId: string): Promise<AristotleDiagnostic | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("aristotle_diagnostic", { p_survey: surveyId });
  if (error || !data) return null;
  return data as AristotleDiagnostic;
}

// Materialise the generated, deficit-tailored workshop. Returns the new
// workshop id, or null on failure.
export async function buildWorkshopFromDiagnostic(
  teamId: string,
  surveyId: string,
  title?: string,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_workshop_from_diagnostic", {
    p_team: teamId,
    p_survey: surveyId,
    p_title: title,
  });
  if (error || !data) return null;
  return (data as { id: string }).id;
}
