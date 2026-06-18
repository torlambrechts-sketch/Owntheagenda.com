// Static, dependency-free re-render of a saved canvas (snapshot data or live
// objects) as a single self-contained SVG — used for the readout preview and as
// the source for client-side PNG export. Pure (no hooks/handlers) so it renders
// in both server and client trees. Geometry matches the live board via lib/canvas.
import {
  rectOf, anchorPt, connectorPath, normalOf, fillHex, strokeHex,
  SHAPE_KINDS, type Side, type Pt,
} from "@/lib/canvas";

export type CanvasObj = {
  id: string;
  kind: string;
  text?: string | null;
  color?: string | null;
  x: number;
  y: number;
  w?: number | null;
  h?: number | null;
  points?: number[][] | null;
  src_id?: string | null;
  dst_id?: string | null;
  src_anchor?: string | null;
  dst_anchor?: string | null;
  line_style?: string | null;
  stroke?: string | null;
  fill?: string | null;
  stroke_w?: number | null;
  variant?: string | null;
  z?: number | null;
  author_name?: string | null;
};

export const CANVAS_W = 1000;
export const CANVAS_H = 700;
const FONT = "Inter, system-ui, -apple-system, Segoe UI, sans-serif";

// Rasterize a rendered CanvasStatic <svg> to a PNG download. The SVG is
// self-contained, so it draws onto a canvas without tainting — no dependency.
// Browser-only (call from a client handler).
export function canvasSvgToPng(svg: SVGSVGElement, name: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(CANVAS_W));
  clone.setAttribute("height", String(CANVAS_H));
  clone.removeAttribute("style");
  const xml = new XMLSerializer().serializeToString(clone);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const c = document.createElement("canvas");
    c.width = CANVAS_W * scale;
    c.height = CANVAS_H * scale;
    const cx = c.getContext("2d");
    if (!cx) return;
    cx.fillStyle = "#fbfaf5";
    cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `${name}.png`;
      a.click();
      URL.revokeObjectURL(u);
    }, "image/png");
  };
  img.src = url;
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const joined = lines.join(" ");
  if (joined.length < words.join(" ").length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/.{1}$/, "…");
  }
  return lines;
}

function arrowPoints(tip: Pt, dir: Pt, size = 12): string {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const px = -uy;
  const py = ux;
  const bx = tip.x - ux * size;
  const by = tip.y - uy * size;
  const w = size * 0.5;
  return `${tip.x},${tip.y} ${bx + px * w},${by + py * w} ${bx - px * w},${by - py * w}`;
}

function classify(o: CanvasObj): "drawing" | "connector" | "shape" | null {
  if (o.points && o.points.length > 1) return "drawing";
  if (o.src_id && o.dst_id) return "connector";
  if (SHAPE_KINDS.has(o.kind)) return "shape";
  return null;
}

