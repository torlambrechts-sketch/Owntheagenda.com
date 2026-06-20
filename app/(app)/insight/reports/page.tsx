import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

// Workspace-wide list of session readouts + shareable reports. Pure server
// component; like Health it spans every team, so scoped facilitators don't get it.
export default async function ReportsPage() {
  const { workspace, role } = await requireSession();
  if (role === "facilitator") redirect("/dashboard");
  const supabase = createClient();

  // Sessions across the workspace (mirrors the workshops page sessions fetch).
  const { data: sessionRows } = await supabase
    .from("session")
    .select("id, workshop_id, status, started_at, ended_at, share_token, shared_at")
    .eq("workspace_id", workspace.id)
    .order("started_at", { ascending: false })
    .limit(100);
  const sList = sessionRows ?? [];

  // Join workshop title + team name (workshop -> team), like the workshops page.
  const wkIds = Array.from(new Set(sList.map((s) => s.workshop_id)));
  const { data: wks } = wkIds.length
    ? await supabase.from("workshop").select("id, title, team_id").in("id", wkIds)
    : { data: [] as { id: string; title: string; team_id: string }[] };
  const wkById = new Map((wks ?? []).map((w) => [w.id, w]));
  const teamIds = Array.from(new Set((wks ?? []).map((w) => w.team_id)));
  const { data: tms } = teamIds.length
    ? await supabase.from("team").select("id, name").in("id", teamIds)
    : { data: [] as { id: string; name: string }[] };
  const teamById = new Map((tms ?? []).map((t) => [t.id, t.name]));

  // Action-item count per session, for the "Actions" column.
  const sids = sList.map((s) => s.id);
  const { data: acts } = sids.length
    ? await supabase.from("action_item").select("session_id").in("session_id", sids)
    : { data: [] as { session_id: string | null }[] };
  const actCount = new Map<string, number>();
  for (const a of acts ?? []) if (a.session_id) actCount.set(a.session_id, (actCount.get(a.session_id) ?? 0) + 1);

  const rows = sList.map((s) => {
    const wk = wkById.get(s.workshop_id);
    return {
      id: s.id,
      title: wk?.title ?? "Workshop",
      team: wk ? teamById.get(wk.team_id) ?? null : null,
      when: s.started_at ?? s.ended_at ?? null,
      actions: actCount.get(s.id) ?? 0,
      status: s.status,
      shared: !!s.share_token,
    };
  });

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">Every session&apos;s readout — revisit outcomes and share them.</p>

      {rows.length === 0 ? (
        <div className="card empty">No readouts yet — run a workshop to produce your first session readout.</div>
      ) : (
        <div className="tbl-card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Workshop</th>
                <th>Team</th>
                <th>When</th>
                <th style={{ width: 90 }}>Actions</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 90 }}>Shared</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/sessions/${r.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                      {r.title}
                    </Link>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{r.team ?? "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDate(r.when)}</td>
                  <td>{r.actions}</td>
                  <td>
                    <span className={`pill sm ${r.status === "live" ? "open" : "draft"}`}>{r.status}</span>
                  </td>
                  <td>
                    {r.shared ? (
                      <Link href={`/sessions/${r.id}`} className="pill sm open" style={{ textDecoration: "none" }}>
                        Shared
                      </Link>
                    ) : (
                      <span style={{ color: "var(--faint)" }}>—</span>
                    )}
                  </td>
                  <td className="r">
                    <Link className="linkbtn" href={`/sessions/${r.id}`}>
                      Readout
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
