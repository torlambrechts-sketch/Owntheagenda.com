import type { Enums } from "@/types/database.types";

export type Activity = Enums<"activity_type">;

// Facilitation phases from the Workshop App handoff (Open → Explore → Decide →
// Decide → Close), adapted to the app's own tokens rather than the handoff's
// hard-coded hex. Each phase reads from a CSS variable so it stays themeable.
export type PhaseKey = "open" | "explore" | "decide" | "close";

export const PHASES: { key: PhaseKey; label: string; accent: string; desc: string }[] = [
  { key: "open", label: "Open", accent: "var(--role)", desc: "Land everyone & frame the work" },
  { key: "explore", label: "Explore", accent: "#6d28d9", desc: "Surface the real picture" },
  { key: "decide", label: "Decide", accent: "var(--forest)", desc: "Converge & commit" },
  { key: "close", label: "Close", accent: "var(--amber)", desc: "Own the outcome" },
];

export const PHASE_LABEL: Record<PhaseKey, string> = PHASES.reduce(
  (m, p) => ((m[p.key] = p.label), m),
  {} as Record<PhaseKey, string>,
);
export const PHASE_ACCENT: Record<PhaseKey, string> = PHASES.reduce(
  (m, p) => ((m[p.key] = p.accent), m),
  {} as Record<PhaseKey, string>,
);

// Which facilitation phase each runnable activity belongs to. Drives the
// grouped block palette and the phase summary chips in the template editor.
export const ACTIVITY_PHASE: Record<Activity, PhaseKey> = {
  checkin: "open",
  charter: "open",
  assess: "open",
  survey: "open",
  manual: "explore",
  brainstorm: "explore",
  hmw: "explore",
  canvas: "explore",
  vote: "decide",
  feedback: "explore",
  discuss: "explore",
  outcome: "decide",
  retrospective: "close",
};

// Sensible default duration (minutes) when a block is first dropped in.
export const DEFAULT_MINUTES: Record<Activity, number> = {
  checkin: 5,
  charter: 10,
  assess: 12,
  survey: 10,
  manual: 8,
  brainstorm: 15,
  hmw: 10,
  canvas: 12,
  vote: 8,
  feedback: 10,
  discuss: 12,
  outcome: 10,
  retrospective: 12,
};

export function phaseOf(type: string): PhaseKey {
  return ACTIVITY_PHASE[type as Activity] ?? "explore";
}

// The palette order: phase → activities in that phase (stable, deduped).
export const PALETTE: { key: PhaseKey; label: string; accent: string; acts: Activity[] }[] =
  PHASES.map((p) => ({
    ...p,
    acts: (Object.keys(ACTIVITY_PHASE) as Activity[]).filter(
      (a) => ACTIVITY_PHASE[a] === p.key,
    ),
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
      minutes: typeof o.minutes === "number" ? o.minutes : DEFAULT_MINUTES[type] ?? 10,
      prompt: (o.prompt as string) ?? null,
    };
  });
}