function Shape({ o }: { o: CanvasObj }) {
  const r = rectOf({ kind: o.kind, x: o.x, y: o.y, w: o.w ?? null, h: o.h ?? null }, CANVAS_W, CANVAS_H);
  const stroke = strokeHex(o.stroke ?? "ink");
  const sw = o.stroke_w ?? 2;
  const text = o.text ?? "";

  if (o.kind === "sticky") {
    const lines = wrapLines(text, 20, 5);
    return (
      <g>
        <rect x={r.left} y={r.top} width={r.w} height={r.h} rx={8} fill={fillHex(o.color ?? "lemon")} stroke="#d8cba0" strokeWidth={1} />
        <text x={r.left + 12} y={r.top + 26} fontFamily={FONT} fontSize={15} fill="#33312a">
          {lines.map((ln, i) => (
            <tspan key={i} x={r.left + 12} dy={i === 0 ? 0 : 19}>{ln}</tspan>
          ))}
        </text>
        {o.author_name ? (
          <text x={r.left + 12} y={r.bottom - 9} fontFamily={FONT} fontSize={10} fill="#8a8475">{o.author_name.split(" ")[0]}</text>
        ) : null}
      </g>
    );
  }

  const fill = o.fill && o.fill !== "none" ? fillHex(o.fill) : "none";
  const label = text ? (
    <text x={r.cx} y={r.cy + 5} textAnchor="middle" fontFamily={FONT} fontSize={14} fill="#33312a">
      {wrapLines(text, 24, 3).map((ln, i, a) => (
        <tspan key={i} x={r.cx} dy={i === 0 ? -(a.length - 1) * 8 : 16}>{ln}</tspan>
      ))}
    </text>
  ) : null;

  if (o.kind === "ellipse") {
    return <g><ellipse cx={r.cx} cy={r.cy} rx={r.w / 2} ry={r.h / 2} fill={fill} stroke={stroke} strokeWidth={sw} />{label}</g>;
  }
  if (o.kind === "diamond") {
    const pts = `${r.cx},${r.top} ${r.right},${r.cy} ${r.cx},${r.bottom} ${r.left},${r.cy}`;
    return <g><polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />{label}</g>;
  }
  if (o.kind === "text") {
    return (
      <text x={r.cx} y={r.cy + 5} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={600} fill="#33312a">
        {wrapLines(text, 28, 4).map((ln, i, a) => (
          <tspan key={i} x={r.cx} dy={i === 0 ? -(a.length - 1) * 9 : 18}>{ln}</tspan>
        ))}
      </text>
    );
  }
  // rect (default)
  return <g><rect x={r.left} y={r.top} width={r.w} height={r.h} rx={6} fill={fill} stroke={stroke} strokeWidth={sw} />{label}</g>;
}

function Line({ o, byId }: { o: CanvasObj; byId: Map<string, CanvasObj> }) {
  if (o.points && o.points.length > 1) {
    const pts = o.points.map((p) => `${p[0] * CANVAS_W},${p[1] * CANVAS_H}`).join(" ");
    const marker = o.variant === "marker";
    return (
      <polyline
        points={pts}
        fill="none"
        stroke={strokeHex(o.stroke ?? "ink")}
        strokeWidth={(o.stroke_w ?? 2.5) * (marker ? 2.4 : 1)}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={marker ? 0.45 : 1}
      />
    );
  }
  const src = o.src_id ? byId.get(o.src_id) : undefined;
  const dst = o.dst_id ? byId.get(o.dst_id) : undefined;
  if (!src || !dst) return null;
  const rs = rectOf({ kind: src.kind, x: src.x, y: src.y, w: src.w ?? null, h: src.h ?? null }, CANVAS_W, CANVAS_H);
  const rd = rectOf({ kind: dst.kind, x: dst.x, y: dst.y, w: dst.w ?? null, h: dst.h ?? null }, CANVAS_W, CANVAS_H);
  const ss = (o.src_anchor as Side) ?? "e";
  const ds = (o.dst_anchor as Side) ?? "w";
  const sPt = anchorPt(rs, ss);
  const dPt = anchorPt(rd, ds);
  const style = o.line_style ?? "straight";
  const path = connectorPath(style, sPt, ss, dPt, ds);
  const stroke = strokeHex(o.stroke ?? "ink");
  const dir = style === "straight"
    ? { x: dPt.x - sPt.x, y: dPt.y - sPt.y }
    : { x: -normalOf(ds).x, y: -normalOf(ds).y };
  return (
    <g>
      <path d={path} fill="none" stroke={stroke} strokeWidth={o.stroke_w ?? 2} />
      <polygon points={arrowPoints(dPt, dir)} fill={stroke} />
    </g>
  );
}

export function CanvasStatic({ objects, className }: { objects: CanvasObj[]; className?: string }) {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const ordered = [...objects].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const lines = ordered.filter((o) => { const c = classify(o); return c === "drawing" || c === "connector"; });
  const shapes = ordered.filter((o) => classify(o) === "shape");
  return (
    <svg
      className={className}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      style={{ background: "#fbfaf5", display: "block", width: "100%", height: "auto" }}
    >
      {lines.map((o) => <Line key={o.id} o={o} byId={byId} />)}
      {shapes.map((o) => <Shape key={o.id} o={o} />)}
    </svg>
  );
}
