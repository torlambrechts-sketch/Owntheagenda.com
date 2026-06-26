"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveInstrument } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys, climateStrength, instrumentFromRow } from "@/lib/survey";

// Lazy per-assessment detail for the Insights "By assessment" tab. The Overview
// lists every assessment cheaply; the rich per-section scoring + trend is only
// resolved when an assessment is selected, so the page never runs the
// per-survey RPC loop across the whole workspace up front.
//
// Banding mirrors the rest of the app: a scale-relative target floor so it
// works for 1–5 and 1–7 instruments alike. All numbers are masked server-side
// under the min-responder floor and render as "—" when hidden.

const TARGET_LOW_PCT = 45;
function bandOf(pct: number): 0 | 1 | 2 {
  return pct < TARGET_LOW_PCT ? 0 : pct < 62 ? 1 : 2;
}

export type SectionScoreVM = {
  key: string;
  label: string;
  pct: number; // 0–100 position on the instrument scale
  mean: number; // raw mean on the instrument scale
  targetLow: number; // band floor as a % of the scale
  band: 0 | 1 | 2;
};

export type AssessmentTrendPoint = { l: string; v: number };

export type AssessmentDetailVM = {
  surveyId: string;
  name: string;
  instrumentName: string;
  overallPct: number | null; // 0–100 composite, null when masked
  respondents: number;
  invited: number | null;
  participationPct: number | null;
  belowCount: number;
  sectionCount: number;
  lastReviewed: string | null; // closed_at / created_at ISO
  masked: boolean;
  sections: SectionScoreVM[];
  trend: AssessmentTrendPoint[];
  // Climate-strength → the "Human note" card copy.
  note: { label: string; tone: "aligned" | "mixed" | "split"; copy: string } | null;
};

type SurveyResults = {
  respondents: number;
  masked: boolean;
  items: { item_key: string; mean: number; n: number }[];
  strength_sd: number | null;
  composite: number | null;
};

// Short cycle label for the score-over-time axis (e.g. "Mar", "Q2").
function cycleLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Human-note copy from the climate-strength read — how much the team agrees on
// how it scores. Grounded in the Fyhn/Bang climate-strength signal.
function strengthCopy(tone: "aligned" | "mixed" | "split"): string {
  if (tone === "aligned")
    return "Responses are tightly aligned — people experience this team similarly, so the section scores reflect a shared reality rather than a split of opinion.";
  if (tone === "mixed")
    return "Responses are mixed — there is some spread in how people experience this team, so read the section scores as a centre of gravity, not a consensus.";
  return "Responses are split — people experience this team very differently. The averages hide real disagreement; the spread itself is worth a conversation.";
}

export async function assessmentDetail(surveyId: string): Promise<{ error?: string; detail?: AssessmentDetailVM }> {
  const supabase = createClient();

  const { data: survey } = await supabase
    .from("survey")
    .select("id, name, kind, status, team_id, created_at, closed_at, definition")
    .eq("id", surveyId)
    .maybeSingle();
  if (!survey) return { error: "Assessment not found." };

  // Prefer the survey's frozen definition snapshot (a custom/edited instrument
  // shows its own questions), falling back to the live catalog by kind.
  const inst =
    instrumentFromRow({ key: survey.kind as string, name: (survey.name ?? survey.kind) as string, definition: survey.definition }) ??
    (await resolveInstrument(survey.kind as string));
  if (!inst) return { error: "Instrument definition is unavailable." };
  const { min, max } = inst.scale;
  const strengthItems = strengthItemKeys(inst);

  // Response-rate denominator: distinct members across the survey's targeted
  // teams + external invites (matches assessment_suite_overview / the suite
  // detail loader).
  let invited: number | null = null;
  {
    const { data: stTeams } = await supabase.from("survey_team").select("team_id").eq("survey_id", surveyId);
    const teamIds = Array.from(
      new Set([survey.team_id as string | null, ...((stTeams ?? []).map((r) => r.team_id as string))].filter((x): x is string => !!x)),
    );
    let memberCount = 0;
    if (teamIds.length) {
      const { data: tmRows } = await supabase.from("team_member").select("user_id").in("team_id", teamIds);
      memberCount = new Set((tmRows ?? []).map((r) => r.user_id as string)).size;
    }
    const { count: inviteCount } = await supabase.from("survey_invite").select("id", { count: "exact", head: true }).eq("survey_id", surveyId);
    invited = memberCount + (inviteCount ?? 0) || null;
  }

  const { data: res } = await supabase.rpc("survey_results", { p_survey: surveyId, p_strength_items: strengthItems });
  const r = res as unknown as SurveyResults | null;

  let sections: SectionScoreVM[] = [];
  let overallPct: number | null = null;
  let belowCount = 0;
  let note: AssessmentDetailVM["note"] = null;
  if (r && !r.masked) {
    sections = dimensionMeans(inst, r.items ?? [])
      .filter((d): d is { key: string; label: string; blurb: string; mean: number } => d.mean != null)
      .map((d) => {
        const pct = Math.max(0, Math.min(100, ((d.mean - min) / (max - min)) * 100));
        return { key: d.key, label: d.label, mean: d.mean, pct, targetLow: TARGET_LOW_PCT, band: bandOf(pct) };
      });
    belowCount = sections.filter((s) => s.band === 0).length;
    overallPct = r.composite != null ? Math.round(Number(r.composite) * 10) / 10 : null;
    const cs = climateStrength(r.strength_sd);
    if (cs) note = { label: cs.label, tone: cs.tone, copy: strengthCopy(cs.tone) };
  }

  // Score-over-time: prior surveys of the same kind for the same team, their
  // composite over time. Capped to the 6 most recent (incl. this one) so the
  // line stays cheap — at most ~6 survey_results calls.
  const trend: AssessmentTrendPoint[] = [];
  if (survey.team_id) {
    const { data: priors } = await supabase
      .from("survey")
      .select("id, created_at, closed_at")
      .eq("team_id", survey.team_id)
      .eq("kind", survey.kind)
      .order("created_at", { ascending: false })
      .limit(6);
    const ordered = (priors ?? []).slice().reverse(); // oldest -> newest
    const results = await Promise.all(
      ordered.map((p) =>
        p.id === surveyId
          ? Promise.resolve({ data: res })
          : supabase.rpc("survey_results", { p_survey: p.id, p_strength_items: strengthItems }),
      ),
    );
    ordered.forEach((p, i) => {
      const pr = results[i].data as unknown as SurveyResults | null;
      if (pr && !pr.masked && pr.composite != null) {
        trend.push({ l: cycleLabel(p.closed_at ?? p.created_at), v: Math.round(Number(pr.composite) * 10) / 10 });
      }
    });
  }

  const participationPct =
    r && !r.masked && invited && invited > 0 ? Math.round((r.respondents / invited) * 100) : null;

  return {
    detail: {
      surveyId,
      name: (survey.name as string) ?? inst.name,
      instrumentName: inst.name,
      overallPct,
      respondents: r?.respondents ?? 0,
      invited,
      participationPct,
      belowCount,
      sectionCount: inst.dimensions.length,
      lastReviewed: (survey.closed_at as string | null) ?? (survey.created_at as string | null),
      masked: r ? r.masked : true,
      sections,
      trend,
      note,
    },
  };
}
