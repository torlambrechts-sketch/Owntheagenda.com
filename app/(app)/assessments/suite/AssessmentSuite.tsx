"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/util";
import { FrameworkIcon } from "@/components/FrameworkIcon";
import { SideWindow } from "@/components/SideWindow";
import type { IconKey } from "@/lib/frameworks";
import { loadAssessmentDetail, type AssessmentDetail, type SectionScore, type QuestionScore } from "./actions";
import { updateAssessment, removeAssessment } from "../actions";
import { NewAssessment } from "./NewAssessment";

export type FrameworkChip = { key: string; title: string; accent: string; accentBg: string; iconKey: IconKey };

export type SuiteRow = {
  id: string;
  name: string;
  kind: string;
  category: string;
  status: string;
  team: string | null;
  teamId: string | null;
  respondents: number;
  invited: number | null;
  score: number | null; // overall mean on the instrument scale; null when masked / no responses
  pct: number | null; // overall position 0–100 on the scale; null when masked
  masked: boolean;
  date: string;
  ownerName: string | null;
  startAt: string | null;
  dueAt: string | null;
  below: number; // sections below band (0 when masked / healthy)
};

export type TemplateCard = {
  key: string;
  name: string;
  description: string;
  category: string;
  scope: string;
  sections: number;
  questions: number;
  custom: boolean;
};

type OverviewTab = "dashboard" | "assessments" | "templates";
type DateRange = "30d" | "3m" | "6m" | "12m" | "all";
const DATE_DAYS: Record<DateRange, number> = { "30d": 30, "3m": 90, "6m": 180, "12m": 365, all: 0 };
const DATE_LABEL: Record<DateRange, string> = { "30d": "Last 30 days", "3m": "Last 3 months", "6m": "Last 6 months", "12m": "Last 12 months", all: "All time" };

// Band index from a 0–100 position (mirrors the detail view: below 45% / mid / above).
function bandOfPct(pct: number): 0 | 1 | 2 {
  return pct < 45 ? 0 : pct < 62 ? 1 : 2;
}

export type Kpi = { big: string; title: string; sub: string };

type View = "overview" | "detail";
type DetailTab = "info" | "questions" | "responses" | "results" | "workshop" | "activity";

const BAND_VARS = ["var(--rust)", "var(--amber)", "var(--green)"] as const;
const BAND_LABEL = ["Below band", "Mid band", "Above band"] as const;

