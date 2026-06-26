"use client";

// Insights dashboard — ported from the design (insights-app.jsx), wired to real
// workspace data. Renders INSIDE the existing app Shell, so only the content is
// here (header + Toolbar, TabBand, KPI strip, active panel). The design's
// Rail/Nav/Appbar are intentionally dropped.
//
// Charts/atoms are faithful ports of the design's SVG primitives. Scores are on
// the real 0-100 scale (not the design's illustrative 1-5), so the band cutoffs
// and target line are expressed in 0-100 terms.

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  assessmentDetail,
  createReport,
  setReportStatus,
  deleteReport,
  sendReportNow,
  importResponses,
  type AssessmentDetailVM,
  type ReportsData,
  type ReportScheduleVM,
  type ReportRunVM,
  type ReportFormat,
  type ReportFrequency,
} from "./actions";

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

// One row in the Overview "All assessments" table (surveys + pulses).
export type AssessmentRow = {
  id: string;
  kind: "survey" | "pulse";
  name: string;
  type: string; // instrument name / "Pulse"
  statusVariant: string; // Pill variant
  statusLabel: string; // Active / Draft / Review
  respondents: number;
  invited: number | null;
  score: number | null; // 0-100, null when masked / unavailable
  flagged: boolean;
  date: string | null;
};

// One row in the By-workshop outcomes table.
export type WorkshopOutcomeRow = {
  id: string;
  title: string;
  when: string | null;
  participants: number;
  teamSize: number;
  actionsDone: number;
  actionsTotal: number;
  delta: number | null; // mean session_pulse_delta, null when no post data
  outcome: "improved" | "flat" | "pending";
};

export type WorkshopKpis = {
  workshopsRun: number;
  avgLift: number | null;
  actionsDone: number;
  actionsTotal: number;
  attendance: number | null; // mean participant/team-size %
};

export type DashboardProps = {
  kpis: KpiVM;
  trend: TrendPoint[];
  participationByTeam: BarPoint[];
  sections: SectionVM[];
  workshops: WorkshopVM[];
  teams: TeamVM[];
  assessmentRows: AssessmentRow[];
  defaultAssessmentId: string | null;
  defaultDetail: AssessmentDetailVM | null;
  workshopOutcomes: WorkshopOutcomeRow[];
  workshopKpis: WorkshopKpis;
  reports: ReportsData;
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

// Colour for a 0-100 overall/assessment score: healthy green ≥62, amber ≥45,
// rust below. Matches the band cutoffs used across the dashboard.
function scoreColor100(v: number | null): string {
  if (v == null) return "#c2c0b3";
  if (v >= 62) return "#3f7d5a";
  if (v >= 45) return "#a8862f";
  return "#b8584a";
}

// Signed Δ formatter for the workshop outcomes (1 decimal, "—" when null).
const fmtDelta = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

// Grounded chip — signals the read is anchored in a validated signal (here the
// climate-strength dispersion), mirroring the design's shield-check pill.
function Grounded() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, background: "#dcebdf", border: "1px solid #bcd6c4", color: "#3f7d5a", borderRadius: 999, padding: "4px 10px" }}>
      ✓ Grounded
    </span>
  );
}

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

