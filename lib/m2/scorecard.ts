import type { createClient } from "@/lib/supabase/server";

// Computes a team's latest-pulse scorecard via SECURITY DEFINER aggregates
// (m2_pulse_scorecard / m2_pulse_participation) so anonymity RLS on
// pulse_response doesn't under-count. Reused by Dashboard, Insights and Team.

export type DynamicRow = {
  key: string;
  label: string;
  score: number | null; // 0–100
  low: number;
  high: number;
  status: "watch" | "healthy" | "strong" | "none";
};

export type Scorecard = {
  hasData: boolean;
  overall: number | null; // 0–100 health index
  delta: number | null; // vs previous pulse, 0–100 points
  dynamics: DynamicRow[];
  pulseId: string | null;
  responded: number;
  teamSize: number;
  /** Overall expressed on the original 1–5 Likert scale (for "team pulse"). */
  pulse5: number | null;
  delta5: number | null;
};

function classify(score: number | null, low: number, high: number): DynamicRow["status"] {
  if (score == null) return "none";
  if (score < low) return "watch";
  if (score > high) return "strong";
  return "healthy";
}

async function overallPct(
  supabase: ReturnType<typeof createClient>,
  pulseId: string,
): Promise<number | null> {
  const { data } = await supabase.rpc("m2_pulse_scorecard", { p_pulse: pulseId });
  const rows = data ?? [];
  if (!rows.length) return null;
  return Math.round(rows.reduce((a, r) => a + Number(r.pct), 0) / rows.length);
}

export async function getScorecard(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
): Promise<Scorecard> {
  const { data: bands } = await supabase
    .from("dynamic_band")
    .select("dynamic, label, target_low, target_high, ord")
    .order("ord", { ascending: true });
  const bandList = bands ?? [];

  const empty: Scorecard = {
    hasData: false,
    overall: null,
    delta: null,
    pulseId: null,
    responded: 0,
    teamSize: 0,
    pulse5: null,
    delta5: null,
    dynamics: bandList.map((b) => ({
      key: String(b.dynamic),
      label: b.label,
      score: null,
      low: b.target_low,
      high: b.target_high,
      status: "none" as const,
    })),
  };

  const { data: pulses } = await supabase
    .from("pulse")
    .select("id, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(2);
  if (!pulses || pulses.length === 0) return empty;

  const latest = pulses[0].id;
  const [{ data: scRows }, { data: part }] = await Promise.all([
    supabase.rpc("m2_pulse_scorecard", { p_pulse: latest }),
    supabase.rpc("m2_pulse_participation", { p_pulse: latest }),
  ]);

  const rows = scRows ?? [];
  const byDyn = new Map(rows.map((r) => [String(r.dynamic), Number(r.pct)]));
  const participation = (part ?? [])[0] ?? { responded: 0, team_size: 0 };

  if (rows.length === 0) {
    return { ...empty, teamSize: participation.team_size, responded: participation.responded };
  }

  const dynamics: DynamicRow[] = bandList.map((b) => {
    const score = byDyn.has(String(b.dynamic)) ? Math.round(byDyn.get(String(b.dynamic))!) : null;
    return {
      key: String(b.dynamic),
      label: b.label,
      score,
      low: b.target_low,
      high: b.target_high,
      status: classify(score, b.target_low, b.target_high),
    };
  });

  const scored = dynamics.map((d) => d.score).filter((s): s is number => s != null);
  const overall = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;

  let delta: number | null = null;
  if (pulses[1]) {
    const prevOverall = await overallPct(supabase, pulses[1].id);
    if (overall != null && prevOverall != null) delta = overall - prevOverall;
  }

  // 0–100 → 1–5 for the "team pulse" stat.
  const toFive = (pct: number | null) => (pct == null ? null : Math.round((pct / 25 + 1) * 10) / 10);

  return {
    hasData: true,
    overall,
    delta,
    dynamics,
    pulseId: latest,
    responded: participation.responded,
    teamSize: participation.team_size,
    pulse5: toFive(overall),
    delta5: delta == null ? null : Math.round((delta / 25) * 10) / 10,
  };
}
