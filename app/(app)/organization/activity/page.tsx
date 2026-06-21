import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin, initials } from "@/lib/util";
import { createClient } from "@/lib/supabase/server";
import { OrgShell } from "@/components/OrgShell";

// Workspace activity — a read-only accountability log for admins, surfaced from
// the existing append-only audit_log (admin-only via RLS). Filterable by date
// range, event category and actor — all server-side via querystring (no client
// JS): the filter bar is a plain GET form.

const ACTION_LABEL: Record<string, string> = {
  "assessment.opened": "Assessment opened",
  "assessment.closed": "Assessment closed",
  "assessment.reminded": "Assessment reminder sent",
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

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

// Event categories → the action prefixes they cover (PostgREST `like` filters).
const CATEGORIES: { key: string; label: string; likes: string[] }[] = [
  { key: "all", label: "All events", likes: [] },
  { key: "assessment", label: "Assessments", likes: ["assessment.%"] },
  { key: "workshop", label: "Workshops & sessions", likes: ["workshop.%", "session.%"] },
  { key: "pulse", label: "Pulses", likes: ["pulse.%"] },
  { key: "member", label: "Members", likes: ["member.%", "membership.%", "invitation.%"] },
  { key: "workspace", label: "Workspace", likes: ["workspace.%"] },
];

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

export default async function OrganizationActivityPage({
  searchParams,
}: {
  searchParams: { range?: string; type?: string; actor?: string };
}) {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/dashboard");
  const supabase = createClient();

  const range = RANGES.find((r) => r.key === searchParams.range) ?? RANGES[1]; // default 30 days
  const category = CATEGORIES.find((c) => c.key === searchParams.type) ?? CATEGORIES[0];
  const actorFilter = searchParams.actor && searchParams.actor !== "all" ? searchParams.actor : null;

  // Active workspace members for the actor dropdown.
  const { data: mem } = await supabase
    .from("membership")
    .select("user_id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", "active");
  const memberIds = (mem ?? []).map((m) => m.user_id as string);
  const { data: memberProfs } = memberIds.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", memberIds)
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const members = (memberProfs ?? [])
    .map((p) => ({ id: p.id, name: p.full_name || p.display_name || p.email || "Member" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let q = supabase
    .from("audit_log")
    .select("id, action, actor_id, entity_type, metadata, created_at")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (range.days != null) q = q.gte("created_at", new Date(Date.now() - range.days * 86400000).toISOString());
  if (category.likes.length) q = q.or(category.likes.map((l) => `action.like.${l}`).join(","));
  if (actorFilter) q = q.eq("actor_id", actorFilter);
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

  const filtered = category.key !== "all" || actorFilter;

  return (
    <OrgShell active="activity" isAdmin subtitle="An accountability log of assessment, workshop and membership events across the workspace.">
      <form className="orgact-bar" method="get">
        <label className="orgact-f">
          <span>Range</span>
          <select className="inp sm" name="range" defaultValue={range.key}>
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="orgact-f">
          <span>Event</span>
          <select className="inp sm" name="type" defaultValue={category.key}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className="orgact-f">
          <span>Person</span>
          <select className="inp sm" name="actor" defaultValue={actorFilter ?? "all"}>
            <option value="all">Everyone</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <button className="btn-sec" type="submit">Apply</button>
      </form>

      {rows.length === 0 ? (
        <div className="empty">
          No {filtered ? "matching " : ""}activity in {range.days == null ? "the log" : range.label.toLowerCase()}.
          {filtered ? <> <a className="linkbtn" href="/organization/activity">Clear filters</a></> : " Events appear here as assessments and workshops are run."}
        </div>
      ) : (
        <div className="orgact">
          {groups.map((g) => (
            <div className="orgact-group" key={g.day}>
              <div className="orgact-day">{g.day}</div>
              {g.items.map((e) => {
                const actor = e.actor_id ? nameById.get(e.actor_id as string) ?? "Someone" : "System";
                const meta = e.metadata as { measures?: number; pending?: number } | null;
                let suffix = "";
                if (e.action === "session.completed" && typeof meta?.measures === "number") suffix = ` · ${meta.measures} ${meta.measures === 1 ? "measure" : "measures"}`;
                else if ((e.action === "assessment.reminded" || e.action === "pulse.reminded") && typeof meta?.pending === "number") suffix = ` · ${meta.pending} pending`;
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
