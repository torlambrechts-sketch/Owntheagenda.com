// Connects the assess loop (pulse dynamics) to the run loop (workshops):
// which framework best addresses a given team dynamic, and a helper to
// find the dynamic most in need of attention.

export const DYNAMIC_LABEL: Record<string, string> = {
  psych_safety: "Psychological safety",
  trust: "Trust",
  conflict_norms: "Conflict norms",
  role_clarity: "Role clarity",
  decision_rights: "Decision rights",
};

// Each dynamic → the system template that best moves it, with a rationale.
export const RECOMMENDED: Record<string, { key: string; why: string }> = {
  psych_safety: { key: "mad-sad-glad", why: "make it safe to name how the work actually feels" },
  trust: { key: "five-beh", why: "run the trust audit at the heart of the Five Behaviours" },
  conflict_norms: { key: "ssc", why: "agree what to start, stop and continue in how you disagree" },
  role_clarity: { key: "team-canvas", why: "get explicit about roles, goals and ownership" },
  decision_rights: { key: "ldj", why: "turn murky decisions into prioritised, owned calls" },
};

export type DynamicReading = {
  dynamic: string;
  label: string;
  pct: number | null;
  responses: number;
  target_low: number;
  target_high: number;
  in_band: boolean | null;
};

// The dynamic most worth a session: the biggest shortfall below target
// among dynamics that have data; if none are below band, the lowest reading.
export function weakestDynamic(rows: DynamicReading[]): DynamicReading | null {
  const withData = rows.filter((r) => r.responses > 0 && r.pct != null);
  if (!withData.length) return null;
  const below = withData.filter((r) => (r.pct as number) < r.target_low);
  const pool = below.length ? below : withData;
  return pool.reduce((a, b) => {
    const sa = a.target_low - (a.pct ?? 0);
    const sb = b.target_low - (b.pct ?? 0);
    return sb > sa ? b : a;
  });
}
