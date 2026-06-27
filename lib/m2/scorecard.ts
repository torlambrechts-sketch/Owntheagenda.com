import type { createClient } from "@/lib/supabase/server";

// Computes a team's latest-pulse scorecard: the average score per team dynamic
// against its healthy band, reused by the Insights and Team screens.

export type DynamicRow = {
  key: string;
  label: string;
  score: number | null;
  low: number;
  high: number;
  /** "watch" below the band, "healthy" inside, "strong" above. */
  status: "watch" | "healthy" | "strong" | "none";
};

export type Scorecard = {
  hasData: boolean;
  overall: number | null;
  delta: number | null;
  dynamics: DynamicRow[];
  pulseId: string | null;
  responded: number;
};

function classify(score: number | null, low: number, high: number): DynamicRow["status"] {
  if (score == null) return "none";
  if (score < low) return "watch";
  if (score > high) return "strong";
  return "healthy";
}

export async function getScorecard(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
): Promise<Scorecard> {
  const { data: bands } = await supabase
    .from("dynamic_band")
    .select("dynamic, label, target_low, target_high, ord")
    .order("ord", { ascending: true });

  const { data: pulses } = await supabase
    .from("pulse")
    .select("id, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(2);

  const bandList = bands ?? [];
  const empty: Scorecard = {
    hasData: false,
    overall: null,
    delta: null,
    pulseId: null,
    responded: 0,
    dynamics: bandList.map((b) => ({
      key: String(b.dynamic),
      label: b.label,
      score: null,
      low: b.target_low,
      high: b.target_high,
      status: "none" as const,
    })),
  };
  if (!pulses || pulses.length === 0) return empty;

  const latest = pulses[0].id;
  const { data: rows } = await supabase
    .from("pulse_response")
    .select("dynamic, score, respondent_id")
    .eq("pulse_id", latest);
  if (!rows || rows.length === 0) return empty;

  const avgByDynamic = (list: { dynamic: string | null; score: number | null }[]) => {
    const acc = new Map<string, { sum: number; n: number }>();
    for (const r of list) {
      const d = String(r.dynamic);
      const cur = acc.get(d) ?? { sum: 0, n: 0 };
      cur.sum += r.score ?? 0;
      cur.n += 1;
      acc.set(d, cur);
    }
    return acc;
  };

  const latestAvg = avgByDynamic(rows);
  const dynamics: DynamicRow[] = bandList.map((b) => {
    const a = latestAvg.get(String(b.dynamic));
    const score = a && a.n ? Math.round(a.sum / a.n) : null;
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

  // Delta vs the previous pulse's overall.
  let delta: number | null = null;
  if (pulses[1]) {
    const { data: prev } = await supabase
      .from("pulse_response")
      .select("score")
      .eq("pulse_id", pulses[1].id);
    if (prev && prev.length) {
      const prevOverall = Math.round(prev.reduce((a, r) => a + (r.score ?? 0), 0) / prev.length);
      if (overall != null) delta = overall - prevOverall;
    }
  }

  const responded = new Set(rows.map((r) => r.respondent_id)).size;
  return { hasData: true, overall, delta, dynamics, pulseId: latest, responded };
}
