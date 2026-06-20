import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { DYNAMIC_LABEL } from "@/lib/grounding";

// Workspace-wide longitudinal view: how each team's dynamics move across pulses.
// Pure server component — like Health, this rolls up every team, so scoped
// facilitators don't get it.
export default async function TrendsPage() {
  const { workspace, role } = await requireSession();
  if (role === "facilitator") redirect("/dashboard");
  const supabase = createClient();

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamList = teams ?? [];

  // Per dynamic: latest pct + delta vs the previous pulse, plus the current
  // band reading (label / in-band). team_dynamics_history is ordered
  // oldest -> newest, so the last two points are the most recent pulses.
  type DynTrend = {
    dynamic: string;
    label: string;
    pct: number | null;
    delta: number | null; // null when <2 data points
  };
  const trendsByTeam = new Map<string, DynTrend[]>();

  for (const team of teamList) {
    const [{ data: histData }, { data: dynData }] = await Promise.all([
      supabase.rpc("team_dynamics_history", { p_team: team.id }),
      supabase.rpc("team_dynamics", { p_team: team.id }),
    ]);

    // Current label + reading per dynamic (defensive: fields may be null).
    const cur = new Map<string, { label: string | null; pct: number | null }>();
    for (const d of dynData ?? []) {
      cur.set(d.dynamic, { label: d.label ?? null, pct: d.pct == null ? null : Number(d.pct) });
    }

    // Build a per-dynamic series across pulses (oldest -> newest).
    const series = new Map<string, (number | null)[]>();
    const order: string[] = [];
    for (const h of histData ?? []) {
      if (!series.has(h.dynamic)) {
        series.set(h.dynamic, []);
        order.push(h.dynamic);
      }
      series.get(h.dynamic)!.push(h.pct == null ? null : Number(h.pct));
    }

    if (order.length === 0) {
      trendsByTeam.set(team.id, []);
      continue;
    }

    const rows: DynTrend[] = order.map((dyn) => {
      const pts = series.get(dyn) ?? [];
      const last = pts.length ? pts[pts.length - 1] : null;
      const prev = pts.length >= 2 ? pts[pts.length - 2] : null;
      const delta = last != null && prev != null ? last - prev : null;
      const c = cur.get(dyn);
      // Prefer the live band label/pct; fall back to history-derived values.
      const label = c?.label ?? DYNAMIC_LABEL[dyn] ?? dyn;
      const pct = c?.pct ?? last ?? null;
      return { dynamic: dyn, label, pct, delta };
    });
    trendsByTeam.set(team.id, rows);
  }

  return (
    <div>
      <h1 className="page-title">Trends</h1>
      <p className="page-sub">
        How every team&apos;s dynamics move across pulses — the latest reading and its shift since the previous pulse.
      </p>

      {teamList.length === 0 ? (
        <div className="card empty">No teams yet. Create a team to start tracking dynamics over time.</div>
      ) : (
        teamList.map((team) => {
          const rows = trendsByTeam.get(team.id) ?? [];
          return (
            <div key={team.id}>
              <div className="cat-head">{team.name}</div>
              {rows.length === 0 ? (
                <p className="page-sub" style={{ marginTop: -4 }}>No pulse history yet</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                    gap: 12,
                    marginBottom: 22,
                  }}
                >
                  {rows.map((r) => (
                    <div className="card" key={r.dynamic} style={{ padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>
                        {r.label}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--ink)" }}>
                          {r.pct != null ? `${Math.round(r.pct)}%` : "—"}
                        </span>
                        <Trend delta={r.delta} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// Trend indicator: ▲ green up / ▼ rust down with the points delta; "–" when
// flat, when there's too little data, or when the move is under 2 points.
function Trend({ delta }: { delta: number | null }) {
  if (delta == null || Math.abs(delta) < 2) {
    return <span style={{ fontSize: 13, fontWeight: 700, color: "var(--faint)" }}>–</span>;
  }
  const up = delta > 0;
  const pts = Math.round(Math.abs(delta));
  return (
    <span
      style={{ fontSize: 13, fontWeight: 700, color: up ? "var(--green)" : "var(--rust)" }}
      title={`${up ? "Up" : "Down"} ${pts} point${pts === 1 ? "" : "s"} vs previous pulse`}
    >
      {up ? "▲" : "▼"}{pts}
    </span>
  );
}
