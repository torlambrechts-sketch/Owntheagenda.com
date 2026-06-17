import { describe, it, expect } from "vitest";
import {
  rectOf,
  anchorPt,
  nearestSide,
  connectorPath,
  fillHex,
  strokeHex,
  clamp01,
  cursorColor,
  snapToGrid,
  distToSegment,
  rectsIntersect,
  CURSOR_COLORS,
} from "@/lib/canvas";

const box = (left: number, top: number, right: number, bottom: number) => ({ cx: 0, cy: 0, w: 0, h: 0, left, top, right, bottom });

const BW = 1000;
const BH = 800;

describe("rectOf", () => {
  it("uses a fixed pixel size for stickies, centered on (x,y)", () => {
    const r = rectOf({ kind: "sticky", x: 0.5, y: 0.5, w: null, h: null }, BW, BH);
    expect(r.cx).toBe(500);
    expect(r.cy).toBe(400);
    expect(r.w).toBe(160);
    expect(r.left).toBe(500 - 80);
    expect(r.right).toBe(500 + 80);
  });

  it("derives shape size from normalized w/h", () => {
    const r = rectOf({ kind: "rect", x: 0.5, y: 0.5, w: 0.2, h: 0.1 }, BW, BH);
    expect(r.w).toBe(200);
    expect(r.h).toBe(80);
    expect(r.top).toBe(400 - 40);
  });
});

describe("anchorPt", () => {
  const r = rectOf({ kind: "rect", x: 0.5, y: 0.5, w: 0.2, h: 0.1 }, BW, BH); // 200x80 @ (500,400)
  it("returns the midpoint of each edge", () => {
    expect(anchorPt(r, "n")).toEqual({ x: 500, y: 360 });
    expect(anchorPt(r, "s")).toEqual({ x: 500, y: 440 });
    expect(anchorPt(r, "e")).toEqual({ x: 600, y: 400 });
    expect(anchorPt(r, "w")).toEqual({ x: 400, y: 400 });
  });
});

describe("nearestSide", () => {
  const r = rectOf({ kind: "rect", x: 0.5, y: 0.5, w: 0.2, h: 0.1 }, BW, BH);
  it("prefers the horizontal edge for a point to the right", () => {
    expect(nearestSide(r, { x: 900, y: 410 })).toBe("e");
    expect(nearestSide(r, { x: 100, y: 390 })).toBe("w");
  });
  it("prefers the vertical edge for a point clearly above/below", () => {
    expect(nearestSide(r, { x: 505, y: 50 })).toBe("n");
    expect(nearestSide(r, { x: 495, y: 750 })).toBe("s");
  });
});

describe("connectorPath", () => {
  const s = { x: 100, y: 100 };
  const d = { x: 300, y: 300 };
  it("draws a straight line", () => {
    expect(connectorPath("straight", s, "e", d, "w")).toBe("M 100 100 L 300 300");
  });
  it("uses a cubic bezier for curved", () => {
    const p = connectorPath("curved", s, "e", d, "w");
    expect(p.startsWith("M 100 100 C")).toBe(true);
    expect(p.trim().endsWith("300 300")).toBe(true);
  });
  it("uses quadratic corners for rounded and still reaches the destination", () => {
    const p = connectorPath("rounded", s, "e", d, "w");
    expect(p).toContain("Q");
    expect(p.startsWith("M 100 100")).toBe(true);
    expect(p.trim().endsWith("300 300")).toBe(true);
  });
});

describe("colour helpers", () => {
  it("maps known tokens and falls back safely", () => {
    expect(fillHex("mint")).toBe("#cbe7d4");
    expect(fillHex("nope")).toBe("#f3e3a6");
    expect(strokeHex("rust")).toBe("#a8543b");
    expect(strokeHex("nope")).toBe("#33312a");
  });
});

describe("clamp01", () => {
  it("keeps positions just inside the board", () => {
    expect(clamp01(-1)).toBeCloseTo(0.015);
    expect(clamp01(2)).toBeCloseTo(0.985);
    expect(clamp01(0.5)).toBe(0.5);
  });
});

describe("cursorColor", () => {
  it("is deterministic and within the palette", () => {
    expect(cursorColor("Mathias")).toBe(cursorColor("Mathias"));
    expect(CURSOR_COLORS).toContain(cursorColor("Ingrid"));
  });
});

describe("snapToGrid", () => {
  it("rounds to the nearest grid step", () => {
    expect(snapToGrid(20, 16)).toBe(16);
    expect(snapToGrid(25, 16)).toBe(32);
    expect(snapToGrid(0)).toBe(0);
  });
});

describe("distToSegment", () => {
  it("measures perpendicular distance and clamps to endpoints", () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
    expect(distToSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
    expect(distToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
  });
});

describe("rectsIntersect", () => {
  it("detects overlap and separation", () => {
    expect(rectsIntersect(box(0, 0, 10, 10), box(5, 5, 15, 15))).toBe(true);
    expect(rectsIntersect(box(0, 0, 10, 10), box(20, 20, 30, 30))).toBe(false);
    expect(rectsIntersect(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false);
  });
});
