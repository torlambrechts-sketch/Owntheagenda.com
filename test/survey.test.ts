import { describe, it, expect } from "vitest";
import {
  PSYCH_SAFETY_BANG,
  TEAM_EFFECTIVENESS_BANG,
  TEAM_LEARNING_EDMONDSON,
  ARISTOTLE_TEAM,
  INSTRUMENTS,
  INSTRUMENT_LIST,
  dimensionMeans,
  individualDimensionMeans,
  climateStrength,
  strengthItemKeys,
  instrumentFromRow,
  surveyFocus,
} from "@/lib/survey";

describe("PSYCH_SAFETY_BANG", () => {
  it("has the validated 4 safety + 5 integration items", () => {
    expect(PSYCH_SAFETY_BANG.items.filter((i) => i.dimension === "safety")).toHaveLength(4);
    expect(PSYCH_SAFETY_BANG.items.filter((i) => i.dimension === "integration")).toHaveLength(5);
    expect(PSYCH_SAFETY_BANG.scale.max).toBe(7);
  });
});

describe("dimensionMeans", () => {
  it("averages the items within each dimension", () => {
    const items = [
      { item_key: "safety_1", mean: 6, n: 3 },
      { item_key: "safety_2", mean: 4, n: 3 },
      { item_key: "safety_3", mean: 5, n: 3 },
      { item_key: "safety_4", mean: 5, n: 3 },
      { item_key: "int_1", mean: 3, n: 3 },
    ];
    const dims = dimensionMeans(PSYCH_SAFETY_BANG, items);
    expect(dims.find((d) => d.key === "safety")?.mean).toBe(5);
    expect(dims.find((d) => d.key === "integration")?.mean).toBe(3);
  });
  it("returns null for a dimension with no data", () => {
    const dims = dimensionMeans(PSYCH_SAFETY_BANG, []);
    expect(dims.every((d) => d.mean === null)).toBe(true);
  });
  it("excludes non-Likert items (single/multi/text) from the mean", () => {
    const inst = instrumentFromRow({
      key: "mixed",
      name: "Mixed",
      definition: {
        scale: { min: 1, max: 5, minLabel: "Low", maxLabel: "High" },
        dimensions: [{ key: "d1", label: "D1", blurb: "" }],
        items: [
          { key: "d1_1", dimension: "d1", text: "Likert", type: "likert" },
          { key: "d1_2", dimension: "d1", text: "Pick one", type: "single", options: ["A", "B"] },
          { key: "d1_3", dimension: "d1", text: "Free text", type: "text" },
        ],
      },
    })!;
    // Even if non-Likert items somehow carry a numeric stat, they must not skew
    // the dimension mean — only the Likert item counts.
    const dims = dimensionMeans(inst, [
      { item_key: "d1_1", mean: 4, n: 3 },
      { item_key: "d1_2", mean: 1, n: 3 },
      { item_key: "d1_3", mean: 1, n: 3 },
    ]);
    expect(dims.find((d) => d.key === "d1")?.mean).toBe(4);
  });
});

describe("climateStrength", () => {
  it("bands the dispersion and masks null", () => {
    expect(climateStrength(null)).toBeNull();
    expect(climateStrength(0.4)?.tone).toBe("aligned");
    expect(climateStrength(1.1)?.tone).toBe("mixed");
    expect(climateStrength(1.8)?.tone).toBe("split");
  });
});

describe("strengthItemKeys", () => {
  it("returns the safety-dimension item keys", () => {
    expect(strengthItemKeys(PSYCH_SAFETY_BANG)).toEqual(["safety_1", "safety_2", "safety_3", "safety_4"]);
  });
});

describe("instrument registry", () => {
  it("registers every listed instrument by kind", () => {
    for (const inst of INSTRUMENT_LIST) {
      expect(INSTRUMENTS[inst.kind]).toBe(inst);
    }
  });
  it("each instrument's items reference declared dimensions", () => {
    for (const inst of INSTRUMENT_LIST) {
      const dims = new Set(inst.dimensions.map((d) => d.key));
      expect(inst.items.length).toBeGreaterThan(0);
      for (const it of inst.items) expect(dims.has(it.dimension)).toBe(true);
      expect(dims.has(inst.strengthDimension)).toBe(true);
    }
  });
  it("has the new effectiveness + learning instruments", () => {
    expect(TEAM_EFFECTIVENESS_BANG.items).toHaveLength(8);
    expect(TEAM_LEARNING_EDMONDSON.items).toHaveLength(5);
  });
});

