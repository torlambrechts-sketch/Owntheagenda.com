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
  scores: SectionScore[]; // empty when masked / no responses yet
  overall: number | null; // overall mean on the instrument scale
  lowestLabel: string | null;
  belowCount: number;
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
      scores,
      overall: overall == null ? null : Math.round(overall * 100) / 100,
      lowestLabel,
      belowCount,
    },
  };
}
