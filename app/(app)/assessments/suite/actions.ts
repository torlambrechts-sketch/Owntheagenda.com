"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveInstrument } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys } from "@/lib/survey";

// Lazy per-assessment detail loader. The Overview lists every assessment cheaply
// (one query); the rich section-scoring is only resolved when a row is opened,
// so we never run the per-survey RPC loop across the whole list.
export type SectionScore = { key: string; label: string; blurb: string; mean: number; pct: number; band: 0 | 1 | 2 };
export type DetailQuestion = { key: string; dimension: string; text: string };
export type AssessmentDetail = {
  surveyId: string;
  instrumentName: string;
  scale: { min: number; max: number; minLabel: string; maxLabel: string };
  description: string | null;
  source: string | null;
  questions: DetailQuestion[];
  sections: { key: string; label: string; count: number }[];
  respondents: number;
  masked: boolean;
  submissions: string[]; // anonymous submission timestamps (only when unmasked)
  scores: SectionScore[]; // empty when masked / no responses yet
  overall: number | null; // overall mean on the instrument scale
  lowestLabel: string | null;
  belowCount: number;
  linkedWorkshop: { id: string; title: string } | null; // a workshop carrying this survey
  activity: { id: number; label: string; actor: string; at: string }[]; // audit events (admins)
};

// Human labels for the assessment audit actions.
const ACTION_LABEL: Record<string, string> = {
  "assessment.opened": "Assessment opened",
  "assessment.closed": "Assessment closed",
  "assessment.reminded": "Reminder sent",
};

// Generalised banding by position on the instrument's scale. The design's hard
// 3.0/1–5 threshold becomes a scale-relative band so it works for 1–7 (the
// leadership-team instruments) as well as 1–5.
function bandOf(pct: number): 0 | 1 | 2 {
  return pct < 45 ? 0 : pct < 62 ? 1 : 2;
}

export async function loadAssessmentDetail(surveyId: string): Promise<{ error?: string; detail?: AssessmentDetail }> {
  const supabase = createClient();
  const { data: survey } = await supabase
    .from("survey")
    .select("id, kind, status")
    .eq("id", surveyId)
    .single();
  if (!survey) return { error: "Assessment not found." };

  const inst = await resolveInstrument(survey.kind as string);
  if (!inst) return { error: "Instrument definition is unavailable." };

  const { min, max } = inst.scale;
  const questions: DetailQuestion[] = inst.items.map((it) => ({ key: it.key, dimension: it.dimension, text: it.text }));
  const sections = inst.dimensions.map((d) => ({
    key: d.key,
    label: d.label,
    count: inst.items.filter((it) => it.dimension === d.key).length,
  }));

  // Aggregate results — masked server-side until the minimum responder count is
  // met, so individual answers are never exposed.
  const { data: res } = await supabase.rpc("survey_results", { p_survey: surveyId, p_strength_items: strengthItemKeys(inst) });
  const r = res as { respondents: number; masked: boolean; items: { item_key: string; mean: number; n: number }[] } | null;

  // Anonymous submission timestamps — surfaced only once results are unmasked,
  // so a small response set can't be tied back to an individual. respondent_id
  // is never read here.
  let submissions: string[] = [];
  if (r && !r.masked) {
    const { data: subs } = await supabase
      .from("survey_response")
      .select("created_at")
      .eq("survey_id", surveyId)
      .order("created_at", { ascending: false });
    submissions = (subs ?? []).map((s) => s.created_at as string);
  }

  let scores: SectionScore[] = [];
  let overall: number | null = null;
  let lowestLabel: string | null = null;
  let belowCount = 0;
  if (r && !r.masked) {
    const dims = dimensionMeans(inst, r.items ?? []);
    scores = dims
      .filter((d): d is { key: string; label: string; blurb: string; mean: number } => d.mean != null)
      .map((d) => {
        const pct = ((d.mean - min) / (max - min)) * 100;
        return { key: d.key, label: d.label, blurb: d.blurb, mean: d.mean, pct, band: bandOf(pct) };
      });
    if (scores.length) {
      overall = scores.reduce((a, s) => a + s.mean, 0) / scores.length;
      const lowest = scores.reduce((lo, s) => (s.mean < lo.mean ? s : lo), scores[0]);
      lowestLabel = lowest.label;
      belowCount = scores.filter((s) => s.band === 0).length;
    }
  }

  // A workshop carrying this survey (the flow engine pins it on a step's
  // survey_id) — lets the assessment link straight to its follow-up workshop.
  let linkedWorkshop: { id: string; title: string } | null = null;
  const { data: linkBlock } = await supabase
    .from("block")
    .select("workshop_id")
    .eq("survey_id", surveyId)
    .limit(1)
    .maybeSingle();
  if (linkBlock?.workshop_id) {
    const { data: ws } = await supabase
      .from("workshop")
      .select("id, title")
      .eq("id", linkBlock.workshop_id)
      .maybeSingle();
    if (ws) linkedWorkshop = { id: ws.id as string, title: ws.title as string };
  }

  // Activity log for this assessment — audit_log is readable by workspace
  // admins via RLS, so non-admins simply get an empty list.
  const { data: events } = await supabase
    .from("audit_log")
    .select("id, action, actor_id, created_at")
    .eq("entity_type", "survey")
    .eq("entity_id", surveyId)
    .order("created_at", { ascending: false })
    .limit(20);
  const actorIds = Array.from(new Set((events ?? []).map((e) => e.actor_id).filter((x): x is string => !!x)));
  const { data: profs } = actorIds.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Someone"]));
  const activity = (events ?? []).map((e) => ({
    id: e.id as number,
    label: ACTION_LABEL[e.action as string] ?? (e.action as string),
    actor: e.actor_id ? nameById.get(e.actor_id as string) ?? "Someone" : "System",
    at: e.created_at as string,
  }));

  return {
    detail: {
      surveyId,
      instrumentName: inst.name,
      scale: inst.scale,
      description: null,
      source: null,
      questions,
      sections,
      respondents: r?.respondents ?? 0,
      masked: r ? r.masked : true,
      submissions,
      scores,
      overall: overall == null ? null : Math.round(overall * 100) / 100,
      lowestLabel,
      belowCount,
      linkedWorkshop,
      activity,
    },
  };
}