describe("ARISTOTLE_TEAM psychometric contract", () => {
  const pillars = ["psych_safety", "dependability", "structure_clarity", "meaning", "impact"];

  it("has 5 pillars on a 1–5 Likert scale", () => {
    expect(ARISTOTLE_TEAM.dimensions.map((d) => d.key).sort()).toEqual([...pillars].sort());
    expect(ARISTOTLE_TEAM.scale.min).toBe(1);
    expect(ARISTOTLE_TEAM.scale.max).toBe(5);
  });

  it("is balanced: 6 items per pillar (30 total)", () => {
    expect(ARISTOTLE_TEAM.items).toHaveLength(30);
    for (const p of pillars) {
      expect(ARISTOTLE_TEAM.items.filter((i) => i.dimension === p)).toHaveLength(6);
    }
  });

  it("carries 1–2 reverse-keyed items per pillar for acquiescence control", () => {
    for (const p of pillars) {
      const rev = ARISTOTLE_TEAM.items.filter((i) => i.dimension === p && i.reverse).length;
      expect(rev).toBeGreaterThanOrEqual(1);
      expect(rev).toBeLessThanOrEqual(2);
    }
  });

  it("has unique item keys, all referencing declared pillars", () => {
    const keys = ARISTOTLE_TEAM.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const dims = new Set(ARISTOTLE_TEAM.dimensions.map((d) => d.key));
    for (const it of ARISTOTLE_TEAM.items) expect(dims.has(it.dimension)).toBe(true);
  });

  it("reflects reverse items across the scale midpoint before averaging", () => {
    // psych_safety: forward ps_1..ps_4 = 5; reverse ps_5,ps_6 raw = 1 → flips to 5.
    // All six should land on the same pole, so the pillar mean is 5, not diluted.
    const items = [
      { item_key: "ps_1", mean: 5, n: 4 },
      { item_key: "ps_2", mean: 5, n: 4 },
      { item_key: "ps_3", mean: 5, n: 4 },
      { item_key: "ps_4", mean: 5, n: 4 },
      { item_key: "ps_5", mean: 1, n: 4 },
      { item_key: "ps_6", mean: 1, n: 4 },
    ];
    const safety = dimensionMeans(ARISTOTLE_TEAM, items).find((d) => d.key === "psych_safety");
    expect(safety?.mean).toBe(5);
  });
});

describe("individualDimensionMeans", () => {
  it("averages a single person's items per dimension", () => {
    const dims = individualDimensionMeans(PSYCH_SAFETY_BANG, { safety_1: 6, safety_2: 4, int_1: 2 });
    expect(dims.find((d) => d.key === "safety")?.mean).toBe(5);
    expect(dims.find((d) => d.key === "integration")?.mean).toBe(2);
  });
});

describe("instrumentFromRow", () => {
  const def = {
    scale: { min: 1, max: 7, minLabel: "Lo", maxLabel: "Hi" },
    dimensions: [{ key: "a", label: "Alpha", blurb: "" }],
    items: [{ key: "a_1", dimension: "a", text: "Q" }],
    strengthDimension: "a",
  };
  it("builds an instrument from a template row (key→kind, name, definition)", () => {
    const inst = instrumentFromRow({ key: "demo", name: "Demo", definition: def });
    expect(inst?.kind).toBe("demo");
    expect(inst?.name).toBe("Demo");
    expect(inst?.items).toHaveLength(1);
    expect(inst?.strengthDimension).toBe("a");
  });
  it("defaults strengthDimension to the first dimension when absent", () => {
    const { strengthDimension, ...rest } = def;
    void strengthDimension;
    const inst = instrumentFromRow({ key: "d", name: "D", definition: rest });
    expect(inst?.strengthDimension).toBe("a");
  });
  it("returns null for an unusable definition", () => {
    expect(instrumentFromRow({ key: "x", name: "X", definition: null })).toBeNull();
    expect(instrumentFromRow({ key: "x", name: "X", definition: {} })).toBeNull();
    expect(instrumentFromRow({ key: "x", name: "X", definition: { scale: def.scale, dimensions: [], items: [] } })).toBeNull();
  });
});

describe("surveyFocus", () => {
  it("names the weakest dimension when there's a meaningful spread", () => {
    const { focus, even } = surveyFocus([
      { key: "safety", label: "Safety", mean: 3.1 },
      { key: "integration", label: "Integration", mean: 5.4 },
    ]);
    expect(even).toBe(false);
    expect(focus.map((d) => d.key)).toEqual(["safety"]);
  });
  it("groups near-lowest dimensions within 0.3", () => {
    const { focus } = surveyFocus([
      { key: "a", label: "A", mean: 3.0 },
      { key: "b", label: "B", mean: 3.2 },
      { key: "c", label: "C", mean: 5.0 },
    ]);
    expect(focus.map((d) => d.key).sort()).toEqual(["a", "b"]);
  });
  it("flags even when the team scores flat across dimensions", () => {
    const { focus, even } = surveyFocus([
      { key: "a", label: "A", mean: 4.9 },
      { key: "b", label: "B", mean: 5.1 },
    ]);
    expect(even).toBe(true);
    expect(focus).toHaveLength(0);
  });
  it("returns nothing actionable with fewer than two scored dimensions", () => {
    const { focus, even } = surveyFocus([
      { key: "a", label: "A", mean: 3.0 },
      { key: "b", label: "B", mean: null },
    ]);
    expect(focus).toHaveLength(0);
    expect(even).toBe(false);
  });
});
