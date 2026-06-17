// Multi-item assessment instruments. The flagship is Henning Bang's
// psychological-safety model for leadership teams — psychological safety +
// behavioral integration — with the Fyhn/Bang "climate strength" signal
// (how much the team agrees on how safe it is).
// Grounded in: Bang & Midelfart, "Effective Management Teams"; Edmondson (1999);
// Fyhn, Bang, Egeland & Schei (2023). Items are our own wording of the model.

export type SurveyItem = { key: string; dimension: string; text: string };
export type SurveyDimension = { key: string; label: string; blurb: string };
export type SurveyInstrument = {
  kind: string;
  name: string;
  scale: { min: number; max: number; minLabel: string; maxLabel: string };
  dimensions: SurveyDimension[];
  items: SurveyItem[];
  strengthDimension: string; // dimension whose spread drives the climate-strength read
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

export const INSTRUMENTS: Record<string, SurveyInstrument> = {
  [PSYCH_SAFETY_BANG.kind]: PSYCH_SAFETY_BANG,
  [TEAM_EFFECTIVENESS_BANG.kind]: TEAM_EFFECTIVENESS_BANG,
  [TEAM_LEARNING_EDMONDSON.kind]: TEAM_LEARNING_EDMONDSON,
};

// Instruments offered in the standalone "send an assessment" picker.
export const INSTRUMENT_LIST: SurveyInstrument[] = [
  PSYCH_SAFETY_BANG,
  TEAM_EFFECTIVENESS_BANG,
  TEAM_LEARNING_EDMONDSON,
];

export type ItemStat = { item_key: string; mean: number; n: number };

// Per-dimension mean from the per-item means returned by survey_results.
export function dimensionMeans(
  inst: SurveyInstrument,
  items: ItemStat[],
): { key: string; label: string; blurb: string; mean: number | null }[] {
  return inst.dimensions.map((d) => {
    const ms = inst.items
      .filter((it) => it.dimension === d.key)
      .map((it) => items.find((x) => x.item_key === it.key)?.mean)
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

export function strengthItemKeys(inst: SurveyInstrument): string[] {
  return inst.items.filter((it) => it.dimension === inst.strengthDimension).map((it) => it.key);
}

// Shape of the `definition` jsonb stored on an assessment_template row.
export type InstrumentDefinition = {
  scale: SurveyInstrument["scale"];
  dimensions: SurveyDimension[];
  items: SurveyItem[];
  strengthDimension?: string;
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
  };
}
