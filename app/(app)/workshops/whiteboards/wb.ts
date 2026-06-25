// Shared, framework-light whiteboard helpers: the object shape used across the
// gallery preview + editor, the accent palette, and pure SVG geometry for
// shapes/connectors. Pixel coordinates throughout (unlike the run canvas which
// is normalised 0..1).

export type WBObject = {
  id: string;
  kind: string; // note | text | rect | roundrect | pill | ellipse | diamond | triangle | hexagon | parallelogram | star | connector | pen | marker
  text: string;
  fill: string | null;
  stroke: string | null;
  color: string | null;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  fontSize: number | null;
  points: number[][] | null;
  width: number | null; // stroke width for pen/marker
  opacity: number | null;
  variant: string | null;
  srcId: string | null;
  dstId: string | null;
  lineStyle: string | null;
  z: number;
  comments: WBComment[];
  reactions: Record<string, number>;
  authorId: string | null;
  authorName: string | null;
};

export type WBComment = {
  id: string;
  author: string;
  text: string;
  ts: number;
};

export const ACCENT_HEX: Record<string, string> = {
  green: "#3f7d5a",
  amber: "#a16207",
  violet: "#6d28d9",
  cyan: "#0e7490",
  blue: "#1d4ed8",
};
export const accentHex = (a: string) => ACCENT_HEX[a] ?? "#3f7d5a";

export const NOTE_FILLS: string[] = [
  "#fef9c3", "#dcfce7", "#dbeafe", "#fce7f3", "#fed7aa", "#e9d5ff", "#ffffff",
];
export const SHAPE_FILLS: string[] = [
  "#ffffff", "#eff6ff", "#e7efe9", "#fefce8", "#fef2f0", "#f5f3ff", "#f3f4f1",
];
export const STROKE_SWATCHES: string[] = [
  "#33312a", "#3a4d3f", "#a8543b", "#1d4ed8", "#3f7d5a", "#a16207",
];

export const NODE_KINDS = new Set([
  "note", "text", "rect", "roundrect", "pill", "ellipse", "diamond",
  "triangle", "hexagon", "parallelogram", "star",
]);
export const SHAPE_KINDS = new Set([
  "rect", "roundrect", "pill", "ellipse", "diamond", "triangle",
  "hexagon", "parallelogram", "star",
]);
export const isNode = (k: string) => NODE_KINDS.has(k);

export const DEFAULT_W: Record<string, number> = {
  note: 160, text: 180, rect: 160, roundrect: 160, pill: 170, ellipse: 150,
  diamond: 140, triangle: 140, hexagon: 150, parallelogram: 160, star: 130,
};
export const DEFAULT_H: Record<string, number> = {
  note: 110, text: 48, rect: 96, roundrect: 96, pill: 70, ellipse: 110,
  diamond: 100, triangle: 120, hexagon: 110, parallelogram: 96, star: 120,
};

export function objW(o: { kind: string; w: number | null }): number {
  return o.w ?? DEFAULT_W[o.kind] ?? 150;
}
export function objH(o: { kind: string; h: number | null }): number {
  return o.h ?? DEFAULT_H[o.kind] ?? 96;
}

// CSS clip-path for the polygonal shapes; border-radius covers the rounded set.
export const CLIP_PATHS: Record<string, string> = {
  diamond: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
  triangle: "polygon(50% 0,100% 100%,0 100%)",
  hexagon: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)",
  parallelogram: "polygon(25% 0,100% 0,75% 100%,0 100%)",
  star: "polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
};

export function radiusOf(kind: string, h: number): number | string {
  if (kind === "rect") return 4;
  if (kind === "roundrect") return 14;
  if (kind === "pill") return Math.round(h / 2);
  if (kind === "ellipse") return "50%";
  return 0;
}

// Edge anchor on the nearest side of rect [cx,cy] toward target point.
export function edgePoint(
  o: { x: number; y: number; w: number | null; h: number | null; kind: string },
  toward: { x: number; y: number },
): { x: number; y: number } {
  const w = objW(o), h = objH(o);
  const cx = o.x + w / 2, cy = o.y + h / 2;
  const dx = toward.x - cx, dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : (w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

// Connector path between two node centres, clipped to their edges.
export function connectorD(
  src: { x: number; y: number; w: number | null; h: number | null; kind: string },
  dst: { x: number; y: number; w: number | null; h: number | null; kind: string },
  style: string,
): { d: string; tip: { x: number; y: number }; ang: number } {
  const sc = { x: src.x + objW(src) / 2, y: src.y + objH(src) / 2 };
  const dc = { x: dst.x + objW(dst) / 2, y: dst.y + objH(dst) / 2 };
  const s = edgePoint(src, dc);
  const e = edgePoint(dst, sc);
  let d: string;
  let ctrl = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
  if (style === "straight") {
    d = `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
  } else if (style === "elbow" || style === "bent") {
    const mx = (s.x + e.x) / 2;
    d = `M ${s.x} ${s.y} L ${mx} ${s.y} L ${mx} ${e.y} L ${e.x} ${e.y}`;
    ctrl = { x: mx, y: e.y };
  } else {
    // curved bezier (default)
    const dx = e.x - s.x;
    const c1 = { x: s.x + dx * 0.5, y: s.y };
    const c2 = { x: e.x - dx * 0.5, y: e.y };
    d = `M ${s.x} ${s.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${e.x} ${e.y}`;
    ctrl = c2;
  }
  const ang = Math.atan2(e.y - ctrl.y, e.x - ctrl.x);
  return { d, tip: e, ang };
}

export const EMOJI = ["👍", "❤️", "🎉", "😀", "🤔", "🚀"];

// DB row (snake_case) → WBObject. Tolerant of partially-typed Insert/Update rows.
export function mapRow(r: Record<string, unknown>): WBObject {
  return {
    id: r.id as string,
    kind: (r.kind as string) ?? "note",
    text: (r.text as string) ?? "",
    fill: (r.fill as string) ?? null,
    stroke: (r.stroke as string) ?? null,
    color: (r.color as string) ?? null,
    x: Number(r.x ?? 0),
    y: Number(r.y ?? 0),
    w: r.w == null ? null : Number(r.w),
    h: r.h == null ? null : Number(r.h),
    fontSize: r.font_size == null ? null : Number(r.font_size),
    points: (r.points as number[][]) ?? null,
    width: r.width == null ? null : Number(r.width),
    opacity: r.opacity == null ? null : Number(r.opacity),
    variant: (r.variant as string) ?? null,
    srcId: (r.src_id as string) ?? null,
    dstId: (r.dst_id as string) ?? null,
    lineStyle: (r.line_style as string) ?? null,
    z: Number(r.z ?? 0),
    comments: Array.isArray(r.comments) ? (r.comments as WBComment[]) : [],
    reactions: (r.reactions && typeof r.reactions === "object" ? r.reactions : {}) as Record<string, number>,
    authorId: (r.author_id as string) ?? null,
    authorName: (r.author_name as string) ?? null,
  };
}
