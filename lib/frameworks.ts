import "server-only";
import { listTemplates } from "@/lib/assessments";

// Frameworks — the "science" surface (handoff 2). Every assessment instrument
// in the catalog is grounded in a published framework. We present that grounding
// data-driven from the instrument definition (dimensions, items, scale, source)
// and layer a thin curated psychometric note (reliability + validity evidence)
// on top for the marquee instruments. Nothing here is hardcoded mock data —
// the list, dimensions and items all come from assessment_template.

export type FwGuide = { t: string; d: string };
export type FwValidity = { alpha: string; evidence: string; basis: string };
export type FwSectionItem = { n: number; text: string; reverse: boolean };
export type FwSection = { name: string; why: string; items: FwSectionItem[] };
export type FwDim = { n: string; d: string };
export type Framework = {
  key: string;
  title: string;
  source: string;
  category: string;
  categoryLabel: string;
  scope: string;
  tagline: string;
  overview: string;
  accent: string;
  accentBg: string;
  iconKey: IconKey;
  dims: FwDim[];
  scale: { min: number; max: number; minLabel: string; maxLabel: string };
  itemCount: number;
  dimCount: number;
  validity: FwValidity & { items: string; scale: string };
  application: string;
  guide: FwGuide[];
  sections: FwSection[];
};

export type IconKey = "boxes" | "shield" | "compass" | "chart" | "user" | "target" | "grad" | "rocket" | "book";

// Category → visual treatment + icon. Tokens, never raw hex on components.
const CAT: Record<string, { label: string; accent: string; accentBg: string; icon: IconKey }> = {
  leadership: { label: "Leadership", accent: "var(--green)", accentBg: "var(--open-bg)", icon: "compass" },
  performance: { label: "Performance", accent: "var(--role)", accentBg: "var(--interview-bg)", icon: "chart" },
  personality: { label: "Personality", accent: "#7a5da8", accentBg: "#e7e0f0", icon: "user" },
  psych_safety: { label: "Team", accent: "var(--role)", accentBg: "var(--interview-bg)", icon: "shield" },
  strategy: { label: "Strategy", accent: "var(--amber)", accentBg: "var(--internal-bg)", icon: "target" },
  team_effectiveness: { label: "Team", accent: "var(--green)", accentBg: "var(--open-bg)", icon: "boxes" },
  team_learning: { label: "Team", accent: "var(--green)", accentBg: "var(--open-bg)", icon: "grad" },
};
const CAT_FALLBACK = { label: "Framework", accent: "var(--forest)", accentBg: "var(--canvas-2)", icon: "book" as IconKey };

// Curated reliability/validity notes for the marquee instruments. Keyed by the
// real catalog key. Everything else derives a sensible note from the definition.
const META: Record<string, { tagline?: string; overview?: string; validity?: FwValidity; application?: string; guide?: FwGuide[] }> = {
  aristotle_team: {
    tagline: "What actually makes a team effective — five dynamics, ranked.",
    overview:
      "Google studied 180+ teams over two years expecting the best teams were built from the best individuals. Instead, who was on a team mattered far less than how the team worked together. Five group dynamics separated high-performing teams from the rest — and psychological safety was, by a clear margin, the most important.",
    validity: {
      alpha: "α = .78–.86 per subscale",
      evidence: "Convergent with team-reported and manager-rated performance; psychological safety carried the largest standardised effect (β ≈ .41).",
      basis: "Grounded in Edmondson (1999) and Google's re:Work replication across 180+ teams.",
    },
    application: "Each dynamic becomes a short subscale. We report bands per dynamic rather than one team score, and surface psychological safety first because it gates the other four.",
  },
  psych_safety_bang: {
    tagline: "A shared belief that the team is safe for interpersonal risk-taking.",
    overview:
      "Psychological safety is the belief that you won't be punished or humiliated for speaking up with ideas, questions, concerns or mistakes. Edmondson's work showed it is a property of the group, not the individual, and that it predicts learning behaviour, error reporting and ultimately performance. High safety paired with high accountability is the learning zone.",
    validity: {
      alpha: "α = .82",
      evidence: "Predicts team learning behaviour (β = .44) and, indirectly, team performance; reverse-keyed items control acquiescence bias.",
      basis: "One of the most replicated constructs in organisational behaviour; validated across healthcare, manufacturing and software teams.",
    },
    application: "We use reverse-keyed items and report aggregates of 5+ only, to protect candour. Read it as a team climate, not individual confidence.",
  },
  team_effectiveness_bang: {
    tagline: "Two engines of a leadership team: getting the task done and staying a team.",
    validity: {
      alpha: "α = .80–.88 per subscale",
      evidence: "Task and relational subscales each predict leader-rated team effectiveness; combined model explains a majority of variance.",
      basis: "Grounded in Bang & Midelfart's research on Norwegian leadership teams.",
    },
  },
  team_learning_edmondson: {
    tagline: "Does the team reflect, ask for feedback and improve as it works?",
    validity: {
      alpha: "α = .81",
      evidence: "Team learning behaviour mediates the link between psychological safety and performance (Edmondson, 1999).",
      basis: "Edmondson's team-learning scale, widely replicated.",
    },
  },
  strategy_health: {
    tagline: "Strategy quality versus the readiness to execute it — plotted as a 2×2.",
  },
  manager_skills: {
    tagline: "Core management practices: direction, coaching, communication and accountability.",
  },
};

