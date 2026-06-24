// Multi-item assessment instruments. The flagship is Henning Bang's
// psychological-safety model for leadership teams — psychological safety +
// behavioral integration — with the Fyhn/Bang "climate strength" signal
// (how much the team agrees on how safe it is).
// Grounded in: Bang & Midelfart, "Effective Management Teams"; Edmondson (1999);
// Fyhn, Bang, Egeland & Schei (2023). Items are our own wording of the model.

// `type`/`options`/`required`/`qScale` are additive (default Likert). Only
// Likert items carry a numeric score; single/multi/text are collected and
// stored but excluded from dimension means.
export type SurveyItem = {
  key: string;
  dimension: string;
  text: string;
  reverse?: boolean;
  type?: "likert" | "single" | "multi" | "text";
  options?: string[];
  required?: boolean;
  qScale?: string;
};
export type SurveyDimension = { key: string; label: string; blurb: string };
export type SurveyInstrument = {
  kind: string;
  name: string;
  scale: { min: number; max: number; minLabel: string; maxLabel: string };
  dimensions: SurveyDimension[];
  items: SurveyItem[];
  strengthDimension: string; // dimension whose spread drives the climate-strength read
  weights?: Record<string, number>; // optional per-dimension weights for the composite
  quadrant?: QuadrantConfig; // optional 2×2 (e.g. strategy quality × execution readiness)
};

// Optional 2×2 output: plot two named dimensions against each other.
export type QuadrantConfig = {
  x: string; // dimension key
  y: string; // dimension key
  xLabel: string;
  yLabel: string;
  // labels for the four quadrants, indexed lowX/highX × lowY/highY
  q?: { ll: string; hl: string; lh: string; hh: string };
};

