import type { Enums } from "@/types/database.types";

export function isAdmin(role: Enums<"workspace_role">) {
  return role === "owner" || role === "admin";
}

export function initials(name?: string | null, fallback = "?") {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || fallback;
}

export function roleLabel(role: Enums<"workspace_role">) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export const ACTIVITY: Record<string, { label: string; cls: string }> = {
  canvas: { label: "Canvas", cls: "t-canvas" },
  brainstorm: { label: "Brainstorm", cls: "t-brainstorm" },
  vote: { label: "Vote", cls: "t-vote" },
  feedback: { label: "Feedback", cls: "t-feedback" },
  discuss: { label: "Discuss", cls: "t-discuss" },
  checkin: { label: "Check-in", cls: "t-checkin" },
  outcome: { label: "Outcome", cls: "t-outcome" },
  manual: { label: "User manual", cls: "t-checkin" },
  charter: { label: "Charter", cls: "t-outcome" },
  assess: { label: "Assessment", cls: "t-vote" },
};

export const CATEGORY: Record<string, string> = {
  team: "Team effectiveness",
  retro: "Retrospectives",
  ideation: "Ideation",
  prioritization: "Prioritization",
  strategy: "Strategy",
  design: "Design thinking",
  kickoff: "Kickoffs",
  checkin: "Check-ins",
};

// "0:00", "0:10" cumulative clock labels for an agenda of durations (minutes)
export function clock(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