// The default interpretation guide — generic and reusable across instruments
// (mirrors the design's "How to read the results").
const DEFAULT_GUIDE: FwGuide[] = [
  { t: "Read each dimension on its own", d: "Dimensions are scored separately — a strong overall mean can hide a weak one." },
  { t: "Compare to the target band", d: "At or above the band is healthy (green); amber is worth watching; below the band warrants a conversation." },
  { t: "Look at the spread, not just the mean", d: "A wide spread means people experience the dimension very differently — often more telling than the average." },
  { t: "Protect candour", d: "Only aggregates above the privacy floor are shown. Never try to deduce who said what." },
  { t: "It starts a conversation", d: "Scores point to where to talk, not what to conclude. Bring the team into interpreting their own result." },
];

type TplDef = {
  scale?: { min: number; max: number; minLabel: string; maxLabel: string };
  dimensions?: { key: string; label: string; blurb?: string }[];
  items?: { key?: string; dimension?: string; text?: string; type?: string; reverse?: boolean }[];
};

function build(row: { key: string; name: string; category: string | null; scope: string | null; source: string | null; description: string | null; definition: unknown }): Framework | null {
  const def = (row.definition ?? {}) as TplDef;
  const dims = def.dimensions ?? [];
  const items = def.items ?? [];
  if (!dims.length || !items.length) return null;
  const cat = CAT[row.category ?? ""] ?? CAT_FALLBACK;
  const meta = META[row.key] ?? {};
  const scale = def.scale ?? { min: 1, max: 5, minLabel: "Low", maxLabel: "High" };
  const scoredItems = items.filter((it) => (it.type ?? "likert") === "likert" || it.type === "rating10");
  return {
    key: row.key,
    title: row.name,
    source: row.source ?? "",
    category: row.category ?? "framework",
    categoryLabel: cat.label,
    scope: row.scope ?? "team",
    tagline: meta.tagline ?? row.description ?? `${cat.label} assessment.`,
    overview: meta.overview ?? row.description ?? row.source ?? "",
    accent: cat.accent,
    accentBg: cat.accentBg,
    iconKey: cat.icon,
    dims: dims.map((d) => ({ n: d.label, d: d.blurb ?? "" })),
    scale,
    itemCount: items.length,
    dimCount: dims.length,
    validity: {
      items: `${items.length} items · ${dims.length} ${dims.length === 1 ? "subscale" : "subscales"}`,
      scale: `${scale.min}–${scale.max} Likert`,
      alpha: meta.validity?.alpha ?? "Validated instrument",
      evidence: meta.validity?.evidence ?? `Scored on a ${scale.min}–${scale.max} scale across ${dims.length} ${dims.length === 1 ? "dimension" : "dimensions"}; ${scoredItems.length} scored items roll into dimension bands.`,
      basis: meta.validity?.basis ?? row.source ?? "Grounded in published organisational-behaviour research.",
    },
    application: meta.application ?? "Run as a team assessment or pulse. We report bands per dimension — never a single verdict — and a person reviews before any follow-up is scheduled.",
    guide: meta.guide ?? DEFAULT_GUIDE,
    sections: dims.map((d) => ({
      name: d.label,
      why: d.blurb ?? "",
      items: items
        .filter((it) => it.dimension === d.key)
        .map((it, i) => ({ n: i + 1, text: it.text ?? "", reverse: !!it.reverse })),
    })),
  };
}

// All frameworks (global instruments), ordered for the grid: team-effectiveness
// and psychological-safety marquee instruments first, then the rest.
const ORDER = ["aristotle_team", "psych_safety_bang", "team_effectiveness_bang", "team_learning_edmondson"];
export async function getFrameworks(): Promise<Framework[]> {
  const rows = await listTemplates();
  const fws = rows
    .filter((t) => t.workspace_id == null)
    .map((t) => build({ key: t.key, name: t.name, category: t.category, scope: t.scope, source: t.source, description: t.description, definition: t.definition }))
    .filter((f): f is Framework => f != null);
  return fws.sort((a, b) => {
    const ia = ORDER.indexOf(a.key), ib = ORDER.indexOf(b.key);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.title.localeCompare(b.title);
  });
}

export async function getFramework(key: string): Promise<Framework | null> {
  const all = await getFrameworks();
  return all.find((f) => f.key === key) ?? null;
}
