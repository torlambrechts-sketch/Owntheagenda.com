import type { Enums } from "@/types/database.types";

// Workspace-wide control: organization settings, people, integrations, GDPR.
export function isAdmin(role: Enums<"workspace_role">) {
  return role === "owner" || role === "admin";
}
// Can lead/run teams (a Team Manager and everyone above).
export function isManagerOrAbove(role: Enums<"workspace_role">) {
  return role === "owner" || role === "admin" || role === "manager";
}

// Business-facing names for the workspace roles.
export const ROLE_LABEL: Record<Enums<"workspace_role">, string> = {
  owner: "Owner",
  admin: "Company Admin",
  manager: "Team Manager",
  facilitator: "Facilitator",
  member: "Employee",
};

// Roles an admin can hand out (owner is granted via a separate, deliberate step).
export const ROLE_OPTIONS: { value: Enums<"workspace_role">; label: string; blurb: string }[] = [
  { value: "admin", label: "Company Admin", blurb: "Runs the organization — people, settings, integrations" },
  { value: "manager", label: "Team Manager", blurb: "Leads and runs their teams' workshops" },
  { value: "facilitator", label: "Facilitator", blurb: "Runs sessions; can be external, sees only assigned work" },
  { value: "member", label: "Employee", blurb: "Takes part in workshops and assessments" },
];

export function initials(name?: string | null, fallback = "?") {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || fallback;
}

export function roleLabel(role: Enums<"workspace_role">) {
  return ROLE_LABEL[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

// Coarse relative time — compute server-side so it's stable across hydration.
export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
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
  retrospective: { label: "Retrospective", cls: "t-feedback" },
  hmw: { label: "How might we", cls: "t-brainstorm" },
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

// 1 → "1st", 2 → "2nd", 72 → "72nd". For benchmark percentile labels.
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