function statusPill(status: string) {
  if (status === "open") return <span className="pill sm open">Open</span>;
  if (status === "paused") return <span className="pill sm internal">Paused</span>;
  if (status === "closed") return <span className="pill sm draft">Closed</span>;
  return <span className="pill sm internal">{status || "Draft"}</span>;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// "in 6 days" / "today" / "started" for a scheduled card's start date.
function startsInLabel(iso: string | null) {
  if (!iso) return "no date set";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "no date set";
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "started";
  if (days === 0) return "starts today";
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

function prettyCategory(c: string) {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

// A donut showing the response rate — the design's right-rail signature. Pure
// SVG so it inherits the design tokens without any extra dependency.
function ResponseRing({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - clamped / 100);
  return (
    <svg width={96} height={96} viewBox="0 0 92 92" role="img" aria-label={`${Math.round(clamped)} percent responded`}>
      <circle cx={46} cy={46} r={r} fill="none" stroke="var(--canvas-2)" strokeWidth={9} />
      <circle
        cx={46}
        cy={46}
        r={r}
        fill="none"
        stroke="var(--green)"
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 46 46)"
      />
      <text x={46} y={52} textAnchor="middle" fontSize={20} fontWeight={600} fill="var(--ink)" fontFamily="var(--font-display)">
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}

export function AssessmentSuite({ rows, kpis, alert = null, isAdmin = false, canStart = false, manageableTeamIds = [], teams = [], templates = [], templateCards = [], frameworkChips = [], composeKind = null }: { rows: SuiteRow[]; kpis: Kpi[]; alert?: { sections: number; assessments: number } | null; isAdmin?: boolean; canStart?: boolean; manageableTeamIds?: string[]; teams?: { id: string; name: string; count?: number }[]; templates?: { key: string; name: string }[]; templateCards?: TemplateCard[]; frameworkChips?: FrameworkChip[]; composeKind?: string | null }) {
  const canManageRow = (r: SuiteRow) => isAdmin || (!!r.teamId && manageableTeamIds.includes(r.teamId));
  const [view, setView] = useState<View>("overview");
  const [newOpen, setNewOpen] = useState(false);
  const [active, setActive] = useState<SuiteRow | null>(null);
  const [tab, setTab] = useState<DetailTab>("info");
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [otab, setOtab] = useState<OverviewTab>("dashboard");
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<string>("all");
  const [fBelow, setFBelow] = useState(false);
  const [fDate, setFDate] = useState<DateRange>("6m");
  const [fTeam, setFTeam] = useState<string>("all");
  const [editTarget, setEditTarget] = useState<SuiteRow | null>(null);
  const [editSchedOnly, setEditSchedOnly] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<SuiteRow | null>(null);
  const router = useRouter();
  // A framework's "Use this framework" CTA deep-links to ?compose=<key>; open
  // the send wizard with that instrument preselected.
  useEffect(() => {
    if (composeKind && canStart) setNewOpen(true);
  }, [composeKind, canStart]);
  // Close popovers on Escape / outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest?.("[data-filter-root]")) setFilterOpen(false);
      if (!t.closest?.("[data-menu-root]")) setMenuOpen(false);
      if (!t.closest?.("[data-rowmenu-root]")) setRowMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function open(row: SuiteRow) {
    setActive(row);
    setTab("info");
    setDetail(null);
    setError(null);
    setView("overview"); // keep list mounted under the load
    setLoading(true);
    const res = await loadAssessmentDetail(row.id);
    setLoading(false);
    if (res.error || !res.detail) {
      setError(res.error ?? "Could not load this assessment.");
      setView("detail");
      return;
    }
    setDetail(res.detail);
    setView("detail");
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }

  function back() {
    setView("overview");
    setActive(null);
    setDetail(null);
  }

  // --- printable report (browser print → Save as PDF), same pattern as the library ---
  function exportReport() {
    if (!active || !detail) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));
    const bars = detail.scores
      .map((s) => {
        const color = s.band === 0 ? "#b8584a" : s.band === 1 ? "#a8862f" : "#3f7d5a";
        return `<div class="row"><span class="nm">${esc(s.label)}</span><span class="track"><span class="fill" style="width:${s.pct.toFixed(0)}%;background:${color}"></span></span><span class="sc" style="color:${color}">${s.mean.toFixed(1)}</span></div>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(active.name)} — report</title>
<style>body{font-family:Georgia,'Times New Roman',serif;color:#1f2421;margin:46px;line-height:1.55}
h1{font-size:24px;margin:0 0 2px}.meta{color:#6b726c;font-size:13px;margin-bottom:24px}
.row{display:flex;align-items:center;gap:12px;margin:9px 0}.nm{width:200px;font-size:13px}
.track{flex:1;height:9px;border-radius:999px;background:#eee;overflow:hidden}.fill{display:block;height:100%;border-radius:999px}
.sc{width:34px;text-align:right;font-weight:700;font-size:13px}
.foot{color:#7a817b;font-size:12px;margin-top:24px;border-top:1px solid #e3e6e2;padding-top:10px}</style>
</head><body><h1>${esc(active.name)}</h1>
<div class="meta">${active.team ? esc(active.team) + " · " : ""}${fmtDate(active.date)} · ${detail.respondents} responses</div>
${detail.scores.length ? bars : "<p>Results are hidden until the minimum number of people have responded.</p>"}
<div class="foot">Overall ${detail.overall != null ? detail.overall.toFixed(1) : "—"} · scale ${detail.scale.min}–${detail.scale.max} · generated by Owntheagenda</div>
<script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  // ---------------- OVERVIEW ----------------
  if (view === "overview") {
    const q = query.trim().toLowerCase();
    const matches = (r: SuiteRow) => !q || `${r.name} ${r.team ?? ""}`.toLowerCase().includes(q);
    // Date-range + team scope drives both the Dashboard KPIs and the table.
    const days = DATE_DAYS[fDate];
    const inWindow = (r: SuiteRow) => {
      if (!days) return true;
      const t = new Date(r.date).getTime();
      return isNaN(t) || Date.now() - t <= days * 86_400_000;
    };
    const teamMatch = (r: SuiteRow) => fTeam === "all" || r.teamId === fTeam;
    const scoped = rows.filter((r) => inWindow(r) && teamMatch(r));
    const activeRows = scoped.filter((r) => r.status !== "scheduled" && r.status !== "draft");
    const scheduledRows = scoped.filter((r) => r.status === "scheduled" || r.status === "draft");
    const tableRows = activeRows.filter(
      (r) => matches(r) && (fStatus === "all" || r.status === fStatus) && (!fBelow || r.below > 0),
    );
    const filterCount = (fStatus !== "all" ? 1 : 0) + (fBelow ? 1 : 0) + (fDate !== "6m" ? 1 : 0) + (fTeam !== "all" ? 1 : 0);
    const teamOpts = Array.from(new Map(rows.filter((r) => r.teamId).map((r) => [r.teamId as string, r.team ?? "Team"])).entries()).map(([id, name]) => ({ id, name }));

    // Dashboard KPIs computed from the scoped set (handoff 3 set, floor-safe).
    const kActive = activeRows.filter((r) => r.status === "open").length;
    const scored = activeRows.filter((r) => r.pct != null);
    const kAvg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.pct ?? 0), 0) / scored.length) : null;
    const kResp = scoped.reduce((a, r) => a + r.respondents, 0);
    const kBelow = activeRows.reduce((a, r) => a + r.below, 0);
    const belowAssess = activeRows.filter((r) => r.below > 0).length;
    const dashKpis = [
      { big: String(kActive), lab: "Active assessments", rust: false },
      { big: kAvg == null ? "—" : String(kAvg), lab: "Avg score · /100", rust: false },
      { big: String(kResp), lab: "Responses", rust: false },
      { big: String(kBelow), lab: "Below target", rust: kBelow > 0, warn: kBelow > 0 ? `${kBelow} ${kBelow === 1 ? "section is" : "sections are"} below target across ${belowAssess} ${belowAssess === 1 ? "assessment" : "assessments"}. A follow-up workshop is recommended — a person reviews first.` : undefined },
    ];

    // Aggregate-only export of the current (scoped) assessment list.
    const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const exportHead = ["Assessment", "Team", "Status", "Responses", "Invited", "Score (0-100)"];
    const exportData = activeRows.map((r) => [r.name, r.team ?? "", r.status, r.respondents, r.invited ?? "", r.masked || r.pct == null ? "" : r.pct]);
    const download = (name: string, mime: string, content: string) => {
      const blob = new Blob([content], { type: mime });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = u; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 0);
    };
    const esc = (s: string) => s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));
    const tableHtml = `<table border="1" cellspacing="0" cellpadding="6"><thead><tr>${exportHead.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${exportData.map((row) => `<tr>${row.map((c) => `<td>${esc(String(c ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const exportCsv = () => { setMenuOpen(false); download("assessments.csv", "text/csv;charset=utf-8", [exportHead.join(","), ...exportData.map((r) => r.map(csvCell).join(","))].join("\n")); };
    const exportXls = () => { setMenuOpen(false); download("assessments.xls", "application/vnd.ms-excel", `<html><head><meta charset="utf-8"></head><body>${tableHtml}</body></html>`); };
    const exportPdf = () => {
      setMenuOpen(false);
      const w = window.open("", "_blank", "width=900,height=1000"); if (!w) return;
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Assessments</title><style>body{font-family:Georgia,serif;margin:40px}h1{font-size:22px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f3f1e8}</style><h1>Assessments</h1>${tableHtml}<script>onload=()=>print()</script>`);
      w.document.close();
    };

    return (
      <>
        <div className="a-phead" style={{ marginBottom: 18 }}>
          <div><div className="a-pt">Assessments</div></div>
          <div className="a-pr" style={{ alignItems: "center" }}>
            {canStart ? (
              <button className="btn-prim" onClick={() => (otab === "templates" ? router.push("/assessments/builder?new=template") : setNewOpen(true))}>
                ＋ {otab === "templates" ? "New template" : "New assessment"}
              </button>
            ) : null}
            {/* Filters */}
            <div className="as-filterwrap" data-filter-root="1">
              <button className={`btn-sec as-filterbtn${filterCount ? " on" : ""}`} onClick={() => { setFilterOpen((o) => !o); setMenuOpen(false); }} aria-expanded={filterOpen}>
                ⚙ Filters{filterCount ? <span className="as-filtercount">{filterCount}</span> : null} ▾
              </button>
              {filterOpen ? (
                <div className="as-filtermenu" role="menu">
                  <div className="as-filterhead"><span>Filters</span><button className="linkbtn" onClick={() => { setFStatus("all"); setFBelow(false); setFDate("6m"); setFTeam("all"); }}>Clear all</button></div>
                  <div className="as-flabel">Date range</div>
                  <div className="as-fradios">
                    {(["30d", "3m", "6m", "12m", "all"] as DateRange[]).map((d) => (
                      <label key={d} className="as-fradio" onClick={(e) => { e.preventDefault(); setFDate(d); }}>
                        <span className={`as-radio${fDate === d ? " on" : ""}`} aria-hidden />{DATE_LABEL[d]}
                      </label>
                    ))}
                  </div>
                  <div className="as-flabel">Team</div>
                  <div className="as-fradios">
                    <label className="as-fradio" onClick={(e) => { e.preventDefault(); setFTeam("all"); }}><span className={`as-radio${fTeam === "all" ? " on" : ""}`} aria-hidden />All teams</label>
                    {teamOpts.map((t) => (
                      <label key={t.id} className="as-fradio" onClick={(e) => { e.preventDefault(); setFTeam(t.id); }}><span className={`as-radio${fTeam === t.id ? " on" : ""}`} aria-hidden />{t.name}</label>
                    ))}
                  </div>
                  <div className="as-flabel">Status</div>
                  <div className="as-fchips">
                    {(["all", "open", "closed", "paused"] as const).map((s) => (
                      <button key={s} className={`as-fchip${fStatus === s ? " on" : ""}`} onClick={() => setFStatus(s)}>{s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</button>
                    ))}
                  </div>
                  <label className="as-fcheck" onClick={(e) => { e.preventDefault(); setFBelow((v) => !v); }}>
                    <span className={`chk${fBelow ? " on" : ""}`} aria-hidden>{fBelow ? "✓" : ""}</span>Below target only
                  </label>
                </div>
              ) : null}
            </div>
            {/* "…" overflow menu */}
            <div className="as-filterwrap" data-menu-root="1">
              <button className="icon-btn as-morebtn" title="More" onClick={() => { setMenuOpen((o) => !o); setFilterOpen(false); }}>⋯</button>
              {menuOpen ? (
                <div className="as-moremenu" role="menu">
                  <button className="as-moreitem" onClick={() => { setMenuOpen(false); router.push("/assessments/frameworks"); }}>📖 Frameworks</button>
                  <button className="as-moreitem" onClick={() => { setMenuOpen(false); router.push("/assessments/builder"); }}>✎ Build from scratch</button>
                  <button className="as-moreitem" onClick={() => { setMenuOpen(false); router.push("/insight"); }}>⬆ Import responses</button>
                  <div className="as-moresec">Export</div>
                  <button className="as-moreitem" onClick={exportPdf}>📄 Export as PDF</button>
                  <button className="as-moreitem" onClick={exportXls}>📊 Export as Excel</button>
                  <button className="as-moreitem" onClick={exportCsv}>📑 Export as CSV</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* forest segmented tab band */}
        <nav className="as-tabband" aria-label="Assessments">
          {([
            ["dashboard", "Dashboard", activeRows.length],
            ["assessments", "Assessments", tableRows.length],
            ["templates", "Templates", templateCards.length],
          ] as [OverviewTab, string, number][]).map(([key, label, count]) => (
            <button key={key} className={`as-tabbtn${otab === key ? " on" : ""}`} onClick={() => { setOtab(key); setFilterOpen(false); setMenuOpen(false); }}>
              {label}<span className="as-tabbtn-n">{count}</span>
            </button>
          ))}
        </nav>

        {/* ---- DASHBOARD ---- */}
        {otab === "dashboard" ? (
          <>
            <div className="as-kpis">
              {dashKpis.map((k, i) => (
                <div className="as-kpi" key={i}>
                  <div className="as-kpi-big" style={k.rust ? { color: "var(--rust)" } : undefined}>
                    {k.big}
                    {k.warn ? <span className="as-kpiwarn" title={k.warn} aria-label={k.warn}> ⚠</span> : null}
                  </div>
                  <div className="as-kpi-title">{k.lab}</div>
                </div>
              ))}
            </div>

            {frameworkChips.length ? (
              <div className="fw-strip">
                <div className="fw-strip-h">
                  <span className="fw-strip-t">📖 Built on validated frameworks <span className="fw-strip-sub">— every assessment maps to peer-reviewed science</span></span>
                  <Link href="/assessments/frameworks" className="linkbtn">View all →</Link>
                </div>
                <div className="fw-strip-grid">
                  {frameworkChips.map((f) => (
                    <Link key={f.key} href={`/assessments/frameworks/${encodeURIComponent(f.key)}`} className="fw-chip" style={{ borderLeftColor: f.accent }}>
                      <span className="fw-chip-ic" style={{ background: f.accentBg, color: f.accent }}><FrameworkIcon icon={f.iconKey} size={16} /></span>
                      <span className="fw-chip-t">{f.title}</span>
                      <span className="fw-chip-arrow">↗</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="as-tablehead" style={{ border: "none", padding: "4px 0 12px" }}>
              <span className="cat-head" style={{ margin: 0 }}>Scheduled &amp; upcoming <span className="n">{scheduledRows.length}</span></span>
              {canStart ? <button className="btn-sec" onClick={() => setNewOpen(true)}>＋ Schedule one</button> : null}
            </div>
            {scheduledRows.length ? (
              <div className="as-sched">
                {scheduledRows.map((r) => (
                  <div key={r.id} className="as-schedcard" onClick={() => open(r)}>
                    <span className="as-schedaccent" style={{ background: r.status === "draft" ? "var(--draft-fg)" : "var(--role)" }} />
                    <div className="as-schedbody">
                      <div className="as-schedmain">
                        <div className="as-schedtitle"><span>{r.name}</span><span className="pill sm interview">Survey</span></div>
                        <div className="as-schedmeta"><span>👥 {r.team ?? "—"}{r.invited ? ` · ${r.invited}` : ""}</span></div>
                      </div>
                      <div className="as-schedwhen">
                        <div><div className="as-schedlab">Starts</div><div className="as-schedval">{r.startAt ? fmtDate(r.startAt) : "—"}</div></div>
                        <div><div className="as-schedlab">Due</div><div className="as-schedval">{r.dueAt ? fmtDate(r.dueAt) : "—"}</div></div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                          {statusPill(r.status)}<span style={{ fontSize: 11.5, color: "var(--faint)" }}>{startsInLabel(r.startAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">Nothing scheduled. Use “New assessment” and choose “Schedule” to queue one.</div>}
          </>
        ) : null}

        {/* ---- ASSESSMENTS ---- */}
        {otab === "assessments" ? (
          <>
            {kBelow > 0 ? (
              <div className="as-alert">
                <span className="as-alert-ic" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
                </span>
                <div><b>{kBelow} {kBelow === 1 ? "section" : "sections"}</b> across {belowAssess} {belowAssess === 1 ? "assessment" : "assessments"} {kBelow === 1 ? "is" : "are"} below target. A follow-up workshop is a candidate — a person reviews before anything is scheduled.</div>
                <span className="grounded" style={{ marginLeft: "auto", flexShrink: 0 }}>Grounded</span>
              </div>
            ) : null}
            <div className="tbl-card">
              <div className="as-tablehead">
                <span className="cat-head" style={{ margin: 0 }}>All assessments <span className="n">{tableRows.length}</span></span>
                <input className="inp as-search" placeholder="Search title, team…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {tableRows.length ? (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Assessment</th><th style={{ width: 96 }}>Type</th><th style={{ width: 100 }}>Status</th>
                      <th style={{ width: 150 }}>Responses</th><th style={{ width: 132 }}>Score</th><th style={{ width: 110 }}>Owner</th><th style={{ width: 48 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r) => (
                      <tr key={r.id} onClick={() => open(r)} style={{ cursor: "pointer" }}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            {r.below > 0 ? <span className="as-flagdot" title="Below target" /> : null}
                            <span><span style={{ fontWeight: 600 }}>{r.name}</span><small style={{ display: "block", color: "var(--faint)" }}>{r.team ?? ""}{r.team ? " · " : ""}{fmtDate(r.date)}</small></span>
                          </span>
                        </td>
                        <td><span className="pill sm interview">Survey</span></td>
                        <td>{statusPill(r.status)}</td>
                        <td><RowResponses respondents={r.respondents} invited={r.invited} /></td>
                        <td><RowScore score={r.score} pct={r.pct} masked={r.masked} respondents={r.respondents} /></td>
                        <td>{r.ownerName ? <span className="av sm green" title={r.ownerName}>{initials(r.ownerName)}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                        <td className="r">
                          {canManageRow(r) ? (
                            <div className="as-filterwrap" data-rowmenu-root="1" style={{ display: "inline-block" }}>
                              <button className="icon-btn" title="More" onClick={(e) => { e.stopPropagation(); setRowMenu((m) => (m === r.id ? null : r.id)); }}>⋯</button>
                              {rowMenu === r.id ? (
                                <div className="as-moremenu" role="menu" onClick={(e) => e.stopPropagation()}>
                                  <button className="as-moreitem" onClick={() => { setRowMenu(null); setEditSchedOnly(false); setEditTarget(r); }}>✎ Edit assessment</button>
                                  <button className="as-moreitem" onClick={() => { setRowMenu(null); setEditSchedOnly(true); setEditTarget(r); }}>🗓 Edit schedule</button>
                                  <button className="as-moreitem" onClick={() => { setRowMenu(null); open(r); }}>👁 Preview</button>
                                  <button className="as-moreitem danger" onClick={() => { setRowMenu(null); setConfirmTarget(r); }}>🗑 Delete</button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">
                  {activeRows.length ? "No assessments match these filters." : "No assessments run yet — start one with “New assessment”."}
                  {(filterCount || q) ? <><br /><button className="btn-sec" style={{ marginTop: 10 }} onClick={() => { setFStatus("all"); setFBelow(false); setFDate("6m"); setFTeam("all"); setQuery(""); }}>Clear filters</button></> : null}
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* ---- TEMPLATES ---- */}
        {otab === "templates" ? (
          <div>
            {templateCards.length ? (
              <div className="as-tplgrid">
                {templateCards.map((t) => (
                  <div key={t.key} className="as-tplcard">
                    <div className="as-tplhead">
                      <span className={`as-tplicon cat-${t.category}`}>▤</span>
                      <span className="pill sm draft">{t.custom ? "Custom" : prettyCategory(t.category)}</span>
                    </div>
                    <div className="as-tpltitle">{t.name}</div>
                    <div className="as-tpldesc">{t.description || `${t.scope === "team" ? "Team" : "Individual"} assessment.`}</div>
                    <div className="as-tplfoot">
                      <span className="as-tplmeta">{t.sections} sections · {t.questions} Q</span>
                      {isAdmin ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          {t.custom ? (
                            <Link className="icon-btn" title="Edit" href={`/assessments/builder?tpl=${encodeURIComponent(t.key)}`}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            </Link>
                          ) : null}
                          <Link className="btn-sec" href={`/assessments/builder?use=${encodeURIComponent(t.key)}`}>{t.custom ? "Use →" : "Clone →"}</Link>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">No templates yet. Build one to reuse it across teams.</div>}
          </div>
        ) : null}

        {loading ? <div className="a-note" style={{ marginTop: 14 }}>Loading assessment…</div> : null}
        <NewAssessment open={newOpen} teams={teams} templates={templates} initialKind={composeKind} onClose={() => setNewOpen(false)} />
        <EditAssessment target={editTarget} scheduleOnly={editSchedOnly} teams={teams} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); router.refresh(); }} />
        {confirmTarget ? (
          <DeleteConfirm row={confirmTarget} onCancel={() => setConfirmTarget(null)} onDone={() => { setConfirmTarget(null); router.refresh(); }} />
        ) : null}
      </>
    );
  }

  // ---------------- DETAIL ----------------
  // Top-line numbers shown above every tab (the design's KPI strip): response
  // rate, lowest section, overall mean, sections below band. Score figures stay
  // "—" while results are masked so a small response set is never inferable.
  const detailKpis: Kpi[] = detail
    ? [
        {
          big: detail.invited ? `${detail.respondents}/${detail.invited}` : String(detail.respondents),
          title: "Responses",
          sub: detail.invited ? `${Math.round((detail.respondents / detail.invited) * 100)}% response rate` : "anonymous in aggregate",
        },
        {
          big: detail.masked || detail.overall == null ? "—" : detail.overall.toFixed(1),
          title: "Overall mean",
          sub: `scale ${detail.scale.min}–${detail.scale.max}`,
        },
        {
          big: detail.masked || !detail.lowestLabel ? "—" : (detail.scores.find((s) => s.label === detail.lowestLabel)?.mean.toFixed(1) ?? "—"),
          title: "Lowest section",
          sub: detail.masked ? "hidden until results unlock" : detail.lowestLabel ?? "—",
        },
        {
          big: detail.masked ? "—" : String(detail.belowCount),
          title: "Sections below band",
          sub: "candidates for a workshop",
        },
      ]
    : [];

  return (
    <>
      <div className="a-phead">
        <button className="a-back" onClick={back} aria-label="Back">‹</button>
        <div>
          <div className="a-pt">{active?.name}</div>
          <div className="a-ps">
            {active?.team ? `${active.team} · ` : ""}{active ? fmtDate(active.date) : ""}
            {detail ? ` · ${detail.respondents} responses` : ""}
          </div>
        </div>
        <div className="a-pr">
          {active ? statusPill(active.status) : null}
          {detail && detail.scores.length ? <button className="btn-sec" onClick={exportReport}>⤓ Export report</button> : null}
          {active && active.status !== "closed" && canManageRow(active) ? <Link className="btn-sec" href={`/assessments/status/${active.id}`}>Live status →</Link> : null}
          <Link className="btn-prim" href="/workshops">Open workshop →</Link>
        </div>
      </div>

      {error ? <div className="a-note" style={{ marginTop: 14 }}>{error}</div> : null}

      {detail ? (
        <>
          <div className="as-kpis">
            {detailKpis.map((k, i) => (
              <div className="as-kpi" key={i}>
                <div className="as-kpi-big" style={k.title === "Sections below band" && !detail.masked && detail.belowCount ? { color: "var(--rust)" } : undefined}>{k.big}</div>
                <div className="as-kpi-title">{k.title}</div>
                <div className="as-kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          <nav className="as-tabs" aria-label="Assessment detail">
            {([
              ["info", "Information"],
              ["questions", "Questions"],
              ["responses", "Responses"],
              ["results", "Results"],
              ["workshop", "Workshop"],
              ["activity", "Activity"],
            ] as [DetailTab, string][]).map(([key, label]) => (
              <button key={key} className={`as-tab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>

          {/* Two-column body — tab content on the left, a persistent context rail
              on the right (response ring, details, linked workshop). */}
          <div className="a-detailgrid">
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
              {tab === "info" ? (
                <>
                  <div className="a-ovcard">
                    <h3>About this assessment</h3>
                    <p>
                      An anonymous {detail.instrumentName} survey. {detail.questions.length} questions across {detail.sections.length} {detail.sections.length === 1 ? "section" : "sections"},
                      scored on a {detail.scale.min}–{detail.scale.max} scale. Results stay hidden until enough people respond, then surface as section means — where a section falls below the healthy band, it is a candidate for a follow-up workshop.
                    </p>
                  </div>
                  <div className="tbl-card">
                    <div className="as-qgroup" style={{ textTransform: "none", letterSpacing: 0, fontSize: 13 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Survey sections</span>
                    </div>
                    {detail.sections.map((s) => (
                      <div className="as-qrow" key={s.key} style={{ justifyContent: "space-between" }}>
                        <span>{s.label}</span>
                        <span className="a-dimchip" style={{ fontVariantNumeric: "tabular-nums" }}>{s.count} {s.count === 1 ? "question" : "questions"}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {tab === "questions" ? (
                <div className="tbl-card">
                  {detail.sections.map((sec) => (
                    <div key={sec.key}>
                      <div className="as-qgroup">{sec.label} <span className="n">{sec.count}</span></div>
                      {detail.questions.filter((q) => q.dimension === sec.key).map((q, i) => (
                        <div className="as-qrow" key={q.key}>
                          <span className="as-qn">{i + 1}</span>
                          <span>{q.text}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "responses" ? (
                <div className="a-ovcard">
                  <h3>Responses <span style={{ fontWeight: 500, color: "var(--faint)" }}>· {detail.respondents}{detail.invited != null ? ` / ${detail.invited}` : ""}</span></h3>
                  {detail.respondents ? (
                    <>
                      <p>
                        {detail.respondents} {detail.respondents === 1 ? "person has" : "people have"} responded.
                        {detail.masked
                          ? " Individual submissions stay hidden until the minimum number of responses is reached — answers are never attributed to a person."
                          : " Responses are anonymous in aggregate; no answer is tied to a person."}
                      </p>
                      {detail.submissions.length ? (
                        <table className="tbl" style={{ marginTop: 6 }}>
                          <thead>
                            <tr><th>Respondent</th><th style={{ width: 180 }}>Submitted</th></tr>
                          </thead>
                          <tbody>
                            {detail.submissions.map((when, i) => (
                              <tr key={i}>
                                <td><span className="person" style={{ fontWeight: 500 }}><span className="av sm">?</span>Anonymous respondent</span></td>
                                <td style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{fmtDateTime(when)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </>
                  ) : (
                    <p className="muted">No responses yet. {active?.status === "open" ? "The assessment is open — results will appear here as people respond." : "This assessment is closed with no responses."}</p>
                  )}
                </div>
              ) : null}

              {tab === "results" ? (
                <SectionResults detail={detail} />
              ) : null}

              {tab === "workshop" ? (
                <div className="as-workshop">
                  <div className="as-ws-eyebrow">{detail.linkedWorkshop ? "Linked workshop" : "Follow-up workshop"}</div>
                  <div className="as-ws-title">
                    {detail.linkedWorkshop
                      ? detail.linkedWorkshop.title
                      : detail.belowCount
                        ? `${detail.belowCount} ${detail.belowCount === 1 ? "section is" : "sections are"} below the healthy band`
                        : "No section is below the band"}
                  </div>
                  <p className="as-ws-sub">
                    {detail.linkedWorkshop
                      ? "This assessment is carried into a workshop — open it to review the agenda, run the session and track the measures agreed."
                      : detail.belowCount
                        ? "A targeted workshop helps the team work through the lowest-scoring sections together — diagnose causes, agree measures and assign owners."
                        : "Scores look healthy. You can still run a workshop to build on strengths or revisit a theme."}
                  </p>
                  {/* Below-band sections that motivate the workshop (the design's
                      "Why a workshop was triggered" list). */}
                  {!detail.masked && detail.belowCount ? (
                    <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 10, padding: "12px 14px", margin: "0 0 16px" }}>
                      {detail.scores.filter((s) => s.band === 0).map((s) => (
                        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
                          <span style={{ width: 150, flexShrink: 0, fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                          <span style={{ flex: 1, height: 8, borderRadius: 999, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
                            <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${s.pct.toFixed(0)}%`, background: "#e7b3aa" }} />
                          </span>
                          <span style={{ width: 34, textAlign: "right", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.mean.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {detail.linkedWorkshop ? (
                    <Link className="btn-prim" href={`/workshops/${detail.linkedWorkshop.id}/overview`}>Open workshop →</Link>
                  ) : (
                    <Link className="btn-prim" href="/workshops">Start a workshop →</Link>
                  )}
                </div>
              ) : null}

              {tab === "activity" ? (
                <div className="a-ovcard">
                  <h3>Activity</h3>
                  {detail.activity.length ? (
                    <div className="wsd-log">
                      {detail.activity.map((e) => (
                        <div className="wsd-log-row" key={e.id}>
                          <span className="wsd-log-dot" />
                          <div>
                            <div className="wsd-log-l">{e.label}</div>
                            <div className="wsd-log-m">{e.actor} · {fmtDateTime(e.at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No activity recorded yet. Lifecycle events (opened, closed) appear here — visible to workspace admins.</p>
                  )}
                </div>
              ) : null}
            </div>

            {/* ---- right rail (persistent context) ---- */}
            <aside className="a-rail">
              {detail.invited ? (
                <div className="a-ovcard">
                  <div className="eyebrow" style={{ marginBottom: 10 }}>Response rate</div>
                  <div className="a-ring"><ResponseRing pct={(detail.respondents / detail.invited) * 100} /></div>
                  <div className="a-ringsub">{detail.respondents} of {detail.invited} invited responded</div>
                </div>
              ) : null}

              <div className="a-ovcard">
                <div className="eyebrow" style={{ marginBottom: 10 }}>Details</div>
                <div className="a-facts">
                  <Fact k="Type" v={`${active?.category ?? "Survey"} · ${detail.questions.length}Q`} />
                  <Fact k="Sections" v={String(detail.sections.length)} />
                  <Fact k="Scale" v={`${detail.scale.min}–${detail.scale.max}`} />
                  <Fact k="Anonymous" v="Yes" />
                  <Fact k="Team" v={active?.team ?? "—"} />
                  <Fact k="Status" v={active ? (active.status.charAt(0).toUpperCase() + active.status.slice(1)) : "—"} />
                </div>
              </div>

              {/* The Workshop tab already shows the linked-workshop card in the
                  main column, so skip the rail duplicate there. */}
              {tab === "workshop" ? null : detail.linkedWorkshop ? (
                <Link href={`/workshops/${detail.linkedWorkshop.id}/overview`} className="as-workshop compact a-railcta" style={{ display: "block", textDecoration: "none" }}>
                  <div className="as-ws-eyebrow">Linked workshop</div>
                  <div className="as-ws-title" style={{ fontSize: 15.5 }}>{detail.linkedWorkshop.title}</div>
                  <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "#fff" }}>Open workshop →</div>
                </Link>
              ) : !detail.masked && detail.belowCount ? (
                <button onClick={() => setTab("workshop")} className="as-workshop compact a-railcta" style={{ textAlign: "left", border: "none", width: "100%", cursor: "pointer" }}>
                  <div className="as-ws-eyebrow">Follow-up</div>
                  <div className="as-ws-title" style={{ fontSize: 15.5 }}>{detail.belowCount} {detail.belowCount === 1 ? "section" : "sections"} below band</div>
                  <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "#fff" }}>Why a workshop helps →</div>
                </button>
              ) : null}
            </aside>
          </div>
        </>
      ) : loading ? (
        <div className="a-note" style={{ marginTop: 14 }}>Loading assessment…</div>
      ) : null}
    </>
  );
}

function SectionResults({ detail }: { detail: AssessmentDetail }) {
  if (detail.masked || !detail.scores.length) {
    return (
      <div className="empty">
        Results stay hidden until at least the minimum number of people respond — individual answers are never shown.
        {detail.respondents ? ` (${detail.respondents} so far.)` : ""}
      </div>
    );
  }
  return (
    <>
      <div className="a-ovcard">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Section scores</h3>
          <span style={{ fontSize: 11, color: "var(--faint)" }}>bands, not more-is-better · scale {detail.scale.min}–{detail.scale.max}</span>
        </div>
        {detail.scores.map((s) => <ScoreBand key={s.key} s={s} targetLowPct={detail.targetLowPct} />)}
        <div className="bandlegend" style={{ marginTop: 14 }}>
          <span><span className="swatch-band" /> Healthy band ≥ {((detail.scale.min + (detail.scale.max - detail.scale.min) * (detail.targetLowPct / 100))).toFixed(1)}</span>
          <span><span className="swatch-mark" /> Section mean</span>
        </div>
      </div>

      {/* Human-in-the-loop note — a number is never a verdict (DESIGN §6). */}
      <div className="humannote">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div>
          Section means show where a team sits in a healthy range — not a score to beat, and never a verdict on a person.
          {detail.belowCount
            ? ` ${detail.belowCount} ${detail.belowCount === 1 ? "section is" : "sections are"} below the band and a candidate for a follow-up workshop — a human reviews before anything is scheduled.`
            : " Every section is within band; results reflect how people feel, not objective fact."}
          <div className="src">
            {detail.respondents} responses · anonymous in aggregate · <span className="grounded" style={{ marginLeft: 2 }}>Grounded</span>
          </div>
        </div>
      </div>

      {detail.questionScores.length ? (
        <div className="a-ovcard">
          <h3>Question breakdown</h3>
          {detail.questionScores.map((q) => <QuestionRow key={q.key} q={q} />)}
        </div>
      ) : null}
    </>
  );
}

// Section score on the band track — a target band from the healthy lower edge up,
// with the section mean as a marker. Mirrors the AssessmentsClient band signature.
function ScoreBand({ s, targetLowPct }: { s: SectionScore; targetLowPct: number }) {
  const color = BAND_VARS[s.band];
  return (
    <div className="bandrow">
      <div className="name">{s.label}</div>
      <div className="bandtrack">
        <div className="target" style={{ left: `${targetLowPct}%`, right: 0 }} />
        <div className="marker" style={{ left: `${s.pct.toFixed(0)}%`, background: color }} />
      </div>
      <div className="read">
        <span style={{ color, fontWeight: 700 }}>{s.mean.toFixed(1)}</span>
        <br />
        <span style={{ color: "var(--faint)" }}>{BAND_LABEL[s.band]}</span>
      </div>
    </div>
  );
}

function QuestionRow({ q }: { q: QuestionScore }) {
  const color = BAND_VARS[q.band];
  return (
    <div className="a-qbreak">
      <span className="q">{q.text}</span>
      <span className="track"><span style={{ width: `${q.pct.toFixed(0)}%`, background: color }} /></span>
      <span className="v" style={{ color }}>{q.mean.toFixed(1)}</span>
    </div>
  );
}

// Overview "Responses" cell — count over invited with a fill bar (the design's
// response-rate bar). Falls back to a bare count when the team size is unknown.
function RowResponses({ respondents, invited }: { respondents: number; invited: number | null }) {
  if (!invited) {
    return <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{respondents}</span>;
  }
  const pct = Math.min(100, Math.round((respondents / invited) * 100));
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>{respondents} / {invited}</div>
      <span className="as-rowbar"><span style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

// Overview "Score" cell — overall mean with a band marker on a target track
// (the design's score column). "—" while masked / before any responses.
function RowScore({ score, pct, masked, respondents }: { score: number | null; pct: number | null; masked: boolean; respondents: number }) {
  if (score == null || pct == null) {
    return <span style={{ color: "var(--faint)" }} title={masked && respondents ? "Hidden until enough people respond" : "No responses yet"}>—</span>;
  }
  const color = BAND_VARS[bandOfPct(pct)];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 28, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>{score.toFixed(1)}</span>
      <span className="as-rowscore">
        <span className="target" style={{ left: "45%", right: 0 }} />
        <span className="marker" style={{ left: `${Math.min(100, Math.max(0, pct)).toFixed(0)}%`, background: color }} />
      </span>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return <div className="a-fact"><span className="k">{k}</span><span className="v">{v}</span></div>;
}

// Edit an existing assessment — title + schedule + reminders + min, and ADD
// recipients. Anonymity + the instrument are deliberately not editable (would
// corrupt scoring once responses exist). scheduleOnly trims it to the dates.
function EditAssessment({ target, scheduleOnly, teams, onClose, onSaved }: {
  target: SuiteRow | null;
  scheduleOnly: boolean;
  teams: { id: string; name: string; count?: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startT] = useTransition();
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminders, setReminders] = useState(true);
  const [minP, setMinP] = useState(5);
  const [addTeams, setAddTeams] = useState<string[]>([]);
  const [emails, setEmails] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setTitle(target.name);
      setStartAt(target.startAt ? target.startAt.slice(0, 10) : "");
      setDueAt(target.dueAt ? target.dueAt.slice(0, 10) : "");
      setAddTeams([]); setEmails(""); setError(null); setReminders(true); setMinP(5);
    }
  }, [target]);

  function save() {
    if (!target) return;
    setError(null);
    const emailList = emails.match(/[^\s,;]+@[^\s,;]+/g) ?? [];
    startT(async () => {
      const res = await updateAssessment({
        surveyId: target.id,
        title: scheduleOnly ? undefined : title.trim(),
        startAt: target.startAt && startAt === "" ? "" : startAt || undefined,
        dueAt: target.dueAt && dueAt === "" ? "" : dueAt || undefined,
        reminders,
        minParticipants: scheduleOnly ? undefined : minP,
        addTeams: scheduleOnly ? [] : addTeams,
        addEmails: scheduleOnly ? [] : emailList,
      });
      if (res.error) { setError(res.error); return; }
      onSaved();
    });
  }

  return (
    <SideWindow
      open={!!target}
      onClose={onClose}
      title={scheduleOnly ? "Edit schedule" : "Edit assessment"}
      subtitle={target?.name}
      footer={
        <>
          <button className="btn-sec" onClick={onClose} disabled={pending}>Cancel</button>
          <div className="right"><button className="btn-prim" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
        </>
      }
    >
      {error ? <div className="form-err">{error}</div> : null}
      {!scheduleOnly ? (
        <div className="field">
          <label htmlFor="ea-title">Title</label>
          <input className="inp" id="ea-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      ) : null}
      <div className="field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label htmlFor="ea-start">Start date</label><input className="inp" id="ea-start" type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
        <div><label htmlFor="ea-due">Due date</label><input className="inp" id="ea-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>
      </div>
      <label className="sw-team" onClick={() => setReminders((r) => !r)} style={{ cursor: "pointer", marginBottom: 14 }}>
        <span className={`chk${reminders ? " on" : ""}`} aria-hidden>{reminders ? "✓" : ""}</span>
        <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Automatic reminders</span><span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>Nudge non-respondents before the due date.</span></span>
      </label>
      {!scheduleOnly ? (
        <>
          <div className="field">
            <label>Minimum participants to show results</label>
            <div className="sw-stepper" style={{ width: "fit-content" }}>
              <button type="button" onClick={() => setMinP((n) => Math.max(3, n - 1))} aria-label="decrease">−</button>
              <span>{minP}</span>
              <button type="button" onClick={() => setMinP((n) => Math.min(50, n + 1))} aria-label="increase">+</button>
            </div>
            <div className="form-note">Already-set assessments keep their own floor unless you raise it here (never below 3).</div>
          </div>
          <div className="field">
            <label>Add recipient teams <span className="opt">(additive — existing recipients are kept)</span></label>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {teams.map((t) => {
                const on = addTeams.includes(t.id);
                return (
                  <label key={t.id} className={`sw-team${on ? " on" : ""}`} onClick={() => setAddTeams((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}>
                    <span className={`chk${on ? " on" : ""}`} aria-hidden>{on ? "✓" : ""}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{t.name}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t.count ?? 0} people</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="field">
            <label htmlFor="ea-emails">Add individual / external emails</label>
            <textarea className="inp" id="ea-emails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="anna@acme.no, partner@firm.com" style={{ minHeight: 64, resize: "vertical" }} />
          </div>
        </>
      ) : null}
      <div className="form-note" style={{ marginTop: 6 }}>The instrument and anonymity mode can’t be changed after launch — they’re locked to keep scoring valid and responses anonymous.</div>
    </SideWindow>
  );
}

// Center confirm dialog (DESIGN §7.5) — the only sanctioned center modal.
// Hard-deletes a response-less draft; archives anything with responses.
function DeleteConfirm({ row, onCancel, onDone }: { row: SuiteRow; onCancel: () => void; onDone: () => void }) {
  const [pending, startT] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const willArchive = row.respondents > 0;
  function go() {
    setError(null);
    startT(async () => {
      const res = await removeAssessment(row.id);
      if (res.error) { setError(res.error); return; }
      onDone();
    });
  }
  return (
    <>
      <div className="scrim open" onClick={onCancel} aria-hidden />
      <div className="as-confirm" role="dialog" aria-modal="true" aria-label="Remove assessment">
        <h2>{willArchive ? "Archive this assessment?" : "Delete this assessment?"}</h2>
        <p>
          <b>{row.name}</b>{" "}
          {willArchive
            ? `has ${row.respondents} ${row.respondents === 1 ? "response" : "responses"}, so it will be archived — hidden from the lists but its data is kept.`
            : "has no responses, so it will be permanently deleted."}
        </p>
        {error ? <div className="form-err">{error}</div> : null}
        <div className="as-confirm-foot">
          <button className="btn-sec" onClick={onCancel} disabled={pending}>Cancel</button>
          <button className="btn-prim danger" onClick={go} disabled={pending}>{pending ? "Working…" : willArchive ? "Archive" : "Delete"}</button>
        </div>
      </div>
    </>
  );
}
