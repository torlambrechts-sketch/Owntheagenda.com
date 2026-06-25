"use client";

import { useState } from "react";
import Link from "next/link";
import { initials } from "@/lib/util";
import { loadAssessmentDetail, type AssessmentDetail, type SectionScore, type QuestionScore } from "./actions";
import { NewAssessment } from "./NewAssessment";

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

type OverviewTab = "active" | "scheduled" | "templates";

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

export function AssessmentSuite({ rows, kpis, alert = null, isAdmin = false, canStart = false, manageableTeamIds = [], teams = [], templates = [], templateCards = [] }: { rows: SuiteRow[]; kpis: Kpi[]; alert?: { sections: number; assessments: number } | null; isAdmin?: boolean; canStart?: boolean; manageableTeamIds?: string[]; teams?: { id: string; name: string; count?: number }[]; templates?: { key: string; name: string }[]; templateCards?: TemplateCard[] }) {
  const canManageRow = (r: SuiteRow) => isAdmin || (!!r.teamId && manageableTeamIds.includes(r.teamId));
  const [view, setView] = useState<View>("overview");
  const [newOpen, setNewOpen] = useState(false);
  const [active, setActive] = useState<SuiteRow | null>(null);
  const [tab, setTab] = useState<DetailTab>("info");
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [otab, setOtab] = useState<OverviewTab>("active");
  const [filterOpen, setFilterOpen] = useState(false);
  const [fStatus, setFStatus] = useState<string>("all");
  const [fBelow, setFBelow] = useState(false);

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
    const activeRows = rows.filter((r) => r.status !== "scheduled" && r.status !== "draft");
    const scheduledRows = rows.filter((r) => r.status === "scheduled" || r.status === "draft");
    const filtered = activeRows.filter(
      (r) => matches(r) && (fStatus === "all" || r.status === fStatus) && (!fBelow || r.below > 0),
    );
    const filterActive = fStatus !== "all" || fBelow;

    return (
      <>
        <div className="a-phead">
          <div>
            <div className="a-pt">Assessments</div>
            <div className="a-ps">Surveys across your teams — status, responses and where a section falls below the healthy band. Trigger a follow-up workshop where a section needs attention.</div>
          </div>
          <div className="a-pr">
            <Link className="btn-sec" href="/assessments/builder">✎ Build</Link>
            {canStart ? <button className="btn-prim" onClick={() => setNewOpen(true)}>＋ New assessment</button> : null}
          </div>
        </div>

        {alert ? (
          <div className="as-alert">
            <span className="as-alert-ic" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
            </span>
            <div>
              <b>{alert.sections} {alert.sections === 1 ? "section" : "sections"}</b> across {alert.assessments} {alert.assessments === 1 ? "assessment" : "assessments"} {alert.sections === 1 ? "is" : "are"} below the healthy band. A follow-up workshop is a candidate — a person reviews before anything is scheduled.
            </div>
            <span className="grounded" style={{ marginLeft: "auto", flexShrink: 0 }}>Grounded</span>
          </div>
        ) : null}

        <div className="as-kpis">
          {kpis.map((k, i) => (
            <div className="as-kpi" key={i}>
              <div className="as-kpi-big" style={k.title === "Sections below band" && k.big !== "0" ? { color: "var(--rust)" } : undefined}>{k.big}</div>
              <div className="as-kpi-title">{k.title}</div>
              <div className="as-kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        <nav className="as-otabs" aria-label="Assessments">
          {([
            ["active", "Active", activeRows.length],
            ["scheduled", "Scheduled", scheduledRows.length],
            ["templates", "Templates", templateCards.length],
          ] as [OverviewTab, string, number][]).map(([key, label, count]) => (
            <button key={key} className={`as-otab${otab === key ? " on" : ""}`} onClick={() => { setOtab(key); setFilterOpen(false); }}>
              {label}<span className="as-otab-n">{count}</span>
            </button>
          ))}
        </nav>

        {otab === "active" ? (
          <div className="tbl-card">
            <div className="as-tablehead">
              <span className="cat-head" style={{ margin: 0 }}>All assessments <span className="n">{filtered.length}</span></span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input className="inp as-search" placeholder="Search title, team…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <div className="as-filterwrap">
                  <button className={`btn-sec as-filterbtn${filterActive ? " on" : ""}`} onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen}>
                    ⚙ Filter{filterActive ? <span className="as-filterdot" /> : null}
                  </button>
                  {filterOpen ? (
                    <div className="as-filtermenu" role="menu">
                      <div className="as-flabel">Status</div>
                      <div className="as-fchips">
                        {(["all", "open", "closed", "paused"] as const).map((s) => (
                          <button key={s} className={`as-fchip${fStatus === s ? " on" : ""}`} onClick={() => setFStatus(s)}>
                            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                      <label className="as-fcheck" onClick={(e) => { e.preventDefault(); setFBelow((v) => !v); }}>
                        <span className={`chk${fBelow ? " on" : ""}`} aria-hidden>{fBelow ? "✓" : ""}</span>
                        Below band only
                      </label>
                      <button className="btn-sec btn-full" style={{ marginTop: 10 }} onClick={() => { setFStatus("all"); setFBelow(false); }}>Clear filters</button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {filtered.length ? (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th style={{ width: 96 }}>Type</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 150 }}>Responses</th>
                    <th style={{ width: 132 }}>Score</th>
                    <th style={{ width: 120 }}>Owner</th>
                    <th style={{ width: 56 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} onClick={() => open(r)} style={{ cursor: "pointer" }}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          {r.below > 0 ? <span className="as-flagdot" title="Below band" /> : null}
                          <span>
                            <span style={{ fontWeight: 600 }}>{r.name}</span>
                            <small style={{ display: "block", color: "var(--faint)" }}>{r.team ?? ""}{r.team ? " · " : ""}{fmtDate(r.date)}</small>
                          </span>
                        </span>
                      </td>
                      <td><span className="pill sm interview">Survey</span></td>
                      <td>{statusPill(r.status)}</td>
                      <td><RowResponses respondents={r.respondents} invited={r.invited} /></td>
                      <td><RowScore score={r.score} pct={r.pct} masked={r.masked} respondents={r.respondents} /></td>
                      <td>
                        {r.ownerName ? (
                          <span className="av sm green" title={r.ownerName}>{initials(r.ownerName)}</span>
                        ) : <span style={{ color: "var(--faint)" }}>—</span>}
                      </td>
                      <td className="r">
                        {canManageRow(r) ? (
                          <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setNewOpen(true); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">
                {activeRows.length ? "No assessments match these filters." : "No assessments run yet — start one with “New assessment”."}
                {filterActive ? <><br /><button className="btn-sec" style={{ marginTop: 10 }} onClick={() => { setFStatus("all"); setFBelow(false); setQuery(""); }}>Clear filters</button></> : null}
              </div>
            )}
          </div>
        ) : null}

        {otab === "scheduled" ? (
          <div className="as-sched">
            <p className="a-ps" style={{ marginBottom: 14 }}>Assessments queued to launch on their start date, plus drafts. A draft still needs a launch date before it sends.</p>
            {scheduledRows.length ? scheduledRows.map((r) => (
              <div key={r.id} className="as-schedcard" onClick={() => open(r)}>
                <span className="as-schedaccent" style={{ background: r.status === "draft" ? "var(--draft-fg)" : "var(--role)" }} />
                <div className="as-schedbody">
                  <div className="as-schedmain">
                    <div className="as-schedtitle">
                      <span>{r.name}</span>
                      <span className="pill sm interview">Survey</span>
                    </div>
                    <div className="as-schedmeta">
                      <span>👥 {r.team ?? "—"}{r.invited ? ` · ${r.invited}` : ""}</span>
                    </div>
                  </div>
                  <div className="as-schedwhen">
                    <div><div className="as-schedlab">Starts</div><div className="as-schedval">{r.startAt ? fmtDate(r.startAt) : "—"}</div></div>
                    <div><div className="as-schedlab">Due</div><div className="as-schedval">{r.dueAt ? fmtDate(r.dueAt) : "—"}</div></div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                      {statusPill(r.status)}
                      <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{startsInLabel(r.startAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )) : <div className="empty">Nothing scheduled. Use “New assessment” and choose “Schedule” to queue one.</div>}
          </div>
        ) : null}

        {otab === "templates" ? (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <Link className="btn-sec" href="/assessments/builder?new=template">＋ New template</Link>
            </div>
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
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link className="icon-btn" title="Edit" href={`/assessments/builder?tpl=${encodeURIComponent(t.key)}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </Link>
                        <Link className="btn-sec" href={`/assessments/builder?use=${encodeURIComponent(t.key)}`}>Use →</Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">No templates yet. Build one to reuse it across teams.</div>}
          </div>
        ) : null}

        {loading ? <div className="a-note" style={{ marginTop: 14 }}>Loading assessment…</div> : null}
        <NewAssessment open={newOpen} teams={teams} templates={templates} onClose={() => setNewOpen(false)} />
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
