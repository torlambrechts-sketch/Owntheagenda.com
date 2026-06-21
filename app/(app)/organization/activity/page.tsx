import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin, initials } from "@/lib/util";
import { createClient } from "@/lib/supabase/server";
import { OrgShell } from "@/components/OrgShell";

// Workspace activity — a read-only accountability log for admins, surfaced from
// the existing append-only audit_log (admin-only via RLS). Captures the
// assessment, workshop, membership and workspace lifecycle events written by
// the SECURITY DEFINER helpers across the app.

const ACTION_LABEL: Record<string, string> = {
  "assessment.opened": "Assessment opened",
  "assessment.closed": "Assessment closed",
  "workshop.created": "Workshop created",
  "workshop.quickstarted": "Workshop quick-started",
  "workshop.scheduled": "Workshop scheduled",
  "session.started": "Session started",
  "session.completed": "Session completed",
  "pulse.opened": "Pulse opened",
  "pulse.closed": "Pulse closed",
  "pulse.reminded": "Pulse reminder sent",
  "workspace.created": "Workspace created",
  "membership.join": "Member joined",
  "member.erased": "Member erased",
  "invitation.created": "Invitation sent",
  "invitation.accepted": "Invitation accepted",
};

// Tone the dot by the entity the event touches.
function dotColor(entityType: string | null): string {
  switch (entityType) {
    case "survey": return "var(--role)";
    case "workshop": return "var(--green)";
    case "pulse": return "var(--amber)";
    case "invitation":
    case "membership":
    case "profile": return "var(--rust)";
    default: return "var(--muted)";
  }
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function dayKey(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

export default async function OrganizationActivityPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/dashboard");
  const supabase = createClient();

  const range = RANGES.find((r) => r.key === searchParams.range) ?? RANGES[1]; // default 30 days
  let q = supabase
    .from("audit_log")
    .select("id, action, actor_id, entity_type, metadata, created_at")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (range.days != null) {
    const since = new Date(Date.now() - range.days * 86400000).toISOString();
    q = q.gte("created_at", since);
  }
  const { data: events } = await q;
  const rows = events ?? [];

  const actorIds = Array.from(new Set(rows.map((e) => e.actor_id).filter((x): x is string => !!x)));
  const { data: profs } = actorIds.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Someone"]));

  // Group by day for a scannable timeline.
  const groups: { day: string; items: typeof rows }[] = [];
  for (const e of rows) {
    const day = dayKey(e.created_at as string);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <OrgShell active="activity" isAdmin subtitle="An accountability log of assessment, workshop and membership events across the workspace.">
      <div className="orgact-filters">
        {RANGES.map((r) => (
          <a key={r.key} href={`/organization/activity?range=${r.key}`} className={`orgact-pill${r.key === range.key ? " on" : ""}`}>{r.label}</a>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="empty">No activity in the last {range.label.toLowerCase()}. Events appear here as assessments and workshops are run.</div>
      ) : (
        <div className="orgact">
          {groups.map((g) => (
            <div className="orgact-group" key={g.day}>
              <div className="orgact-day">{g.day}</div>
              {g.items.map((e) => {
                const actor = e.actor_id ? nameById.get(e.actor_id as string) ?? "Someone" : "System";
                const n = (e.metadata as { measures?: number } | null)?.measures;
                const suffix = e.action === "session.completed" && typeof n === "number"
                  ? ` · ${n} ${n === 1 ? "measure" : "measures"}` : "";
                return (
                  <div className="orgact-row" key={e.id}>
                    <span className="av sm" aria-hidden style={{ background: dotColor(e.entity_type as string | null) }}>{initials(actor)}</span>
                    <div className="orgact-body">
                      <div className="orgact-l">
                        <span className="orgact-actor">{actor}</span> {ACTION_LABEL[e.action as string] ?? (e.action as string)}{suffix}
                      </div>
                      <div className="orgact-m">{fmtWhen(e.created_at as string)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </OrgShell>
  );
}
