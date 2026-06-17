import { describe, it, expect } from "vitest";
import {
  PSYCH_SAFETY_BANG,
  dimensionMeans,
  climateStrength,
  strengthItemKeys,
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
