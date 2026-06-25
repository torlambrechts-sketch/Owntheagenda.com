import { CLIP_PATHS, connectorD, objH, objW, type WBObject } from "./wb";

// A non-interactive thumbnail of a board's objects, auto-fitted into a fixed
// viewBox. Used by both board cards and template cards in the gallery.
export function MiniPreview({ objects, width = 280, height = 150 }: { objects: WBObject[]; width?: number; height?: number }) {
  const nodes = objects.filter((o) => o.kind !== "connector" && o.kind !== "pen" && o.kind !== "marker");
  const strokes = objects.filter((o) => o.kind === "pen" || o.kind === "marker");
  const conns = objects.filter((o) => o.kind === "connector");
  const byId = new Map(objects.map((o) => [o.id, o]));

  // bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of nodes) {
    minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + objW(o)); maxY = Math.max(maxY, o.y + objH(o));
  }
  for (const o of strokes) for (const [px, py] of o.points ?? []) {
    minX = Math.min(minX, px); minY = Math.min(minY, py);
    maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
  }
  const empty = !isFinite(minX);
  const pad = 30;
  const vb = empty ? `0 0 ${width} ${height}` : `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;

  if (empty) {
    return (
      <svg viewBox={vb} width={width} height={height} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={13} fill="#c4c2b8">Empty board</text>
      </svg>
    );
  }

  return (
    <svg viewBox={vb} width={width} height={height} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
      {conns.map((c) => {
        const s = c.srcId ? byId.get(c.srcId) : null;
        const d = c.dstId ? byId.get(c.dstId) : null;
        if (!s || !d) return null;
        const { d: path } = connectorD(s, d, c.lineStyle ?? "curved");
        return <path key={c.id} d={path} fill="none" stroke={c.color ?? "#9a9a8e"} strokeWidth={2} />;
      })}
      {strokes.map((o) => (
        <polyline key={o.id} points={(o.points ?? []).map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none" stroke={o.color ?? "#33312a"} strokeWidth={o.width ?? 3}
          opacity={o.variant === "marker" ? 0.4 : 1} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {nodes.map((o) => <PreviewNode key={o.id} o={o} />)}
    </svg>
  );
}

function PreviewNode({ o }: { o: WBObject }) {
  const w = objW(o), h = objH(o);
  if (o.kind === "text") {
    return <text x={o.x} y={o.y + (o.fontSize ?? 16)} fontSize={o.fontSize ?? 16} fill={o.color ?? "#333"}>{o.text || "Text"}</text>;
  }
  if (o.kind === "note") {
    return (
      <g>
        <rect x={o.x} y={o.y} width={w} height={h} rx={4} fill={o.fill ?? "#fef9c3"} />
        {o.text ? <text x={o.x + 8} y={o.y + 22} fontSize={13} fill={o.color ?? "#5b5536"}>{o.text.slice(0, 16)}</text> : null}
      </g>
    );
  }
  const clip = CLIP_PATHS[o.kind];
  const fill = o.fill ?? "#fff";
  const stroke = o.stroke ?? "#cfcdc4";
  const rx = o.kind === "roundrect" ? 12 : o.kind === "pill" ? h / 2 : 0;
  if (o.kind === "ellipse") {
    return <ellipse cx={o.x + w / 2} cy={o.y + h / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={1.5} />;
  }
  if (clip) {
    return <polygon points={polyPoints(o.kind, o.x, o.y, w, h)} fill={fill} stroke={stroke} strokeWidth={1.5} />;
  }
  return <rect x={o.x} y={o.y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={1.5} />;
}

// SVG polygon points mirroring the CSS clip-paths (percentages → absolute).
function polyPoints(kind: string, x: number, y: number, w: number, h: number): string {
  const map: Record<string, number[][]> = {
    diamond: [[50, 0], [100, 50], [50, 100], [0, 50]],
    triangle: [[50, 0], [100, 100], [0, 100]],
    hexagon: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]],
    parallelogram: [[25, 0], [100, 0], [75, 100], [0, 100]],
    star: [[50, 0], [61, 35], [98, 35], [68, 57], [79, 91], [50, 70], [21, 91], [32, 57], [2, 35], [39, 35]],
  };
  return (map[kind] ?? []).map(([px, py]) => `${x + (px / 100) * w},${y + (py / 100) * h}`).join(" ");
}