export const PSYCH_SAFETY_BANG: SurveyInstrument = {
  kind: "psych_safety_bang",
  name: "Psychological Safety — Leadership Teams",
  scale: { min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
  dimensions: [
    { key: "safety", label: "Psychological safety", blurb: "Can we speak up, take risks and admit doubt without fear?" },
    { key: "integration", label: "Behavioral integration", blurb: "Do we collaborate, share information and own decisions together?" },
  ],
  items: [
    { key: "safety_1", dimension: "safety", text: "It's easy to raise problems and tough issues in this team." },
    { key: "safety_2", dimension: "safety", text: "It's safe to take a risk in this team." },
    { key: "safety_3", dimension: "safety", text: "It's safe to speak your mind in this team." },
    { key: "safety_4", dimension: "safety", text: "There's room to express uncertainty or doubt in this team." },
    { key: "int_1", dimension: "integration", text: "We feel mutually responsible for our decisions." },
    { key: "int_2", dimension: "integration", text: "We understand each other's issues and needs." },
    { key: "int_3", dimension: "integration", text: "We help each other solve problems." },
    { key: "int_4", dimension: "integration", text: "We share relevant information with each other." },
    { key: "int_5", dimension: "integration", text: "We share resources with each other." },
  ],
  strengthDimension: "safety",
};

// Team effectiveness (Bang & Midelfart): task performance + member satisfaction.
export const TEAM_EFFECTIVENESS_BANG: SurveyInstrument = {
  kind: "team_effectiveness_bang",
  name: "Team Effectiveness — Leadership Teams",
  scale: { min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
  dimensions: [
    { key: "task", label: "Task performance", blurb: "Do we create value, decide well and follow through?" },
    { key: "satisfaction", label: "Member satisfaction", blurb: "Does being on this team help us learn, grow and stay motivated?" },
  ],
  items: [
    { key: "task_1", dimension: "task", text: "This team's work creates real value for the organisation." },
    { key: "task_2", dimension: "task", text: "We make high-quality decisions." },
    { key: "task_3", dimension: "task", text: "We give the organisation clear direction." },
    { key: "task_4", dimension: "task", text: "We're aligned on what matters most." },
    { key: "task_5", dimension: "task", text: "We follow through on what we commit to." },
    { key: "sat_1", dimension: "satisfaction", text: "Being on this team helps me learn and grow." },
    { key: "sat_2", dimension: "satisfaction", text: "I feel good about how we work together." },
    { key: "sat_3", dimension: "satisfaction", text: "This team motivates me to do my best." },
  ],
  strengthDimension: "task",
};

// Team learning behaviour (Edmondson): feedback, error discussion, experimentation, reflection.
export const TEAM_LEARNING_EDMONDSON: SurveyInstrument = {
  kind: "team_learning_edmondson",
  name: "Team Learning",
  scale: { min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
  dimensions: [
    { key: "learning", label: "Team learning", blurb: "Do we seek feedback, learn from mistakes and adapt how we work?" },
  ],
  items: [
    { key: "learn_1", dimension: "learning", text: "We regularly ask for feedback on how we're doing." },
    { key: "learn_2", dimension: "learning", text: "We openly discuss mistakes so we can learn from them." },
    { key: "learn_3", dimension: "learning", text: "We try new ways of working and experiment." },
    { key: "learn_4", dimension: "learning", text: "We take time to reflect on how we work, not just what we deliver." },
    { key: "learn_5", dimension: "learning", text: "We seek out information and views from outside the team." },
  ],
  strengthDimension: "learning",
};

// Project Aristotle (Google re:Work): the five keys to an effective team as
// one balanced, reverse-scored team pulse — 5 pillars × 6 construct-isolated
// items, two reverse-keyed per pillar, on a 1–5 Likert scale. This mirrors the
// `aristotle_team` assessment_template row (the DB is the source of truth); it
// exists only as a fallback so a momentary read failure never blanks the survey.
export const ARISTOTLE_TEAM: SurveyInstrument = {
  kind: "aristotle_team",
  name: "Project Aristotle — Team Effectiveness",
  scale: { min: 1, max: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
  dimensions: [
    { key: "psych_safety", label: "Psychological safety", blurb: "Can we take interpersonal risks — speak up, admit mistakes, ask for help — without fear?" },
    { key: "dependability", label: "Dependability", blurb: "Do we reliably get quality work done, on time, and hold each other to our commitments?" },
    { key: "structure_clarity", label: "Structure & clarity", blurb: "Are roles, goals, decision rights and processes clear and predictable?" },
    { key: "meaning", label: "Meaning", blurb: "Is the work personally meaningful, and does it connect to what we care about?" },
    { key: "impact", label: "Impact", blurb: "Do we believe our work matters and can we see it making a difference?" },
  ],
  items: [
    { key: "ps_1", dimension: "psych_safety", text: "It is safe to take a risk on this team." },
    { key: "ps_2", dimension: "psych_safety", text: "I can raise problems and tough issues with this team." },
    { key: "ps_3", dimension: "psych_safety", text: "When I make a mistake on this team, it is not held against me." },
    { key: "ps_4", dimension: "psych_safety", text: "My unique skills and perspective are valued and drawn on by this team." },
    { key: "ps_5", dimension: "psych_safety", text: "People on this team would think less of me if I admitted I did not know something.", reverse: true },
    { key: "ps_6", dimension: "psych_safety", text: "It is difficult to ask other members of this team for help.", reverse: true },
    { key: "dep_1", dimension: "dependability", text: "When members of this team say they will do something, they follow through." },
    { key: "dep_2", dimension: "dependability", text: "This team consistently delivers work that meets the quality bar we have agreed." },
    { key: "dep_3", dimension: "dependability", text: "Members of this team hold each other accountable for our commitments." },
    { key: "dep_4", dimension: "dependability", text: "I can count on my teammates to do their share of the work." },
    { key: "dep_5", dimension: "dependability", text: "I often have to chase teammates to get their part of the work done.", reverse: true },
    { key: "dep_6", dimension: "dependability", text: "Work on this team frequently has to be redone because it was not done right the first time.", reverse: true },
    { key: "sc_1", dimension: "structure_clarity", text: "I have a clear understanding of my role and responsibilities on this team." },
    { key: "sc_2", dimension: "structure_clarity", text: "This team has clear goals that I can articulate." },
    { key: "sc_3", dimension: "structure_clarity", text: "It is clear who has the authority to make which decisions on this team." },
    { key: "sc_4", dimension: "structure_clarity", text: "Our processes for getting work done are clear and predictable." },
    { key: "sc_5", dimension: "structure_clarity", text: "There is confusion or overlap about who owns what on this team.", reverse: true },
    { key: "sc_6", dimension: "structure_clarity", text: "I am often unsure what this team is actually trying to achieve.", reverse: true },
    { key: "mn_1", dimension: "meaning", text: "The work I do for this team is personally meaningful to me." },
    { key: "mn_2", dimension: "meaning", text: "My personal values are aligned with the purpose of this team's work." },
    { key: "mn_3", dimension: "meaning", text: "Being on this team helps me learn and grow in ways I care about." },
    { key: "mn_4", dimension: "meaning", text: "The contributions I make to this team are genuinely valued." },
    { key: "mn_5", dimension: "meaning", text: "Most of my work here feels like I am just going through the motions.", reverse: true },
    { key: "mn_6", dimension: "meaning", text: "The effort I put into this team largely goes unnoticed.", reverse: true },
    { key: "im_1", dimension: "impact", text: "The work of this team makes a real difference to the organisation." },
    { key: "im_2", dimension: "impact", text: "I can clearly see how my work connects to outcomes that matter." },
    { key: "im_3", dimension: "impact", text: "I believe the work we do here actually creates the impact we intend." },
    { key: "im_4", dimension: "impact", text: "We can point to concrete results that this team has produced." },
    { key: "im_5", dimension: "impact", text: "It is hard to tell whether the work I do here actually matters.", reverse: true },
    { key: "im_6", dimension: "impact", text: "A lot of what this team produces ends up having little real effect.", reverse: true },
  ],
  strengthDimension: "psych_safety",
};

export const INSTRUMENTS: Record<string, SurveyInstrument> = {
  [PSYCH_SAFETY_BANG.kind]: PSYCH_SAFETY_BANG,
  [TEAM_EFFECTIVENESS_BANG.kind]: TEAM_EFFECTIVENESS_BANG,
  [TEAM_LEARNING_EDMONDSON.kind]: TEAM_LEARNING_EDMONDSON,
  [ARISTOTLE_TEAM.kind]: ARISTOTLE_TEAM,
};

// Instruments offered in the standalone "send an assessment" picker.
export const INSTRUMENT_LIST: SurveyInstrument[] = [
  ARISTOTLE_TEAM,
  PSYCH_SAFETY_BANG,
  TEAM_EFFECTIVENESS_BANG,
  TEAM_LEARNING_EDMONDSON,
];

export type ItemStat = { item_key: string; mean: number; n: number };

// Per-dimension mean from the per-item means returned by survey_results.
// Reverse-keyed items are flipped onto the same pole as the dimension before
// averaging, so a high dimension mean always reads "more of this trait".
export function dimensionMeans(
  inst: SurveyInstrument,
  items: ItemStat[],
): { key: string; label: string; blurb: string; mean: number | null }[] {
  const { min, max } = inst.scale;
  return inst.dimensions.map((d) => {
    const ms = inst.items
      .filter((it) => it.dimension === d.key && (it.type ?? "likert") === "likert")
      .map((it) => {
        const m = items.find((x) => x.item_key === it.key)?.mean;
        if (typeof m !== "number") return undefined;
        return it.reverse ? min + max - m : m;
      })
      .filter((m): m is number => typeof m === "number");
    const mean = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
    return { key: d.key, label: d.label, blurb: d.blurb, mean: mean == null ? null : Math.round(mean * 100) / 100 };
  });
}

// Per-dimension means for a single person's flat score map (individual scope —
// each item carries one value, so it reuses dimensionMeans with n=1 stats).
export function individualDimensionMeans(
  inst: SurveyInstrument,
  scores: Record<string, number>,
): { key: string; label: string; blurb: string; mean: number | null }[] {
  const items: ItemStat[] = Object.entries(scores).map(([item_key, v]) => ({ item_key, mean: Number(v), n: 1 }));
  return dimensionMeans(inst, items);
}

// Interpret the climate-strength dispersion (SD on the instrument's scale).
export function climateStrength(sd: number | null): { label: string; tone: "aligned" | "mixed" | "split" } | null {
  if (sd == null) return null;
  if (sd < 0.8) return { label: "Aligned", tone: "aligned" };
  if (sd < 1.4) return { label: "Mixed", tone: "mixed" };
  return { label: "Split", tone: "split" };
}

// Deficit → focus: from the per-dimension means, name where the team should
// spend the workshop. Returns the weakest dimension(s) (the lowest, plus any
// within 0.3 of it) when there's a meaningful spread; flags `even` when the
// team scores flat across dimensions (nothing stands out to target). This is
// the facilitation-layer answer to "assemble the session around the deficit"
// without a curated remedy-block library.
export function surveyFocus(
  dims: { key: string; label: string; mean: number | null }[],
  threshold = 0.4,
): { focus: { key: string; label: string; mean: number }[]; even: boolean } {
  const scored = dims.filter(
    (d): d is { key: string; label: string; mean: number } => typeof d.mean === "number",
  );
  if (scored.length < 2) return { focus: [], even: false };
  const means = scored.map((d) => d.mean);
  const lo = Math.min(...means);
  const hi = Math.max(...means);
  if (hi - lo < threshold) return { focus: [], even: true };
  const sorted = [...scored].sort((a, b) => a.mean - b.mean);
  return { focus: sorted.filter((d) => d.mean <= lo + 0.3), even: false };
}

export function strengthItemKeys(inst: SurveyInstrument): string[] {
  return inst.items.filter((it) => it.dimension === inst.strengthDimension).map((it) => it.key);
}

// Normalize dimension means to a 0–100 composite. Matches the server's
// private.survey_composite exactly: weighted mean of dimension means (equal
// weight unless the instrument carries `weights`), normalized over the scale.
// Used for the individual-scope immediate result (which never hits survey_results).
export function compositeScore(
  inst: SurveyInstrument,
  dims: { key: string; mean: number | null }[],
): number | null {
  const vals = dims.filter((d): d is { key: string; mean: number } => typeof d.mean === "number");
  if (!vals.length) return null;
  let wsum = 0;
  let sum = 0;
  for (const d of vals) {
    const w = inst.weights?.[d.key] ?? 1;
    sum += d.mean * w;
    wsum += w;
  }
  if (!wsum) return null;
  const raw = sum / wsum;
  const { min, max } = inst.scale;
  if (max === min) return null;
  return Math.round(((raw - min) / (max - min)) * 1000) / 10;
}

// Shape of the `definition` jsonb stored on an assessment_template row.
export type InstrumentDefinition = {
  scale: SurveyInstrument["scale"];
  dimensions: SurveyDimension[];
  items: SurveyItem[];
  strengthDimension?: string;
  weights?: Record<string, number>;
  quadrant?: QuadrantConfig;
};

// Build a runtime SurveyInstrument from an assessment_template row: the row's
// `key` becomes the kind, `name` the label, and `definition` carries the scale,
// dimensions and items. Returns null if the definition can't be rendered. This
// is what makes the instrument catalog data-driven — add a row, get a working
// survey, no code change.
export function instrumentFromRow(row: {
  key: string;
  name: string;
  definition: unknown;
}): SurveyInstrument | null {
  const def = (row.definition ?? null) as Partial<InstrumentDefinition> | null;
  if (!def || !def.scale || !Array.isArray(def.dimensions) || !Array.isArray(def.items)) return null;
  if (def.dimensions.length === 0 || def.items.length === 0) return null;
  return {
    kind: row.key,
    name: row.name,
    scale: def.scale,
    dimensions: def.dimensions,
    items: def.items,
    strengthDimension: def.strengthDimension ?? def.dimensions[0].key,
    weights: def.weights,
    quadrant: def.quadrant,
  };
}
