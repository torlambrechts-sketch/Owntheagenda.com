import type { ReactNode } from "react";

// Exact palette + iconography from the Workshop App handoff. Kept in one place
// so every faithful surface (home, run, results, schedule) shares it.

// ----- lucide-style stroke icons (24x24) used across the workshop surfaces -----
const PATHS: Record<string, ReactNode> = {
  Compass: (<><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></>),
  Map: (<><path d="M14.1 5.5a2 2 0 0 0 1.8 0l3.6-1.8A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.6 1.8A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0z" /><path d="M15 5.8v15" /><path d="M9 3.2v15" /></>),
  Target: (<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>),
  RefreshCcw: (<><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></>),
  Gavel: (<><path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8" /><path d="m16 16 6-6" /><path d="m8 8 6-6" /><path d="m9 7 8 8" /><path d="m21 11-8-8" /></>),
  HeartHandshake: (<><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></>),
  Sparkles: (<><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" /></>),
  Users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  Flag: (<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" /></>),
  Lightbulb: (<><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></>),
  ListTodo: (<><rect x="3" y="5" width="6" height="6" rx="1" /><path d="m3 17 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></>),
  TrendingUp: (<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>),
  Plus: (<><path d="M5 12h14" /><path d="M12 5v14" /></>),
  Search: (<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
  List: (<><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></>),
  LayoutGrid: (<><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>),
  PenLine: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  PenTool: (<><path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z" /><path d="m2 2 7.586 7.586" /><circle cx="11" cy="11" r="2" /></>),
  Play: (<><polygon points="6 3 20 12 6 21 6 3" /></>),
  ChartColumnBig: (<><path d="M3 3v16a2 2 0 0 0 2 2h16" /><rect x="7" y="13" width="3" height="5" rx="1" /><rect x="12" y="9" width="3" height="9" rx="1" /><rect x="17" y="5" width="3" height="13" rx="1" /></>),
  Calendar: (<><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>),
  CalendarPlus: (<><path d="M8 2v4" /><path d="M16 2v4" /><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" /><path d="M3 10h18" /><path d="M16 19h6" /><path d="M19 16v6" /></>),
  ChevronRight: (<><path d="m9 18 6-6-6-6" /></>),
  ArrowRight: (<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
  ArrowLeft: (<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>),
  Clock: (<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
  Layers: (<><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 12.5-9.17 4.16a2 2 0 0 1-1.66 0L2 12.5" /><path d="m22 17.5-9.17 4.16a2 2 0 0 1-1.66 0L2 17.5" /></>),
  MoreHorizontal: (<><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>),
  FileEdit: (<><path d="M4 13.5V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2h-5.5" /><polyline points="14 2 14 8 20 8" /><path d="M10.42 12.61a2.1 2.1 0 1 1 2.97 2.97L7.95 21 4 22l.99-3.95 5.43-5.44Z" /></>),
  X: (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  Check: (<><path d="M20 6 9 17l-5-5" /></>),
};

export function Icon({ name, size = 16, color = "currentColor", sw = 1.75 }: { name: string; size?: number; color?: string; sw?: number }) {
  const node = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: "inline-block" }}
      aria-hidden
    >
      {node ?? null}
    </svg>
  );
}

// ----- per-template-category visual identity (icon + exact handoff colors) -----
export type CatVis = { icon: string; accent: string; tint: string; border: string };
export const CAT_VIS: Record<string, CatVis> = {
  team: { icon: "Compass", accent: "#1a3d32", tint: "#e7efe9", border: "#c5d3c8" },
  strategy: { icon: "Map", accent: "#1d4ed8", tint: "#eff6ff", border: "#bfdbfe" },
  prioritization: { icon: "Target", accent: "#0e7490", tint: "#ecfeff", border: "#a5f3fc" },
  retro: { icon: "RefreshCcw", accent: "#6d28d9", tint: "#f5f3ff", border: "#ddd6fe" },
  ideation: { icon: "Lightbulb", accent: "#6d28d9", tint: "#f5f3ff", border: "#ddd6fe" },
  design: { icon: "Sparkles", accent: "#a16207", tint: "#fefce8", border: "#fde68a" },
  kickoff: { icon: "Flag", accent: "#1d4ed8", tint: "#eff6ff", border: "#bfdbfe" },
  checkin: { icon: "HeartHandshake", accent: "#3f7d5a", tint: "#eef4ef", border: "#cfe0d5" },
};
export function catVis(category: string | null | undefined): CatVis {
  return CAT_VIS[category ?? ""] ?? { icon: "Sparkles", accent: "#1a3d32", tint: "#e7efe9", border: "#c5d3c8" };
}

// ----- status pill visuals (live/scheduled/completed/draft) from the handoff ---
export type StatusVis = { label: string; bg: string; border: string; text: string; dot: string; live: boolean };
export const STATUS_VIS: Record<string, StatusVis> = {
  live: { label: "Live", bg: "#dcfce7", border: "#bbf7d0", text: "#166534", dot: "#16a34a", live: true },
  scheduled: { label: "Scheduled", bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", dot: "#2563eb", live: false },
  done: { label: "Completed", bg: "#f3f4f1", border: "#e8e6df", text: "#525252", dot: "#a3a3a3", live: false },
  draft: { label: "Draft", bg: "#faf9f5", border: "#ece9e1", text: "#a3a3a3", dot: "#cbd5d2", live: false },
};
export function statusVis(status: string): StatusVis {
  return STATUS_VIS[status] ?? STATUS_VIS.draft;
}

// Workshop App surface tokens (exact handoff hex).
export const WA = {
  accent: "#1a3d32",
  page: "#F9F7F2",
  kpiBg: "#F1ECDF",
  cardBg: "#ffffff",
  cardBorder: "#ece9e1",
  ink: "#171717",
  ink2: "#262626",
  muted: "#525252",
  faint: "#737373",
  faint2: "#a3a3a3",
  hair: "#f3f1ea",
  rowHair: "#f5f4ef",
  segBg: "#ece9e1",
  segBg2: "#f3f1ea",
  serif: "var(--font-display)",
};
