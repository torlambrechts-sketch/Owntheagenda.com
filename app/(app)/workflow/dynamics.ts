// Single source of truth for the branch-routing condition vocabulary, shared by
// the two flow editors (the composer's BranchConfig and the canvas Map's inline
// editor) so a new dynamic or operator only has to be added once. The markup of
// the two editors differs (different CSS systems) and stays local; only this
// data is shared.

export const DYNAMICS: { value: string; label: string }[] = [
  { value: "psych_safety", label: "Psychological safety" },
  { value: "trust", label: "Trust" },
  { value: "conflict_norms", label: "Conflict norms" },
  { value: "role_clarity", label: "Role clarity" },
  { value: "decision_rights", label: "Decision rights" },
];

export const DYN: Record<string, string> = Object.fromEntries(DYNAMICS.map((d) => [d.value, d.label]));

export function dynLabel(d?: string | null): string {
  return d ? DYN[d] ?? d : "the reading";
}
export function opLabel(op?: string | null): string {
  return op === "gte" ? "at or above" : "below";
}
