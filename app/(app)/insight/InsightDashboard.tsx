"use client";

// Insights dashboard — ported from the design (insights-app.jsx), wired to real
// workspace data. Renders INSIDE the existing app Shell, so only the content is
// here (header + Toolbar, TabBand, KPI strip, active panel). The design's
// Rail/Nav/Appbar are intentionally dropped.
//
// Charts/atoms are faithful ports of the design's SVG primitives. Scores are on
// the real 0-100 scale (not the design's illustrative 1-5), so the band cutoffs
// and target line are expressed in 0-100 terms.

import { useState } from "react";

/* ===================== view-model types (from the server) ===================== */
export type KpiVM = {
  activeAssessments: number;
  avgScore: number | null; // workspace mean of teams' dynamics.score, 0-100
  responses: number;
  belowThreshold: number; // sections below band
  workshopsScheduled: number;
  participation: number | null; // overall %
};

export type SectionVM = {
  name: string; // real dynamic label
  pct: number | null; // workspace mean pct for this dynamic (0-100)
  targetLow: number;
  targetHigh: number;
};

export type TrendPoint = { l: string; v: number };
export type BarPoint = { l: string; v: number; flagged?: boolean };

export type WorkshopVM = {
  id: string;
  title: string;
  when: string | null;
  participants: number;
  status: string;
};

export type TeamDynVM = {
  label: string;
  pct: number | null; // 0-100 or null when masked
  targetLow: number;
};
export type TeamVM = {
  id: string;
  name: string;
  lead: string | null;
  score: number | null; // dynamics.score 0-100
  inBand: number;
  total: number;
  dynamics: TeamDynVM[];
};

export type DashboardProps = {
  kpis: KpiVM;
  trend: TrendPoint[];
  participationByTeam: BarPoint[];
  sections: SectionVM[];
  workshops: WorkshopVM[];
  teams: TeamVM[];
};

/* ===================== colour helpers ===================== */
const TARGET_MID = 62; // band midpoint on the 0-100 scale (target line)

// Band colour for a 0-100 reading relative to its target floor: at/above floor
// is green, within 10 points below is amber, lower is rust. Mirrors the
// design's three-tier palette.
function bandColor(pct: number | null, targetLow: number): string {
  if (pct == null) return "#c2c0b3";
  if (pct >= targetLow) return "#3f7d5a";
  if (pct >= targetLow - 10) return "#a8862f";
  return "#b8584a";
}

const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

