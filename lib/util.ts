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
