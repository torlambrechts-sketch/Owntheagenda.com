import type { Activity } from "./blocks";

// The design's per-type "run content" configuration (the prototype's
// renderBlockProps / seedModule contract). This is the single source of truth
// shared by the BUILDER (properties-pane editor) and the RUN cockpit (module
// seed content), so the two never drift.

export type FieldKind = "text" | "textarea" | "list";
export type FieldDef = { key: string; label: string; kind: FieldKind; placeholder?: string };

// Which run-content fields each design block type exposes in the builder.
export const CONFIG_FIELDS: Partial<Record<Activity, FieldDef[]>> = {
  checkin: [{ key: "question", label: "Check-in question", kind: "text", placeholder: "In one word, how are you arriving?" }],
  framing: [
    { key: "statement", label: "Framing statement", kind: "textarea", placeholder: "Why are we here?" },
    { key: "objectives", label: "Objectives", kind: "list", placeholder: "New objective" },
  ],
  discussion: [
    { key: "prompt", label: "Prompt for the room", kind: "textarea", placeholder: "What should the room discuss?" },
    { key: "seedPoints", label: "Seed talking points (optional)", kind: "list", placeholder: "A point to put on the table" },
  ],
  breakout: [
    { key: "task", label: "Discussion topic", kind: "text", placeholder: "What exactly should groups discuss?" },
    { key: "brief", label: "Guidance / how to run it", kind: "textarea", placeholder: "How should each group work and report back?" },
    { key: "groups", label: "Group names", kind: "list", placeholder: "Group" },
  ],
  vote: [
    { key: "question", label: "Poll question", kind: "text", placeholder: "What are we voting on?" },
    { key: "options", label: "Options", kind: "list", placeholder: "New option" },
  ],
  decision: [{ key: "proposals", label: "Proposals to decide", kind: "list", placeholder: "New proposal" }],
  actions: [{ key: "prompt", label: "Instruction", kind: "textarea", placeholder: "How should the room capture actions?" }],
  reflect: [{ key: "prompt", label: "Reflection prompt", kind: "textarea", placeholder: "What should people reflect on?" }],
  break: [{ key: "message", label: "Break message", kind: "text", placeholder: "Back on time" }],
  canvas: [{ key: "prompts", label: "Board prompts (become sticky notes)", kind: "list", placeholder: "A prompt for the board" }],
};

// The design's seedModule defaults — the run content used when a block carries
// no explicit config yet.
export const CONFIG_DEFAULTS: Partial<Record<Activity, Record<string, unknown>>> = {
  checkin: { question: "In one word — how are you arriving today?" },
  framing: {
    statement: "We are here to agree how we lead together for the next quarter — and leave with owned commitments.",
    objectives: ["Surface what we are avoiding", "Agree the few things that matter", "Leave with owned, dated actions"],
  },
  discussion: { prompt: "Open the floor. Surface the real picture before converging.", seedPoints: [] },
  breakout: { task: "", brief: "Split into small groups. Each group reports back with one headline.", groups: ["Group A", "Group B"] },
  vote: { question: "Which should anchor next quarter?", options: ["Customer trust", "Operational excellence", "Team health"] },
  decision: { proposals: ["Adopt a single weekly leadership forum and retire the three overlapping syncs."] },
  actions: { prompt: "For each commitment: who, what, by when. No orphan actions." },
  reflect: { prompt: "One thing you will start doing differently after today." },
  break: { message: "Stretch, refill, reset. Back in the room on time." },
  canvas: { prompts: [] },
};

// Read a config field with the type's default as fallback.
export function configValue(type: Activity, config: Record<string, unknown> | null | undefined, key: string): unknown {
  const c = config ?? {};
  if (c[key] !== undefined) return c[key];
  return CONFIG_DEFAULTS[type]?.[key];
}

export function configList(type: Activity, config: Record<string, unknown> | null | undefined, key: string): string[] {
  const v = configValue(type, config, key);
  return Array.isArray(v) ? (v as string[]) : [];
}

export function configText(type: Activity, config: Record<string, unknown> | null | undefined, key: string): string {
  const v = configValue(type, config, key);
  return typeof v === "string" ? v : "";
}