/* ===================== chart atoms (ported) ===================== */
function LineChart({
  data,
  w = 560,
  h = 150,
  stroke = "#3f7d5a",
  fill = "rgba(63,125,90,.08)",
  target = null,
}: {
  data: TrendPoint[];
  w?: number;
  h?: number;
  stroke?: string;
  fill?: string;
  target?: number | null;
}) {
  if (data.length === 0) {
    return <div style={{ fontSize: 13, color: "#a6a698", padding: "28px 0" }}>No trend data yet</div>;
  }
  const pad = { t: 12, r: 8, b: 22, l: 28 };
  const max = Math.max(...data.map((d) => d.v), target || 0) * 1.1 || 1;
  const min = Math.min(...data.map((d) => d.v)) * 0.9;
  const iw = w - pad.l - pad.r,
    ih = h - pad.t - pad.b;
  const span = max - min || 1;
  const x = (i: number) => (data.length === 1 ? pad.l + iw / 2 : pad.l + (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - min) / span) * ih;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.v)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`;
  const ty = target != null ? y(target) : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.5, 1].map((g, i) => {
        const gy = pad.t + ih - g * ih;
        return <line key={i} x1={pad.l} x2={w - pad.r} y1={gy} y2={gy} stroke="#ece9df" strokeWidth="1" />;
      })}
      {ty != null && <line x1={pad.l} x2={w - pad.r} y1={ty} y2={ty} stroke="#42729e" strokeWidth="1" strokeDasharray="3 3" />}
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.v)} r="3" fill="#fff" stroke={stroke} strokeWidth="2" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="10" fill="#a6a698" fontFamily="Inter, sans-serif">
          {d.l}
        </text>
      ))}
    </svg>
  );
}

function BarChart({ data, w = 280, h = 150, color = "#3a4d3f" }: { data: BarPoint[]; w?: number; h?: number; color?: string }) {
  if (data.length === 0) {
    return <div style={{ fontSize: 13, color: "#a6a698", padding: "28px 0" }}>No participation data yet</div>;
  }
  const pad = { t: 10, r: 4, b: 22, l: 4 };
  const max = Math.max(...data.map((d) => d.v), 1) * 1.15;
  const iw = w - pad.l - pad.r,
    ih = h - pad.t - pad.b;
  const bw = (iw / data.length) * 0.56;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {data.map((d, i) => {
        const bh = (d.v / max) * ih;
        const bx = pad.l + (i + 0.5) * (iw / data.length) - bw / 2;
        return (
          <g key={i}>
            <rect x={bx} y={pad.t + ih - bh} width={bw} height={bh} rx="3" fill={d.flagged ? "#b8584a" : color} />
            <text x={bx + bw / 2} y={h - 6} textAnchor="middle" fontSize="10" fill="#a6a698" fontFamily="Inter, sans-serif">
              {d.l}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Band row: 0-100 reading marker on a track with the target band shaded.
function BandRow({ name, pct, targetLow, targetHigh }: SectionVM) {
  const color = bandColor(pct, targetLow);
  const markerLeft = pct == null ? "0%" : `${Math.max(0, Math.min(100, pct))}%`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <span style={{ width: 132, flexShrink: 0, fontSize: 12.5, color: "#4a4a44" }}>{name}</span>
      <span style={{ position: "relative", flex: 1, minWidth: 64, height: 12, borderRadius: 999, background: "#eceadf", overflow: "hidden" }}>
        <span
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${targetLow}%`,
            right: `${Math.max(0, 100 - targetHigh)}%`,
            background: "#dde7f0",
            borderLeft: "1px solid #42729e",
          }}
        />
        {pct != null && (
          <span style={{ position: "absolute", top: "50%", left: markerLeft, transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: color, border: "2px solid #fff" }} />
        )}
      </span>
      <span style={{ width: 42, textAlign: "right", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>{fmtPct(pct)}</span>
    </div>
  );
}

function FillBar({ pct, color = "#3f7d5a", track = "#eceadf" }: { pct: string; color?: string; track?: string }) {
  return (
    <span style={{ flex: 1, minWidth: 0, height: 6, borderRadius: 999, background: track, overflow: "hidden", display: "block" }}>
      <span style={{ display: "block", height: "100%", borderRadius: 999, width: pct, background: color }} />
    </span>
  );
}

/* ===================== atoms (ported) ===================== */
const TINT: Record<string, [string, string, string]> = {
  open: ["#dcebdf", "#3f7d5a", "#3f7d5a"],
  draft: ["#ece7d6", "#8a7a52", "#8a7a52"],
  internal: ["#f3e9cf", "#a8862f", "#a8862f"],
  interview: ["#dde7f0", "#42729e", "#42729e"],
  reject: ["#f4dedb", "#b8584a", "#b8584a"],
};
function Pill({ variant = "draft", dot, children }: { variant?: string; dot?: boolean; children: React.ReactNode }) {
  const [bg, fg] = TINT[variant] ?? TINT.draft;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap", padding: "3px 9px", borderRadius: 999, background: bg, color: fg, border: `1px solid ${fg}33` }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: (TINT[variant] ?? TINT.draft)[2] }} />}
      {children}
    </span>
  );
}

