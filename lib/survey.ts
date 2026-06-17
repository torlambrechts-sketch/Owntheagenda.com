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

export const INSTRUMENTS: Record<string, SurveyInstrument> = {
  [PSYCH_SAFETY_BANG.kind]: PSYCH_SAFETY_BANG,
};

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
