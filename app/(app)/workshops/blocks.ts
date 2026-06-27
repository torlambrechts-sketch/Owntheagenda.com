import type { Enums } from "@/types/database.types";

export type Activity = Enums<"activity_type">;

// Facilitation phases from the Workshop design handoff (Open → Explore → Decide
// → Close). Each phase reads a design accent; the full tint/border set lives in
// visuals.tsx (PHASE_VIS) so colour stays in one place.
export type PhaseKey = "open" | "explore" | "decide" | "close";

export const PHASES: { key: PhaseKey; label: string; accent: string; desc: string }[] = [
  { key: "open", label: "Open", accent: "#3a4d3f", desc: "Land everyone & frame the work" },
  { key: "explore", label: "Explore", accent: "#1d4ed8", desc: "Surface the real picture" },
  { key: "decide", label: "Decide", accent: "#a16207", desc: "Converge & commit" },
  { key: "close", label: "Close", accent: "#6d28d9", desc: "Own the outcome" },
];

export const PHASE_LABEL: Record<PhaseKey, string> = PHASES.reduce(
  (m, p) => ((m[p.key] = p.label), m),
  {} as Record<PhaseKey, string>,
);
export const PHASE_ACCENT: Record<PhaseKey, string> = PHASES.reduce(
  (m, p) => ((m[p.key] = p.accent), m),
  {} as Record<PhaseKey, string>,
);

// The design's 10 canonical, buildable block types — the order they appear in
// the builder block library and the type picker. (`canvas` doubles as the
// brainstorm board.)
export const LIBRARY: { type: Activity; label: string; phase: PhaseKey; min: number }[] = [
  { type: "checkin", label: "Check-in", phase: "open", min: 5 },
  { type: "framing", label: "Framing", phase: "open", min: 10 },
  { type: "discussion", label: "Discussion", phase: "explore", min: 20 },
  { type: "breakout", label: "Breakout", phase: "explore", min: 20 },
  { type: "canvas", label: "Canvas / brainstorm", phase: "explore", min: 25 },
  { type: "break", label: "Break", phase: "explore", min: 10 },
  { type: "vote", label: "Vote / poll", phase: "decide", min: 10 },
  { type: "decision", label: "Decision", phase: "decide", min: 15 },
  { type: "actions", label: "Action items", phase: "close", min: 10 },
  { type: "reflect", label: "Reflection", phase: "close", min: 5 },
];

// The design's runnable block types — drives which builder type-config + run
// module renders. Used to gate the picker to the canonical set.
export const DESIGN_TYPES: Activity[] = LIBRARY.map((l) => l.type);

// Which facilitation phase each activity belongs to. Design types first, legacy
// types retained so historical rows + the assessment integration keep working.
export const ACTIVITY_PHASE: Partial<Record<Activity, PhaseKey>> = {
  // design taxonomy
  checkin: "open",
  framing: "open",
  discussion: "explore",
  breakout: "explore",
  canvas: "explore",
  break: "explore",
  vote: "decide",
  decision: "decide",
  actions: "close",
  reflect: "close",
  // retained legacy types
  charter: "open",
  assess: "open",
  survey: "open",
  manual: "open",
  brainstorm: "explore",
  hmw: "explore",
  discuss: "explore",
  feedback: "explore",
  outcome: "decide",
  retrospective: "close",
};

// Sensible default duration (minutes) when a block is first dropped in.
export const DEFAULT_MINUTES: Partial<Record<Activity, number>> = {
  // design taxonomy
  checkin: 5,
  framing: 10,
  discussion: 20,
  breakout: 20,
  canvas: 25,
  break: 10,
  vote: 10,
  decision: 15,
  actions: 10,
  reflect: 5,
  // retained legacy types
  charter: 10,
  assess: 12,
  survey: 10,
  manual: 8,
  brainstorm: 15,
  hmw: 10,
  discuss: 12,
  feedback: 10,
  outcome: 10,
  retrospective: 12,
};

export function phaseOf(type: string): PhaseKey {
  return ACTIVITY_PHASE[type as Activity] ?? "explore";
}

export function minutesFor(type: string): number {
  return DEFAULT_MINUTES[type as Activity] ?? 10;
}

// The builder palette: phase → its buildable design activities, in library
// order. Built from LIBRARY (not ACTIVITY_PHASE) so legacy/non-buildable types
// never surface in the picker.
export const PALETTE: { key: PhaseKey; label: string; accent: string; acts: Activity[] }[] =
  PHASES.map((p) => ({
    ...p,
    acts: LIBRARY.filter((l) => l.phase === p.key).map((l) => l.type),
  }));

export type TemplatePhase = {
  id: string;
  title: string;
  type: Activity;
  minutes: number;
  prompt: string | null;
};

// Parse a template.definition jsonb into typed phases (tolerant of partials).
export function parsePhases(definition: unknown): TemplatePhase[] {
  const raw = (definition as { phases?: unknown })?.phases;
  if (!Array.isArray(raw)) return [];
  return raw.map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const type = (o.type as Activity) ?? "canvas";
    return {
      id: `p${i}_${Math.random().toString(36).slice(2, 7)}`,
      title: (o.title as string) ?? "Step",
      type,
      minutes: typeof o.minutes === "number" ? o.minutes : minutesFor(type),
      prompt: (o.prompt as string) ?? null,
    };
  });
}
