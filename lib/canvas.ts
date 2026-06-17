// Pure geometry + styling helpers for the live canvas. Kept framework-free so
// the connector/anchor math can be unit-tested independently of React.

export type Pt = { x: number; y: number };
export type Side = "n" | "e" | "s" | "w";
export type Rect = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export const FILLS: [string, string][] = [
  ["lemon", "#f3e3a6"],
  ["mint", "#cbe7d4"],
  ["sky", "#cadcef"],
  ["blush", "#f1d3ca"],
  ["lilac", "#dcd2ec"],
  ["white", "#ffffff"],
];
export const STROKES: [string, string][] = [
  ["ink", "#33312a"],
  ["forest", "#3a4d3f"],
  ["rust", "#a8543b"],
  ["blue", "#42729e"],
  ["green", "#3f7d5a"],
];
export const fillHex = (t: string) => FILLS.find((f) => f[0] === t)?.[1] ?? "#f3e3a6";
export const strokeHex = (t: string) => STROKES.find((s) => s[0] === t)?.[1] ?? "#33312a";

export const SHAPE_KINDS = new Set(["sticky", "rect", "ellipse", "diamond", "text"]);
export const SIDES: Side[] = ["n", "e", "s", "w"];
export const STICKY_W = 160;
export const STICKY_H = 112;

export const clamp01 = (v: number) => Math.min(0.985, Math.max(0.015, v));

// Stable per-person cursor colour (live multiplayer presence).
export const CURSOR_COLORS = ["#3f7d5a", "#a8543b", "#42729e", "#8a6d3b", "#7a5c9e"];
export function cursorColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

// Snap a pixel coordinate to a grid (Shift bypasses at the call site).
export function snapToGrid(px: number, grid = 16): number {
  return Math.round(px / grid) * grid;
}

type Geom = { kind: string; x: number; y: number; w: number | null; h: number | null };

export function rectOf(o: Geom, bw: number, bh: number): Rect {
  const cx = o.x * bw;
  const cy = o.y * bh;
  const w = o.kind === "sticky" ? STICKY_W : (o.w ?? 0.16) * bw;
  const h = o.kind === "sticky" ? STICKY_H : (o.h ?? 0.12) * bh;
  return { cx, cy, w, h, left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}

export function anchorPt(r: Rect, side: Side): Pt {
  if (side === "n") return { x: r.cx, y: r.top };
  if (side === "s") return { x: r.cx, y: r.bottom };
  if (side === "e") return { x: r.right, y: r.cy };
  return { x: r.left, y: r.cy };
}

// Pick the edge a connector should attach to, given a point (aspect-aware so
// wide shapes prefer left/right and tall shapes prefer top/bottom).
export function nearestSide(r: Rect, p: Pt): Side {
  const dx = p.x - r.cx;
  const dy = p.y - r.cy;
  if (Math.abs(dx) * r.h > Math.abs(dy) * r.w) return dx > 0 ? "e" : "w";
  return dy > 0 ? "s" : "n";
}

export function normalOf(side: Side): Pt {
  if (side === "n") return { x: 0, y: -1 };
  if (side === "s") return { x: 0, y: 1 };
  if (side === "e") return { x: 1, y: 0 };
  return { x: -1, y: 0 };
}

// A polyline through `pts` with rounded corners of radius `r`.
export function roundedPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const l1 = Math.hypot(v1.x, v1.y) || 1;
    const l2 = Math.hypot(v2.x, v2.y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = { x: p1.x - (v1.x / l1) * rr, y: p1.y - (v1.y / l1) * rr };
    const b = { x: p1.x + (v2.x / l2) * rr, y: p1.y + (v2.y / l2) * rr };
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

// Build the SVG path for a connector in one of three routings.
export function connectorPath(style: string, s: Pt, ss: Side, d: Pt, ds: Side): string {
  if (style === "straight") return `M ${s.x} ${s.y} L ${d.x} ${d.y}`;
  const ns = normalOf(ss);
  const nd = normalOf(ds);
  const dist = Math.hypot(d.x - s.x, d.y - s.y);
  const off = Math.max(36, dist * 0.4);
  if (style === "curved") {
    const c1 = { x: s.x + ns.x * off, y: s.y + ns.y * off };
    const c2 = { x: d.x + nd.x * off, y: d.y + nd.y * off };
    return `M ${s.x} ${s.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${d.x} ${d.y}`;
  }
  const k = Math.min(off, dist / 2);
  const p1 = { x: s.x + ns.x * k, y: s.y + ns.y * k };
  const p2 = { x: d.x + nd.x * k, y: d.y + nd.y * k };
  return roundedPath([s, p1, p2, d], 12);
}
