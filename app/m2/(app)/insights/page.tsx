import Link from "next/link";
import { BarChart3, TrendingUp, Users, Send } from "lucide-react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeam } from "@/lib/m2/context";
import { getScorecard, type DynamicRow } from "@/lib/m2/scorecard";

export default async function M2Insights() {
  const ctx = await requireSession();
  const supabase = createClient();
  const team = await getActiveTeam(supabase, ctx);

  if (!team) {
    return (
      <Header title="Insights" sub="Team performance against research-backed healthy bands">
        <div className="m2-empty">
          <BarChart3 />
          <b>No team to measure yet</b>
          <p>Create a team and run an assessment to see its scorecard here.</p>
          <Link className="m2-btn" href="/m2/onboarding">Get started</Link>
        </div>
      </Header>
    );
  }

  const sc = await getScorecard(supabase, team.id);

  return (
    <Header title="Insights" sub={`${team.name} · against research-backed healthy bands`}>
      {!sc.hasData ? (
        <div className="m2-empty">
          <Send />
          <b>No results in yet</b>
          <p>
            Once your team responds to an assessment, their scores will appear here mapped against
            the healthy band for each dynamic.
          </p>
          <Link className="m2-btn" href="/m2/assessments">Send an assessment</Link>
        </div>
      ) : (
        <>
          {/* summary row */}
          <div className="m2-grid m2-grid-3" style={{ marginBottom: 18 }}>
            <div className="m2-card tight">
              <div className="m2-kpi-head"><span>Overall</span><TrendingUp color="var(--green)" /></div>
              <div className="m2-kpi-num">
                {sc.overall ?? "—"}
                {sc.delta != null ? (
                  <small style={{ color: sc.delta >= 0 ? "var(--green)" : "var(--rust)" }}>
                    {" "}{sc.delta >= 0 ? "▲" : "▼"} {Math.abs(sc.delta)}
                  </small>
                ) : null}
              </div>
              <div className="m2-kpi-sub">team health index · vs last cycle</div>
            </div>
            <div className="m2-card tight">
              <div className="m2-kpi-head"><span>Responses</span><Users color="var(--role)" /></div>
              <div className="m2-kpi-num">{sc.responded}</div>
              <div className="m2-kpi-sub">people in this measure</div>
            </div>
            <div className="m2-card tight">
              <div className="m2-kpi-head"><span>Dynamics in band</span><BarChart3 color="var(--amber)" /></div>
              <div className="m2-kpi-num">
                {sc.dynamics.filter((d) => d.status === "healthy" || d.status === "strong").length}
                <small> / {sc.dynamics.length}</small>
              </div>
              <div className="m2-kpi-sub">at or above the healthy floor</div>
            </div>
          </div>

          {/* scorecard */}
          <div className="m2-card">
            <div className="m2-sec-head" style={{ margin: "0 0 6px" }}>
              <h2>Team scorecard</h2>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>shaded = healthy band</span>
            </div>
            <div className="m2-bands">
              {sc.dynamics.map((d) => (
                <BandRow key={d.key} d={d} />
              ))}
            </div>
          </div>
        </>
      )}
    </Header>
  );
}

function statusColor(status: DynamicRow["status"]) {
  return status === "watch" ? "var(--rust)" : status === "strong" ? "var(--green)" : "var(--green)";
}
function statusLabel(status: DynamicRow["status"]) {
  return status === "watch" ? "Below band" : status === "strong" ? "Strong" : status === "healthy" ? "Healthy" : "No data";
}
function statusTint(status: DynamicRow["status"]) {
  return status === "watch" ? "reject" : status === "strong" ? "open" : status === "healthy" ? "open" : "draft";
}

function BandRow({ d }: { d: DynamicRow }) {
  const lowPct = Math.max(0, Math.min(100, d.low));
  const highPct = Math.max(0, Math.min(100, d.high));
  const score = d.score;
  return (
    <div className="m2-band-row">
      <div className="m2-band-label">
        <span>{d.label}</span>
        <span className={`m2-pill ${statusTint(d.status)}`}>{statusLabel(d.status)}</span>
      </div>
      <div className="m2-band-track">
        <span className="m2-band-zone" style={{ left: `${lowPct}%`, width: `${Math.max(0, highPct - lowPct)}%` }} />
        {score != null ? (
          <span
            className="m2-band-fill"
            style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: statusColor(d.status) }}
          />
        ) : null}
        {score != null ? (
          <span className="m2-band-mark" style={{ left: `${Math.max(0, Math.min(100, score))}%` }} title={`${score}`} />
        ) : null}
      </div>
      <div className="m2-band-val">{score != null ? score : "—"}</div>
    </div>
  );
}

function Header({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="m2-page-head">
        <div>
          <div className="m2-eyebrow">Insight</div>
          <h1 className="m2-title">{title}</h1>
          <p className="m2-sub">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