function Card({ title, sub, right, children }: { title?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e4e1d5", borderRadius: 8, boxShadow: "0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05)", overflow: "hidden" }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 20px", borderBottom: "1px solid #e4e1d5" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#2a2a26" }}>{title}</div>
            {sub && <div style={{ fontSize: 12, color: "#a6a698", marginTop: 2 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

function KpiStrip({ kpis }: { kpis: KpiVM }) {
  const cells: { big: string; lab: string; color: string }[] = [
    { big: String(kpis.activeAssessments), lab: "Active assessments", color: "#2a2a26" },
    { big: kpis.avgScore == null ? "—" : kpis.avgScore.toFixed(1), lab: "Avg score", color: "#a8862f" },
    { big: String(kpis.responses), lab: "Responses", color: "#2a2a26" },
    { big: String(kpis.belowThreshold), lab: "Below threshold", color: "#b8584a" },
    { big: String(kpis.workshopsScheduled), lab: "Workshops scheduled", color: "#3f7d5a" },
    { big: kpis.participation == null ? "—" : `${Math.round(kpis.participation)}%`, lab: "Participation", color: "#2a2a26" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", alignItems: "center", background: "#fff", border: "1px solid #e4e1d5", borderRadius: 8, boxShadow: "0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05)", padding: "16px 6px", marginBottom: 14 }}>
      {cells.map((k, i) => (
        <div key={i} style={{ padding: "0 22px", borderLeft: i ? "1px solid #ece9df" : "none" }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 26, fontWeight: 600, color: k.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{k.big}</div>
          <div style={{ marginTop: 5, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8a7e" }}>{k.lab}</div>
        </div>
      ))}
    </div>
  );
}

/* ===================== TabBand (ported) ===================== */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "assessment", label: "By assessment" },
  { id: "workshop", label: "By workshop" },
  { id: "team", label: "By team" },
  { id: "reports", label: "Reports" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function TabBand({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "#2f4035", borderRadius: 11, padding: 7, width: "100%", boxSizing: "border-box" }}>
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ flex: 1, border: "none", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 15px", fontSize: 13, fontWeight: 600, borderRadius: 7, background: active ? "#f3f1e8" : "transparent", color: active ? "#2a4032" : "rgba(255,255,255,.66)" }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ===================== Toolbar (ported, presentational) ===================== */
function Toolbar() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [range, setRange] = useState("Last 6 months");
  const head = (t: string) => (
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#a6a698", padding: "8px 0 2px" }}>{t}</div>
  );
  const Radio = ({ on }: { on: boolean }) => (
    <span style={{ width: 16, height: 16, borderRadius: "50%", border: on ? "5px solid #3f7d5a" : "1px solid #d8d4c6", background: "#fff", flexShrink: 0, boxSizing: "border-box" }} />
  );
  const opt = (label: string, on: boolean, fn: () => void) => (
    <button
      key={label}
      onClick={fn}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 5, padding: "7px 8px", fontSize: 13, fontWeight: 500, color: "#2a2a26", cursor: "pointer" }}
    >
      <Radio on={on} />
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
      <span style={{ position: "relative" }}>
        <button
          onClick={() => setFilterOpen((o) => !o)}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: "#3a4d3f", border: "1px solid #d8d4c6", borderRadius: 6, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          Filters
        </button>
        {filterOpen && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 31, background: "#fff", border: "1px solid #e4e1d5", borderRadius: 10, boxShadow: "0 10px 30px rgba(42,42,38,.18)", padding: "12px 14px", width: 264 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 600, color: "#2a2a26", marginBottom: 4 }}>Filters</div>
            {head("Date range")}
            {["Last 30 days", "Last 3 months", "Last 6 months", "Last 12 months"].map((r) => opt(r, range === r, () => setRange(r)))}
            <button onClick={() => setFilterOpen(false)} style={{ width: "100%", marginTop: 10, background: "#3a4d3f", color: "#fff", border: "none", borderRadius: 6, padding: "10px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>Apply</button>
          </div>
        )}
      </span>
      <span style={{ position: "relative" }}>
        <button
          onClick={() => setMoreOpen((o) => !o)}
          title="More actions"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: moreOpen ? "#f3f1e8" : "#fff", color: "#3a4d3f", border: "1px solid #d8d4c6", borderRadius: 6, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
        >
          ⋯
        </button>
        {moreOpen && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30, background: "#fff", border: "1px solid #e4e1d5", borderRadius: 8, boxShadow: "0 8px 28px rgba(42,42,38,.16)", padding: 6, minWidth: 200 }}>
            {["Send report", "Import responses", "Export as PDF", "Export as Excel", "Export as CSV"].map((l, i) => (
              <button
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 5, padding: "9px 10px", fontSize: 13, fontWeight: 500, color: "#2a2a26", cursor: "pointer" }}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}

/* ===================== panels ===================== */
function Placeholder({ note }: { note: string }) {
  return (
    <Card title="Coming next">
      <div style={{ fontSize: 13, color: "#585850", lineHeight: 1.6 }}>
        Wired in the next pass — {note}
      </div>
    </Card>
  );
}

function OverviewPanel({ trend, participationByTeam, sections, workshops }: DashboardProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 16 }}>
        <Card title="Average score trend" sub="Workspace mean across recent pulses" right={<Pill variant="internal">Target ≈ {TARGET_MID}</Pill>}>
          <LineChart data={trend} target={TARGET_MID} />
        </Card>
        <Card title="Participation by team" sub="Latest closed pulse">
          <BarChart data={participationByTeam} h={158} />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <Card title="Score distribution by section" sub="Workspace mean per dynamic · 0–100, banded">
          {sections.length === 0 ? (
            <div style={{ fontSize: 13, color: "#a6a698" }}>No dynamics data yet</div>
          ) : (
            sections.map((s, i) => <BandRow key={i} {...s} />)
          )}
          <div style={{ display: "flex", gap: 18, marginTop: 6, paddingTop: 13, borderTop: "1px solid #ece9df", fontSize: 11, color: "#8a8a7e" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 18, height: 9, borderRadius: 2, background: "#dde7f0", border: "1px solid #42729e" }} />Target band
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3f7d5a", border: "2px solid #fff", boxShadow: "0 0 0 1px #bcd6c4" }} />Section mean
            </span>
          </div>
        </Card>
        <Card title="Workshops this quarter" sub="Scheduled & upcoming">
          {workshops.length === 0 ? (
            <div style={{ fontSize: 13, color: "#a6a698" }}>No workshops scheduled</div>
          ) : (
            workshops.map((w, i) => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < workshops.length - 1 ? "1px solid #ece9df" : "none" }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: "#eef2ec", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#3a4d3f", fontWeight: 700, fontSize: 12 }}>WS</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#2a2a26", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.title}</div>
                  <div style={{ fontSize: 12, color: "#8a8a7e" }}>{fmtWhen(w.when)} · {w.participants} participants</div>
                </div>
                <Pill variant={w.status === "scheduled" ? "open" : "internal"} dot>{w.status}</Pill>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card title="All assessments">
        <div style={{ fontSize: 13, color: "#585850", lineHeight: 1.6 }}>Assessment list — next pass.</div>
      </Card>
    </div>
  );
}

function TeamPanel({ teams }: { teams: TeamVM[] }) {
  if (teams.length === 0) {
    return <Card title="By team"><div style={{ fontSize: 13, color: "#a6a698" }}>No teams yet.</div></Card>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
      {teams.map((t) => {
        const scoreColor = t.score == null ? "#c2c0b3" : t.score >= 62 ? "#3f7d5a" : t.score >= 50 ? "#a8862f" : "#b8584a";
        return (
          <Card
            key={t.id}
            title={t.name}
            sub={`${t.lead ?? "No lead"} · ${t.inBand}/${t.total} dynamics in band`}
            right={<span style={{ fontFamily: "'Playfair Display',serif", fontSize: 25, fontWeight: 600, color: scoreColor, fontVariantNumeric: "tabular-nums" }}>{t.score == null ? "—" : t.score}</span>}
          >
            {t.dynamics.map((d, j) => {
              const color = bandColor(d.pct, d.targetLow);
              return (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: j < t.dynamics.length - 1 ? 12 : 0 }}>
                  <span style={{ width: 130, fontSize: 12.5, color: "#4a4a44", flexShrink: 0 }}>{d.label}</span>
                  <FillBar pct={d.pct == null ? "0%" : `${Math.max(0, Math.min(100, d.pct))}%`} color={color} />
                  <span style={{ width: 38, textAlign: "right", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color, flexShrink: 0 }}>{fmtPct(d.pct)}</span>
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}

function fmtWhen(iso: string | null) {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/* ===================== root ===================== */
export function InsightDashboard(props: DashboardProps) {
  const [tab, setTab] = useState<TabId>("overview");
  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: "#2a2a26" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Insights</h1>
        <Toolbar />
      </div>

      <div style={{ margin: "2px 0 20px" }}>
        <TabBand tab={tab} setTab={setTab} />
      </div>

      <KpiStrip kpis={props.kpis} />

      {tab === "overview" && <OverviewPanel {...props} />}
      {tab === "team" && <TeamPanel teams={props.teams} />}
      {tab === "assessment" && <Placeholder note="per-assessment section scores, response rates and human notes." />}
      {tab === "workshop" && <Placeholder note="workshop outcomes and score lift at follow-up." />}
      {tab === "reports" && <Placeholder note="scheduled reports and one-off exports (PDF / Excel / CSV)." />}
    </div>
  );
}
