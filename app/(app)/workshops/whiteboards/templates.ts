// Built-in whiteboard templates (the design's WB_TEMPLATES). Pure seed data:
// when a board is created from a template these elements are inserted as
// whiteboard_object rows (connectors resolve their temp from/to ids to the
// freshly-inserted object ids). Coordinates are the design's pixel space.

export type WBSeed = {
  id: string; // temp id, used to wire connectors; not persisted
  kind: string; // note | text | rect | roundrect | pill | ellipse | diamond | triangle | hexagon | parallelogram | star | connector
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fill?: string;
  stroke?: string;
  color?: string;
  fontSize?: number;
  from?: string; // connector source temp id
  to?: string; // connector dest temp id
  lineStyle?: string;
};

export type WBTemplate = {
  id: string;
  title: string;
  desc: string;
  accent: string;
  icon: string;
  els: WBSeed[];
};

export const WB_TEMPLATES: WBTemplate[] = [
  { id: "wt-blank", title: "Blank canvas", desc: "Start from an empty board.", accent: "green", icon: "square", els: [] },
  {
    id: "wt-brainstorm", title: "Brainstorm", desc: "Diverge fast with sticky notes.", accent: "amber", icon: "Sparkles",
    els: [
      { id: "b1", kind: "text", x: 60, y: 30, text: "How might we…?", color: "#a16207", fontSize: 24 },
      { id: "b2", kind: "note", x: 60, y: 90, w: 150, h: 90, text: "Idea", fill: "#fef9c3", color: "#5b5536" },
      { id: "b3", kind: "note", x: 230, y: 120, w: 150, h: 90, text: "Idea", fill: "#dcfce7", color: "#1a3d32" },
      { id: "b4", kind: "note", x: 400, y: 90, w: 150, h: 90, text: "Idea", fill: "#dbeafe", color: "#1d4ed8" },
    ],
  },
  {
    id: "wt-retro", title: "Retrospective", desc: "Start · Stop · Continue.", accent: "violet", icon: "RefreshCcw",
    els: [
      { id: "r1", kind: "text", x: 60, y: 30, text: "Start", color: "#3f7d5a", fontSize: 22 },
      { id: "r2", kind: "text", x: 300, y: 30, text: "Stop", color: "#b8584a", fontSize: 22 },
      { id: "r3", kind: "text", x: 540, y: 30, text: "Continue", color: "#1d4ed8", fontSize: 22 },
      { id: "r4", kind: "rect", x: 40, y: 70, w: 200, h: 300, text: "", fill: "#f1f6f2", stroke: "#cfe3d6", color: "#3f7d5a" },
      { id: "r5", kind: "rect", x: 280, y: 70, w: 200, h: 300, text: "", fill: "#fef2f0", stroke: "#e8cfca", color: "#b8584a" },
      { id: "r6", kind: "rect", x: 520, y: 70, w: 200, h: 300, text: "", fill: "#eff6ff", stroke: "#bfdbfe", color: "#1d4ed8" },
    ],
  },
  {
    id: "wt-mindmap", title: "Mind map", desc: "Branch out from a core idea.", accent: "cyan", icon: "Compass",
    els: [
      { id: "m1", kind: "ellipse", x: 300, y: 170, w: 160, h: 90, text: "Core idea", fill: "#e7efe9", stroke: "#1a3d32", color: "#1a3d32" },
      { id: "m2", kind: "note", x: 80, y: 60, w: 140, h: 80, text: "Branch", fill: "#fef9c3", color: "#5b5536" },
      { id: "m3", kind: "note", x: 560, y: 60, w: 140, h: 80, text: "Branch", fill: "#dbeafe", color: "#1d4ed8" },
      { id: "m4", kind: "note", x: 80, y: 300, w: 140, h: 80, text: "Branch", fill: "#fce7f3", color: "#9d2463" },
      { id: "m5", kind: "connector", from: "m1", to: "m2", color: "#737373" },
      { id: "m6", kind: "connector", from: "m1", to: "m3", color: "#737373" },
      { id: "m7", kind: "connector", from: "m1", to: "m4", color: "#737373" },
    ],
  },
  {
    id: "wt-flow", title: "Flowchart / IA", desc: "Map a flow or site structure.", accent: "blue", icon: "Map",
    els: [
      { id: "f1", kind: "rect", x: 80, y: 60, w: 150, h: 70, text: "Home", fill: "#eff6ff", stroke: "#1d4ed8", color: "#1d4ed8" },
      { id: "f2", kind: "rect", x: 340, y: 60, w: 150, h: 70, text: "Shop", fill: "#eff6ff", stroke: "#1d4ed8", color: "#1d4ed8" },
      { id: "f3", kind: "rect", x: 340, y: 200, w: 150, h: 70, text: "Product", fill: "#fff", stroke: "#94a3b8", color: "#475569" },
      { id: "f4", kind: "diamond", x: 120, y: 200, w: 130, h: 90, text: "Auth?", fill: "#fefce8", stroke: "#a16207", color: "#a16207" },
      { id: "f5", kind: "connector", from: "f1", to: "f2", color: "#737373" },
      { id: "f6", kind: "connector", from: "f2", to: "f3", color: "#737373" },
      { id: "f7", kind: "connector", from: "f1", to: "f4", color: "#737373" },
    ],
  },
  {
    id: "wt-matrix", title: "2×2 matrix", desc: "Prioritise on two axes.", accent: "green", icon: "Target",
    els: [
      { id: "x1", kind: "rect", x: 60, y: 60, w: 600, h: 380, text: "", fill: "#fff", stroke: "#e4e1d5", color: "#737373" },
      { id: "x2", kind: "text", x: 330, y: 30, text: "Impact ↑", color: "#8a8a7e", fontSize: 16 },
      { id: "x3", kind: "text", x: 330, y: 450, text: "Effort →", color: "#8a8a7e", fontSize: 16 },
      { id: "x4", kind: "note", x: 140, y: 120, w: 130, h: 80, text: "Quick win", fill: "#dcfce7", color: "#1a3d32" },
      { id: "x5", kind: "note", x: 460, y: 300, w: 130, h: 80, text: "Time sink", fill: "#fef2f0", color: "#b8584a" },
    ],
  },
];

export function wbTemplate(id: string): WBTemplate | undefined {
  return WB_TEMPLATES.find((t) => t.id === id);
}