/* ===================== Toolbar ===================== */
// Wired: the date range re-scopes the assessment lists (lifted to the root),
// "Export as …" generate real files from the scoped rows, and Send report /
// Import responses jump to the Reports tab where those flows live.
const RANGE_OPTS = ["Last 30 days", "Last 3 months", "Last 6 months", "Last 12 months"] as const;
function Toolbar({ range, setRange, rows, onTab, onToast }: {
  range: string;
  setRange: (r: string) => void;
  rows: AssessmentRow[];
  onTab: (t: TabId) => void;
  onToast: (m: string) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuActions: Record<string, () => void> = {
    "Send report": () => { setMoreOpen(false); onTab("reports"); },
    "Import responses": () => { setMoreOpen(false); onTab("reports"); },
    "Export as PDF": () => { setMoreOpen(false); onToast("Opening print dialog…"); setTimeout(() => window.print(), 120); },
    "Export as Excel": () => { setMoreOpen(false); downloadBlob(assessmentsXls(rows), "insights-assessments.xls", "application/vnd.ms-excel"); onToast("Excel exported"); },
    "Export as CSV": () => { setMoreOpen(false); downloadBlob(assessmentsCsv(rows), "insights-assessments.csv", "text/csv;charset=utf-8"); onToast("CSV exported"); },
  };
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
                onClick={menuActions[l]}
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
function OverviewPanel({
  trend,
  participationByTeam,
  sections,
  workshops,
  assessmentRows,
  onOpen,
}: DashboardProps & { onOpen: (id: string) => void }) {
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

      <Card title="All assessments" sub={`${assessmentRows.length} total`}>
        {assessmentRows.length === 0 ? (
          <div style={{ fontSize: 13, color: "#a6a698" }}>No assessments yet.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px 110px 110px 80px 40px", padding: "0 0 10px", borderBottom: "1px solid #e4e1d5", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8a7e" }}>
              <div>Assessment</div><div>Type</div><div>Status</div><div>Responses</div><div style={{ textAlign: "right" }}>Score</div><div></div>
            </div>
            {assessmentRows.map((r, i) => {
              const drillable = r.kind === "survey";
              return (
                <div
                  key={r.id}
                  onClick={drillable ? () => onOpen(r.id) : undefined}
                  style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px 110px 110px 80px 40px", alignItems: "center", padding: "13px 0", borderBottom: i < assessmentRows.length - 1 ? "1px solid #ece9df" : "none", cursor: drillable ? "pointer" : "default" }}
                >
                  <div style={{ minWidth: 0, paddingRight: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    {r.flagged && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#b8584a", flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#2a2a26", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "#a6a698", fontFamily: "ui-monospace,monospace" }}>{r.id.slice(0, 8)}</div>
                    </div>
                  </div>
                  <div><span style={{ fontSize: 11, fontWeight: 700, color: "#585850" }}>{r.type}</span></div>
                  <div><Pill variant={r.statusVariant} dot>{r.statusLabel}</Pill></div>
                  <div style={{ fontSize: 12, color: "#585850", fontVariantNumeric: "tabular-nums" }}>{r.invited == null ? `${r.respondents}` : `${r.respondents} / ${r.invited}`}</div>
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: scoreColor100(r.score) }}>{r.score == null ? "—" : Math.round(r.score)}</div>
                  <div style={{ textAlign: "right", color: "#c2c0b3", fontSize: 15 }}>{drillable ? "›" : ""}</div>
                </div>
              );
            })}
          </>
        )}
      </Card>
    </div>
  );
}

/* ---- By assessment panel (lazily-loaded detail) ---- */
function AssessmentPanel({
  rows,
  selected,
  detail,
  loading,
  onSelect,
}: {
  rows: AssessmentRow[];
  selected: string | null;
  detail: AssessmentDetailVM | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const drillable = rows.filter((r) => r.kind === "survey");
  if (drillable.length === 0) {
    return (
      <Card title="By assessment">
        <div style={{ fontSize: 13, color: "#a6a698" }}>No surveys to break down yet.</div>
      </Card>
    );
  }

  const kpis: { big: string; title: string; sub: string; color: string }[] = detail
    ? [
        { big: detail.overallPct == null ? "—" : `${Math.round(detail.overallPct)}`, title: "Overall score", sub: detail.masked ? "masked" : "0–100 composite", color: scoreColor100(detail.overallPct) },
        { big: detail.invited == null ? `${detail.respondents}` : `${detail.respondents} / ${detail.invited}`, title: "Responses", sub: detail.participationPct == null ? "participation —" : `${detail.participationPct}% participation`, color: "#2a2a26" },
        { big: detail.masked ? "—" : `${detail.belowCount}`, title: "Sections below band", sub: `of ${detail.sectionCount} sections`, color: "#a8862f" },
        { big: fmtReviewed(detail.lastReviewed), title: "Last reviewed", sub: detail.instrumentName, color: "#3a4d3f" },
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8a7e" }}>Assessment</span>
        <select
          value={selected ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#2a2a26", background: "#fff", border: "1px solid #d8d4c6", borderRadius: 7, padding: "8px 12px", minWidth: 280, cursor: "pointer" }}
        >
          {drillable.map((r) => (
            <option key={r.id} value={r.id}>{r.name}{r.flagged ? " ⚑" : ""}</option>
          ))}
        </select>
        {loading && <span style={{ fontSize: 12, color: "#a6a698" }}>Loading…</span>}
      </div>

      {!detail ? (
        <Card title="By assessment"><div style={{ fontSize: 13, color: "#a6a698" }}>Select an assessment to see its breakdown.</div></Card>
      ) : (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .12s", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            {kpis.map((k, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #e4e1d5", borderRadius: 8, boxShadow: "0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05)", padding: "15px 17px" }}>
                <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 26, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: k.color }}>{k.big}</div>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: "#2a2a26" }}>{k.title}</div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#8a8a7e" }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
            <Card title="Section scores" sub="bands · 0–100 scale">
              {detail.masked ? (
                <div style={{ fontSize: 13, color: "#a6a698" }}>Results stay hidden until enough people respond.</div>
              ) : detail.sections.length === 0 ? (
                <div style={{ fontSize: 13, color: "#a6a698" }}>No section scores yet.</div>
              ) : (
                detail.sections.map((s) => (
                  <BandRow key={s.key} name={s.label} pct={s.pct} targetLow={s.targetLow} targetHigh={100} />
                ))
              )}
            </Card>
            <Card title="Score over time" sub={`${detail.trend.length} ${detail.trend.length === 1 ? "cycle" : "cycles"}`}>
              <LineChart data={detail.trend} target={TARGET_MID} w={420} h={150} />
            </Card>
          </div>

          {detail.note && (
            <div style={{ background: "#f7f5ee", border: "1px solid #e4e1d5", borderRadius: 8, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8a7e" }}>Human note · {detail.note.label}</span>
                <Grounded />
              </div>
              <p style={{ fontSize: 13, fontStyle: "italic", lineHeight: 1.6, color: "#4a4a44", margin: 0 }}>{detail.note.copy}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtReviewed(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/* ---- By workshop panel ---- */
const OUTCOME_TINT: Record<string, [string, string]> = {
  improved: ["#dcebdf", "#3f7d5a"],
  pending: ["#ece7d6", "#8a7a52"],
  flat: ["#f3e9cf", "#a8862f"],
};
const OUTCOME_LABEL: Record<string, string> = { improved: "Improved", pending: "Pending", flat: "Flat" };

function WorkshopPanel({ rows, kpis }: { rows: WorkshopOutcomeRow[]; kpis: WorkshopKpis }) {
  const cells: [string, string, string][] = [
    [String(kpis.workshopsRun), "Workshops run", "#2a2a26"],
    [fmtDelta(kpis.avgLift), "Avg score lift", kpis.avgLift != null && kpis.avgLift > 0 ? "#3f7d5a" : "#a6a698"],
    [`${kpis.actionsDone} / ${kpis.actionsTotal}`, "Actions closed", "#a8862f"],
    [kpis.attendance == null ? "—" : `${kpis.attendance}%`, "Attendance", "#2a2a26"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {cells.map(([b, l, c], i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid #e4e1d5", borderRadius: 8, boxShadow: "0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05)", padding: "15px 17px" }}>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 26, fontWeight: 600, lineHeight: 1, color: c, fontVariantNumeric: "tabular-nums" }}>{b}</div>
            <div style={{ marginTop: 7, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8a7e" }}>{l}</div>
          </div>
        ))}
      </div>
      <Card title="Workshop outcomes" sub="Score change measured at follow-up pulse">
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: "#a6a698" }}>No workshops with a completed session yet.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 90px 90px 90px 120px", padding: "0 0 10px", borderBottom: "1px solid #e4e1d5", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8a7e" }}>
              <div>Workshop</div><div>Date</div><div>Particip.</div><div>Actions</div><div style={{ textAlign: "right" }}>Δ Score</div><div style={{ textAlign: "right" }}>Outcome</div>
            </div>
            {rows.map((r, i) => {
              const [bg, fg] = OUTCOME_TINT[r.outcome] ?? OUTCOME_TINT.pending;
              return (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 90px 90px 90px 120px", alignItems: "center", padding: "13px 0", borderBottom: i < rows.length - 1 ? "1px solid #ece9df" : "none" }}>
                  <div style={{ minWidth: 0, paddingRight: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#2a2a26", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: "#a6a698", fontFamily: "ui-monospace,monospace" }}>#{r.id.slice(0, 4).toUpperCase()}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#585850", fontVariantNumeric: "tabular-nums" }}>{fmtOutcomeDate(r.when)}</div>
                  <div style={{ fontSize: 12.5, color: "#585850", fontVariantNumeric: "tabular-nums" }}>{r.participants || "—"}</div>
                  <div style={{ fontSize: 12.5, color: "#585850", fontVariantNumeric: "tabular-nums" }}>{r.actionsDone} / {r.actionsTotal}</div>
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: r.delta != null && r.delta > 0 ? "#3f7d5a" : r.delta != null && r.delta < 0 ? "#b8584a" : "#a6a698" }}>{fmtDelta(r.delta)}</div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "3px 9px", borderRadius: 999, background: bg, color: fg }}>{OUTCOME_LABEL[r.outcome]}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Card>
    </div>
  );
}

function fmtOutcomeDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
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

/* ===================== Reports (Phase D) ===================== */

// Trigger a client-side file download from in-memory content.
function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const EXPORT_HEAD = ["Assessment", "Type", "Status", "Responses", "Invited", "Score", "Flagged", "Date"];
function exportRow(r: AssessmentRow): (string | number | null)[] {
  return [r.name, r.type, r.statusLabel, r.respondents, r.invited ?? "", r.score == null ? "" : Math.round(r.score), r.flagged ? "yes" : "no", r.date ?? ""];
}
function assessmentsCsv(rows: AssessmentRow[]): string {
  return [EXPORT_HEAD.map(csvCell).join(","), ...rows.map((r) => exportRow(r).map(csvCell).join(","))].join("\r\n");
}
// Best-effort Excel: an HTML-table workbook Excel opens natively (.xls).
function assessmentsXls(rows: AssessmentRow[]): string {
  const esc = (v: string | number | null) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const th = EXPORT_HEAD.map((h) => `<th>${esc(h)}</th>`).join("");
  const trs = rows.map((r) => `<tr>${exportRow(r).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
}

// Minimal RFC-4180-ish CSV parser for the response import (handles quotes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
type ParsedImport = { rows: { scores: Record<string, number>; hash?: string }[]; columns: string[] };
function parseResponseCsv(text: string): ParsedImport {
  const matrix = parseCsv(text);
  if (matrix.length < 2) return { rows: [], columns: [] };
  const header = matrix[0].map((h) => h.trim());
  const hashIdx = header.findIndex((h) => /^(hash|id|respondent|respondent_hash)$/i.test(h));
  const itemCols = header.map((h, i) => ({ h, i })).filter((x) => x.i !== hashIdx && x.h !== "");
  const rows = matrix.slice(1).map((r) => {
    const scores: Record<string, number> = {};
    for (const { h, i } of itemCols) {
      const raw = (r[i] ?? "").trim();
      const v = Number(raw);
      if (raw !== "" && !Number.isNaN(v)) scores[h] = v;
    }
    const hash = hashIdx >= 0 ? (r[hashIdx] ?? "").trim() : "";
    return { scores, hash: hash || undefined };
  }).filter((x) => Object.keys(x.scores).length > 0);
  return { rows, columns: itemCols.map((c) => c.h) };
}

// Right-hand slide-over (matches the design's side-window).
function SideWindow({ open, title, sub, onClose, footer, children }: {
  open: boolean; title: string; sub?: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.42)", zIndex: 80 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px,94vw)", background: "#f7f5ee", borderLeft: "1px solid #e4e1d5", boxShadow: "-18px 0 50px rgba(20,24,20,.22)", zIndex: 81, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 22px", borderBottom: "1px solid #e4e1d5", background: "#fff" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 19, fontWeight: 600, color: "#2a2a26" }}>{title}</div>
            {sub && <div style={{ fontSize: 12, color: "#8a8a7e", marginTop: 2 }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 20, color: "#8a8a7e", cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>{children}</div>
        {footer && <div style={{ padding: "14px 22px", borderTop: "1px solid #e4e1d5", background: "#fff" }}>{footer}</div>}
      </div>
    </>
  );
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8a7e", margin: "16px 0 7px" }}>{children}</div>
);
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "#fff", border: "1px solid #d8d4c6", borderRadius: 7,
  padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", color: "#2a2a26", outline: "none",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", background: "#2f4035", color: "#fff", border: "none", borderRadius: 7, padding: "12px",
  fontSize: 12.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer", fontFamily: "inherit",
};

const FORMAT_OPTS: { id: ReportFormat; label: string }[] = [
  { id: "pdf", label: "PDF" }, { id: "excel", label: "Excel" }, { id: "csv", label: "CSV" },
];
const FREQ_OPTS: { id: ReportFrequency; label: string }[] = [
  { id: "once", label: "Once (now)" }, { id: "weekly", label: "Weekly" }, { id: "monthly", label: "Monthly" },
];
const INCLUDE_OPTS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview & KPIs" },
  { key: "assessments", label: "Assessment scores" },
  { key: "teams", label: "By-team breakdown" },
  { key: "workshops", label: "Workshop outcomes" },
];

const RUN_TINT: Record<string, [string, string]> = {
  sent: ["#dcebdf", "#3f7d5a"], queued: ["#dde7f0", "#42729e"], failed: ["#f4dedb", "#b8584a"],
};
function fmtRun(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function ReportsPanel({
  reports,
  assessmentRows,
  exportData,
  onToast,
}: {
  reports: ReportsData;
  assessmentRows: AssessmentRow[];
  exportData: AssessmentRow[];
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // New-report form
  const [name, setName] = useState("");
  const [recipInput, setRecipInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [frequency, setFrequency] = useState<ReportFrequency>("weekly");
  const [include, setInclude] = useState<Record<string, boolean>>({ overview: true, assessments: true, teams: false, workshops: false });
  const [message, setMessage] = useState("");

  // Import form
  const surveys = assessmentRows.filter((r) => r.kind === "survey");
  const [importSurvey, setImportSurvey] = useState<string>(surveys[0]?.id ?? "");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const canManage = reports.canManage;

  function addRecipient() {
    const v = recipInput.trim();
    if (!v) return;
    if (!recipients.includes(v)) setRecipients((rs) => [...rs, v]);
    setRecipInput("");
  }
  function resetNew() {
    setName(""); setRecipInput(""); setRecipients([]); setFormat("pdf"); setFrequency("weekly");
    setInclude({ overview: true, assessments: true, teams: false, workshops: false }); setMessage("");
  }
  function submitNew() {
    startTransition(async () => {
      const r = await createReport({ name, format, frequency, recipients, include, message });
      if (r.error) { onToast(r.error); return; }
      onToast(frequency === "once" ? "Report queued for delivery" : "Report scheduled");
      setNewOpen(false); resetNew(); router.refresh();
    });
  }
  function toggleStatus(s: ReportScheduleVM) {
    const next = s.status === "active" ? "paused" : "active";
    startTransition(async () => {
      const r = await setReportStatus(s.id, next);
      if (r.error) { onToast(r.error); return; }
      onToast(next === "active" ? "Report resumed" : "Report paused"); router.refresh();
    });
  }
  function remove(s: ReportScheduleVM) {
    startTransition(async () => {
      const r = await deleteReport(s.id);
      if (r.error) { onToast(r.error); return; }
      onToast("Report deleted"); router.refresh();
    });
  }
  function sendNow(s: ReportScheduleVM) {
    startTransition(async () => {
      const r = await sendReportNow(s.id);
      if (r.error) { onToast(r.error); return; }
      onToast("Delivery queued — see Recent activity"); router.refresh();
    });
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setParsed(parseResponseCsv(String(reader.result ?? "")));
    reader.readAsText(f);
  }
  function submitImport() {
    if (!parsed || parsed.rows.length === 0) { onToast("No valid rows to import"); return; }
    startTransition(async () => {
      const r = await importResponses(importSurvey, parsed.rows);
      if (r.error) { onToast(r.error); return; }
      onToast(`Imported ${r.imported} response${r.imported === 1 ? "" : "s"}`);
      setImportOpen(false); setParsed(null); setFileName(""); if (fileRef.current) fileRef.current.value = ""; router.refresh();
    });
  }

  // Quick exports (real, client-side).
  function exportCsv() { downloadBlob(assessmentsCsv(exportData), "insights-assessments.csv", "text/csv;charset=utf-8"); onToast("CSV exported"); }
  function exportXls() { downloadBlob(assessmentsXls(exportData), "insights-assessments.xls", "application/vnd.ms-excel"); onToast("Excel exported"); }
  function exportPdf() { onToast("Opening print dialog…"); setTimeout(() => window.print(), 120); }

  const fmtMap: Record<string, string> = { pdf: "PDF", excel: "Excel", csv: "CSV" };
  const freqMap: Record<string, string> = { once: "One-off", weekly: "Weekly", monthly: "Monthly" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Scheduled reports */}
      <Card
        title="Scheduled reports"
        sub={`${reports.schedules.length} configured`}
        right={canManage ? (
          <button onClick={() => setNewOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#2f4035", color: "#fff", border: "none", borderRadius: 6, padding: "9px 14px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer", fontFamily: "inherit" }}>+ New report</button>
        ) : undefined}
      >
        {reports.schedules.length === 0 ? (
          <div style={{ fontSize: 13, color: "#a6a698" }}>No reports scheduled yet{canManage ? " — create one to email Insights on a cadence." : "."}</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) 80px 90px minmax(0,1.2fr) 110px 90px 96px", padding: "0 0 10px", borderBottom: "1px solid #e4e1d5", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8a8a7e" }}>
              <div>Report</div><div>Format</div><div>Cadence</div><div>Recipients</div><div>Next run</div><div>Status</div><div></div>
            </div>
            {reports.schedules.map((s, i) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) 80px 90px minmax(0,1.2fr) 110px 90px 96px", alignItems: "center", padding: "13px 0", borderBottom: i < reports.schedules.length - 1 ? "1px solid #ece9df" : "none" }}>
                <div style={{ minWidth: 0, paddingRight: 12 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#2a2a26", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                  {s.message && <div style={{ fontSize: 11, color: "#a6a698", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.message}</div>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#585850" }}>{fmtMap[s.format] ?? s.format}</div>
                <div style={{ fontSize: 12, color: "#585850" }}>{freqMap[s.frequency] ?? s.frequency}</div>
                <div style={{ fontSize: 12, color: "#585850", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 10 }}>{s.recipients.length ? s.recipients.join(", ") : "—"}</div>
                <div style={{ fontSize: 12, color: "#585850", fontVariantNumeric: "tabular-nums" }}>{s.frequency === "once" ? "—" : fmtRun(s.nextRunAt)}</div>
                <div><Pill variant={s.status === "active" ? "open" : "draft"} dot>{s.status === "active" ? "Active" : "Paused"}</Pill></div>
                <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {canManage ? <RowMenu schedule={s} pending={pending} onSend={() => sendNow(s)} onToggle={() => toggleStatus(s)} onDelete={() => remove(s)} /> : null}
                </div>
              </div>
            ))}
          </>
        )}
      </Card>

      {/* Quick export + Import */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <Card title="Quick export" sub="Download the current assessment data">
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {[{ l: "Export as PDF", fn: exportPdf, note: "Print / save the dashboard" }, { l: "Export as Excel", fn: exportXls, note: ".xls workbook" }, { l: "Export as CSV", fn: exportCsv, note: "Raw rows" }].map((b) => (
              <button key={b.l} onClick={b.fn} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #d8d4c6", borderRadius: 8, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#2a2a26" }}>{b.l}</span>
                <span style={{ fontSize: 11.5, color: "#a6a698" }}>{b.note}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Import responses" sub="Bring external survey responses in (CSV)">
          <div style={{ fontSize: 13, color: "#585850", lineHeight: 1.6, marginBottom: 12 }}>
            Upload a CSV of completed responses to merge into an assessment. Responses import anonymously — the min-respondent floor still applies on read.
          </div>
          <button onClick={() => setImportOpen(true)} disabled={!canManage || surveys.length === 0} style={{ ...primaryBtn, background: !canManage || surveys.length === 0 ? "#c2c0b3" : "#2f4035", cursor: !canManage || surveys.length === 0 ? "default" : "pointer" }}>
            {surveys.length === 0 ? "No surveys to import into" : "Import responses"}
          </button>
        </Card>
      </div>

      {/* Recent activity */}
      <Card title="Recent activity" sub="Last 20 deliveries">
        {reports.runs.length === 0 ? (
          <div style={{ fontSize: 13, color: "#a6a698" }}>No report deliveries yet.</div>
        ) : (
          reports.runs.map((r, i) => {
            const [bg, fg] = RUN_TINT[r.status] ?? RUN_TINT.queued;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < reports.runs.length - 1 ? "1px solid #ece9df" : "none" }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "3px 9px", borderRadius: 999, background: bg, color: fg, flexShrink: 0 }}>{r.status}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#2a2a26" }}>{r.scheduleName}</div>
                  {r.error && <div style={{ fontSize: 11.5, color: "#b8584a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.error}</div>}
                </div>
                <div style={{ fontSize: 12, color: "#8a8a7e", textAlign: "right", flexShrink: 0 }}>{r.recipientCount} recipient{r.recipientCount === 1 ? "" : "s"} · {fmtRun(r.sentAt ?? r.createdAt)}</div>
              </div>
            );
          })
        )}
      </Card>

      {/* New report side-window */}
      <SideWindow
        open={newOpen}
        title="New report"
        sub="Email an Insights summary on a cadence"
        onClose={() => setNewOpen(false)}
        footer={<button onClick={submitNew} disabled={pending} style={{ ...primaryBtn, opacity: pending ? 0.7 : 1 }}>{frequency === "once" ? "Create & send now" : "Schedule report"}</button>}
      >
        <FieldLabel>Report name</FieldLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly leadership digest" style={inputStyle} />

        <FieldLabel>Recipients</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={recipInput} onChange={(e) => setRecipInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }} placeholder="name@company.com" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={addRecipient} style={{ background: "#fff", border: "1px solid #d8d4c6", borderRadius: 7, padding: "0 14px", fontSize: 13, fontWeight: 600, color: "#2a4032", cursor: "pointer", fontFamily: "inherit" }}>Add</button>
        </div>
        {recipients.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
            {recipients.map((r) => (
              <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#eef2ec", border: "1px solid #d4ddd2", borderRadius: 999, padding: "4px 6px 4px 11px", fontSize: 12.5, color: "#2a4032" }}>
                {r}
                <button onClick={() => setRecipients((rs) => rs.filter((x) => x !== r))} aria-label={`Remove ${r}`} style={{ border: "none", background: "transparent", color: "#6a7a6a", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
        )}

        <FieldLabel>Format</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {FORMAT_OPTS.map((f) => (
            <button key={f.id} onClick={() => setFormat(f.id)} style={{ flex: 1, border: `1px solid ${format === f.id ? "#2f4035" : "#d8d4c6"}`, background: format === f.id ? "#eef2ec" : "#fff", color: "#2a2a26", borderRadius: 7, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{f.label}</button>
          ))}
        </div>

        <FieldLabel>Cadence</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {FREQ_OPTS.map((f) => (
            <button key={f.id} onClick={() => setFrequency(f.id)} style={{ flex: 1, border: `1px solid ${frequency === f.id ? "#2f4035" : "#d8d4c6"}`, background: frequency === f.id ? "#eef2ec" : "#fff", color: "#2a2a26", borderRadius: 7, padding: "9px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{f.label}</button>
          ))}
        </div>

        <FieldLabel>Include</FieldLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {INCLUDE_OPTS.map((o) => (
            <label key={o.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "#2a2a26", cursor: "pointer" }}>
              <input type="checkbox" checked={!!include[o.key]} onChange={(e) => setInclude((m) => ({ ...m, [o.key]: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "#2f4035" }} />
              {o.label}
            </label>
          ))}
        </div>

        <FieldLabel>Message (optional)</FieldLabel>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="A short note included at the top of the email…" style={{ ...inputStyle, resize: "vertical" }} />

        <div style={{ marginTop: 14, fontSize: 11.5, color: "#a6a698", lineHeight: 1.6 }}>
          Delivery uses your workspace’s email sender. If email isn’t configured yet, the run is logged with the reason in Recent activity.
        </div>
      </SideWindow>

      {/* Import responses side-window */}
      <SideWindow
        open={importOpen}
        title="Import responses"
        sub="Anonymous CSV merge into an assessment"
        onClose={() => setImportOpen(false)}
        footer={<button onClick={submitImport} disabled={pending || !parsed || parsed.rows.length === 0} style={{ ...primaryBtn, opacity: pending || !parsed || parsed.rows.length === 0 ? 0.6 : 1, cursor: !parsed || parsed.rows.length === 0 ? "default" : "pointer" }}>{parsed && parsed.rows.length ? `Import ${parsed.rows.length} response${parsed.rows.length === 1 ? "" : "s"}` : "Import responses"}</button>}
      >
        <FieldLabel>Target assessment</FieldLabel>
        <select value={importSurvey} onChange={(e) => setImportSurvey(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          {surveys.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <FieldLabel>CSV file</FieldLabel>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ ...inputStyle, padding: "9px 12px", cursor: "pointer" }} />
        <div style={{ marginTop: 9, fontSize: 11.5, color: "#a6a698", lineHeight: 1.6 }}>
          Header row = item keys (one column per question). Numeric cells only; an optional <code>hash</code> column dedupes re-imports.
        </div>

        {parsed && (
          <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e4e1d5", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#2a2a26" }}>{fileName}</div>
            <div style={{ fontSize: 12.5, color: parsed.rows.length ? "#3f7d5a" : "#b8584a", marginTop: 4 }}>
              {parsed.rows.length} valid response{parsed.rows.length === 1 ? "" : "s"} · {parsed.columns.length} item column{parsed.columns.length === 1 ? "" : "s"}
            </div>
            {parsed.columns.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#8a8a7e", marginTop: 6, lineHeight: 1.5 }}>{parsed.columns.slice(0, 12).join(", ")}{parsed.columns.length > 12 ? "…" : ""}</div>
            )}
          </div>
        )}
      </SideWindow>
    </div>
  );
}

// Per-row actions menu in the scheduled-reports table.
function RowMenu({ schedule, pending, onSend, onToggle, onDelete }: {
  schedule: ReportScheduleVM; pending: boolean; onSend: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "Send now", fn: onSend },
    { label: schedule.status === "active" ? "Pause" : "Resume", fn: onToggle },
    { label: "Delete", fn: onDelete, danger: true },
  ];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Report actions" disabled={pending} style={{ width: 32, height: 32, borderRadius: 7, border: "1px solid #d8d4c6", background: "#fff", color: "#585850", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>⋯</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, width: 150, background: "#fff", border: "1px solid #e4e1d5", borderRadius: 9, boxShadow: "0 12px 30px rgba(42,42,38,.16)", padding: 5, zIndex: 60 }}>
            {items.map((it) => (
              <button key={it.label} onClick={() => { setOpen(false); it.fn(); }} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 6, padding: "8px 10px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: it.danger ? "#b8584a" : "#404040" }}>{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ===================== root ===================== */
const RANGE_DAYS: Record<string, number> = { "Last 30 days": 30, "Last 3 months": 90, "Last 6 months": 180, "Last 12 months": 365 };

export function InsightDashboard(props: DashboardProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const [selected, setSelected] = useState<string | null>(props.defaultAssessmentId);
  const [detail, setDetail] = useState<AssessmentDetailVM | null>(props.defaultDetail);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [range, setRange] = useState("Last 6 months");
  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }

  // The date range re-scopes the assessment lists (the rows carry a date).
  const winDays = RANGE_DAYS[range] ?? 0;
  const inWin = (d: string | null) => {
    if (!winDays || !d) return true;
    const t = new Date(d).getTime();
    return isNaN(t) || Date.now() - t <= winDays * 86_400_000;
  };
  const scopedRows = props.assessmentRows.filter((r) => inWin(r.date));

  // Select an assessment and lazily load its detail via the server action. The
  // default one is pre-loaded server-side, so this only fires on an actual
  // change. A row click in Overview also switches to the assessment tab.
  function selectAssessment(id: string) {
    setSelected(id);
    if (detail?.surveyId === id) return;
    startTransition(async () => {
      const { detail: vm } = await assessmentDetail(id);
      setDetail(vm ?? null);
    });
  }
  function openFromOverview(id: string) {
    setTab("assessment");
    selectAssessment(id);
  }

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: "#2a2a26" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Insights</h1>
        <Toolbar range={range} setRange={setRange} rows={scopedRows} onTab={setTab} onToast={flash} />
      </div>

      <div style={{ margin: "2px 0 20px" }}>
        <TabBand tab={tab} setTab={setTab} />
      </div>

      <KpiStrip kpis={props.kpis} />

      {tab === "overview" && <OverviewPanel {...props} assessmentRows={scopedRows} onOpen={openFromOverview} />}
      {tab === "team" && <TeamPanel teams={props.teams} />}
      {tab === "assessment" && (
        <AssessmentPanel rows={scopedRows} selected={selected} detail={detail} loading={pending} onSelect={selectAssessment} />
      )}
      {tab === "workshop" && <WorkshopPanel rows={props.workshopOutcomes} kpis={props.workshopKpis} />}
      {tab === "reports" && (
        <ReportsPanel reports={props.reports} assessmentRows={scopedRows} exportData={scopedRows} onToast={flash} />
      )}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
