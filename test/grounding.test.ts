import { describe, it, expect } from "vitest";
import { weakestDynamic, RECOMMENDED, type DynamicReading } from "@/lib/grounding";

const row = (p: Partial<DynamicReading>): DynamicReading => ({
  dynamic: "trust",
  label: "Trust",
  pct: 70,
  responses: 6,
  target_low: 50,
  target_high: 92,
  in_band: true,
  ...p,
});

describe("weakestDynamic", () => {
  it("returns null with no rows", () => {
    expect(weakestDynamic([])).toBeNull();
  });

  it("ignores dynamics with no responses", () => {
    expect(weakestDynamic([row({ responses: 0, pct: 10 })])).toBeNull();
  });

  it("picks the largest shortfall below band", () => {
    const rows = [
      row({ dynamic: "decision_rights", pct: 42, target_low: 55, in_band: false }),
      row({ dynamic: "psych_safety", pct: 50, target_low: 55, in_band: false }),
      row({ dynamic: "trust", pct: 67, target_low: 50, in_band: true }),
    ];
    expect(weakestDynamic(rows)?.dynamic).toBe("decision_rights");
  });

  it("falls back to the lowest reading when none are below band", () => {
    const rows = [
      row({ dynamic: "trust", pct: 67, target_low: 50, in_band: true }),
      row({ dynamic: "role_clarity", pct: 79, target_low: 50, in_band: true }),
    ];
    // trust sits closer to its target floor -> the focus area
    expect(weakestDynamic(rows)?.dynamic).toBe("trust");
  });
});

describe("RECOMMENDED map", () => {
  it("covers every team dynamic with a template + rationale", () => {
    for (const d of ["psych_safety", "trust", "conflict_norms", "role_clarity", "decision_rights"]) {
      expect(RECOMMENDED[d]?.key).toBeTruthy();
      expect(RECOMMENDED[d]?.why).toBeTruthy();
    }
  });
});
