import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function SessionsPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const { data: sessions } = await supabase
    .from("session")
    .select("id, workshop_id, status, started_at, ended_at")
    .eq("workspace_id", wsId)
    .order("started_at", { ascending: false })
    .limit(100);
  const list = sessions ?? [];

  const wkIds = Array.from(new Set(list.map((s) => s.workshop_id)));
  const { data: wks } = wkIds.length
    ? await supabase.from("workshop").select("id, title, team_id").in("id", wkIds)
    : { data: [] as { id: string; title: string; team_id: string }[] };
  const wkById = new Map((wks ?? []).map((w) => [w.id, w]));
  const teamIds = Array.from(new Set((wks ?? []).map((w) => w.team_id)));
  const { data: teams } = teamIds.length
    ? await supabase.from("team").select("id, name").in("id", teamIds)
    : { data: [] as { id: string; name: string }[] };
  const teamById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const sids = list.map((s) => s.id);
  const { data: parts } = sids.length
    ? await supabase.from("participant").select("session_id").in("session_id", sids)
    : { data: [] as { session_id: string }[] };
  const partCount = new Map<string, number>();
  for (const p of parts ?? []) partCount.set(p.session_id, (partCount.get(p.session_id) ?? 0) + 1);

  const { data: acts } = sids.length
    ? await supabase.from("action_item").select("session_id").in("session_id", sids)
    : { data: [] as { session_id: string | null }[] };
  const actCount = new Map<string, number>();
  for (const a of acts ?? []) if (a.session_id) actCount.set(a.session_id, (actCount.get(a.session_id) ?? 0) + 1);

  return (
    <div>
      <h1 className="page-title">Sessions</h1>
      <p className="page-sub">Every live run, captured — revisit the outcomes and the commitments they produced.</p>

      {list.length === 0 ? (
        <div className="card empty">No sessions yet. Start a workshop to run your first.</div>
      ) : (
        <div className="tbl-card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Workshop</th>
                <th>Team</th>
                <th>When</th>
                <th style={{ width: 90 }}>People</th>
                <th style={{ width: 90 }}>Actions</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const wk = wkById.get(s.workshop_id);
                const team = wk ? teamById.get(wk.team_id) : null;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/sessions/${s.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                        {wk?.title ?? "Workshop"}
                      </Link>
                    </td>
                    <td style={{ color: "var(--muted)" }}>{team ?? "—"}</td>
                    <td style={{ color: "var(--muted)" }}>{fmtDate(s.started_at)}</td>
                    <td>{partCount.get(s.id) ?? 0}</td>
                    <td>{actCount.get(s.id) ?? 0}</td>
                    <td>
                      <span className={`pill sm ${s.status === "live" ? "open" : "draft"}`}>{s.status}</span>
                    </td>
                    <td className="r">
                      <Link className="linkbtn" href={s.status === "live" ? `/run/${s.workshop_id}` : `/sessions/${s.id}`}>
                        {s.status === "live" ? "Join" : "Readout"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
