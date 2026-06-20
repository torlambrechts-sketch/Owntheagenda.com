"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACTIVITY, CATEGORY, initials } from "@/lib/util";
import { SideWindow } from "@/components/SideWindow";
import { useTableControls } from "@/components/TableControls";
import { buildFromTemplate, deleteWorkshop, quickStart } from "./actions";
import { SessionsTable, type SessionRow } from "./SessionsTable";
import { CanvasGallery, type GalleryItem } from "./CanvasGallery";

type WkTab = "workshops" | "sessions" | "canvas";

const QUICK_MODULES = [
  { kind: "canvas", label: "Canvas", blurb: "Freeform board — notes, shapes, connectors" },
  { kind: "brainstorm", label: "Brainstorm", blurb: "Gather ideas, then cluster" },
  { kind: "vote", label: "Vote", blurb: "Dot-vote to prioritize" },
  { kind: "discuss", label: "Discuss", blurb: "A guided discussion prompt" },
  { kind: "feedback", label: "Feedback", blurb: "Sort thoughts into lanes" },
  { kind: "checkin", label: "Check-in", blurb: "A quick round to open" },
  { kind: "outcome", label: "Outcomes", blurb: "Capture decisions & actions" },
  { kind: "manual", label: "Notes", blurb: "Facilitator notes / freeform" },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "w-draft" },
  scheduled: { label: "Scheduled", cls: "w-sched" },
  live: { label: "Running", cls: "w-run" },
  done: { label: "Finished", cls: "w-done" },
};
const STATUS_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Running" },
  { key: "scheduled", label: "Scheduled" },
  { key: "draft", label: "Draft" },
  { key: "done", label: "Finished" },
];
function barColor(ty: string) {
  return ty === "vote" ? "var(--internal-fg)"
    : ty === "outcome" ? "var(--rust)"
      : ty === "discuss" ? "var(--draft-fg)"
        : ty === "checkin" ? "var(--green)"
          : ty === "feedback" ? "var(--purple, var(--role))"
            : "var(--role)";
}

const PER_PAGE = 8;

export type TemplateCard = {
  id: string;
  key: string | null;
  name: string;
  category: string;
  source: string | null;
  description: string | null;
  steps: number;
  minutes: number;
  types: string[];
  phases?: { title: string; type: string; minutes: number; prompt: string | null }[];
};
export type WorkshopRow = {
  id: string;
  title: string;
  status: string;
  editedLabel: string;
  scheduledAt: string | null;
  creatorName: string | null;
  category: string | null;
};
export type Recommendation = {
  templateId: string;
  templateName: string;
  dynamicLabel: string;
  why: string;
  pct: number | null;
  targetLow: number;
  belowBand: boolean;
  pulseId: string | null;
  scienceSlug: string | null;
};

export function WorkshopsClient({
  teamId,
  canManage,
  templates,
  workshops,
  recommendation,
  surveyInsts = [],
  scienceByCategory = {},
  sessions = [],
  canvasItems = [],
  initialTab = "workshops",
}: {
  teamId: string;
  canManage: boolean;
  templates: TemplateCard[];
  workshops: WorkshopRow[];
  recommendation: Recommendation | null;
  surveyInsts?: { kind: string; name: string }[];
  scienceByCategory?: Record<string, string>;
  sessions?: SessionRow[];
  canvasItems?: GalleryItem[];
  initialTab?: WkTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<WkTab>(initialTab);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickKind, setQuickKind] = useState("canvas");
  const [quickInst, setQuickInst] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [preview, setPreview] = useState<TemplateCard | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  // list controls
  const [statusTab, setStatusTab] = useState("all");
  const [page, setPage] = useState(1);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }
  function runQuick() {
    startTransition(async () => {
      const res = await quickStart(teamId, quickTitle, quickKind, quickKind === "survey" ? quickInst : undefined);
      if (res.error) flash(res.error);
      else if (res.workshopId) router.push(`/run/${res.workshopId}`);
    });
  }
  function use(templateId: string, pulseId?: string | null) {
    startTransition(async () => {
      const res = await buildFromTemplate(teamId, templateId, pulseId ?? undefined);
      if (res.error) flash(res.error);
      else if (res.id) router.push(`/workshops/${res.id}`);
    });
  }
  function remove(id: string) {
    setMenuFor(null);
    if (!confirm("Delete this workshop?")) return;
    startTransition(async () => {
      const res = await deleteWorkshop(id);
      if (res.error) flash(res.error);
      else { flash("Workshop deleted"); router.refresh(); }
    });
  }

  // Search + sort live in the toolbar (shared table controls); the status
  // switch is a dark tab row above the table — the Organization tabbed-table
  // pattern. Counts come from the full list so the tabs stay stable.
  const counts: Record<string, number> = { all: workshops.length };
  for (const w of workshops) counts[w.status] = (counts[w.status] ?? 0) + 1;
  const statusTabs = STATUS_TABS.filter((t) => t.key === "all" || counts[t.key]);

  const tc = useTableControls<WorkshopRow>(workshops, {
    search: { placeholder: "Search workshops…", text: (w) => `${w.title} ${w.creatorName ?? ""}` },
    sorts: [
      { key: "default", label: "Default order", cmp: () => 0 },
      { key: "name", label: "Name (A–Z)", cmp: (a, b) => a.title.localeCompare(b.title) },
    ],
  });

  const rows = statusTab === "all" ? tc.view : tc.view.filter((w) => w.status === statusTab);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safePage = Math.min(page, pages);
  const pageRows = rows.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  useEffect(() => { setPage(1); }, [tc.view, statusTab]);

  const tprev = (t: TemplateCard) => (
    <div className="wcard-prev">
      {(t.types.length ? t.types : ["canvas"]).slice(0, 6).map((ty, i) => (
        <span key={i} className="wbar" style={{ height: `${34 + ((i * 17) % 56)}%`, background: barColor(ty), opacity: 0.6 }} />
      ))}
    </div>
  );

  return (
    <>
      <div className="wtabs">
        <button className={`wtab${tab === "workshops" ? " on" : ""}`} onClick={() => setTab("workshops")}>Workshops <span className="wtab-n">{workshops.length}</span></button>
        <button className={`wtab${tab === "sessions" ? " on" : ""}`} onClick={() => setTab("sessions")}>Sessions <span className="wtab-n">{sessions.length}</span></button>
        <button className={`wtab${tab === "canvas" ? " on" : ""}`} onClick={() => setTab("canvas")}>Canvas <span className="wtab-n">{canvasItems.length}</span></button>
      </div>

      {tab === "workshops" ? (
      <>
      {recommendation ? (
        <div className="rec">
          <div className="rec-l">
            <div className="rec-eyebrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
              Grounded recommendation
            </div>
            <div className="rec-title">
              {recommendation.dynamicLabel} {recommendation.belowBand ? "is below target" : "is your lowest reading"}
              {recommendation.pct != null ? ` · ${recommendation.pct}% vs ${recommendation.targetLow}%+` : ""}
            </div>
            <div className="rec-why">
              Run <b>{recommendation.templateName}</b> to {recommendation.why}.
              {recommendation.scienceSlug ? (
                <> <Link className="rec-sci" href={`/help/${recommendation.scienceSlug}`}>Learn the science →</Link></>
              ) : null}
            </div>
          </div>
          {canManage ? (
            <button className="btn-prim" disabled={pending} onClick={() => use(recommendation.templateId, recommendation.pulseId)}>Build it ▸</button>
          ) : null}
        </div>
      ) : null}

      {/* ---- create strip ---- */}
      <div className="wk-create">
        <div className="cat-head wk-create-h">Create a workshop</div>
        <div className="wk-strip">
          {canManage ? (
            <button className="wcard wcard-new" onClick={() => setQuickOpen(true)}>
              <span className="wcard-ring">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              </span>
              <span className="wcard-nl">New workshop</span>
            </button>
          ) : null}
          {templates.slice(0, 5).map((t) => (
            <button className="wcard" key={t.id} onClick={() => setPreview(t)} title={t.name}>
              {tprev(t)}
              <span className="wcard-nm">{t.name}</span>
              <span className="wcard-meta">{CATEGORY[t.category] ?? t.category} · {t.steps} steps</span>
            </button>
          ))}
          <button type="button" className="wcard-more" onClick={() => setBrowseOpen(true)}>
            <span className="wcard-ring">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
            <span className="wcard-nl">More templates</span>
            <span className="wcard-more-sub">Browse all {templates.length}</span>
          </button>
        </div>
      </div>

      {/* ---- workshops list ---- */}
      <div className="cat-head" style={{ marginTop: 30 }}>
        Your workshops <span className="n">{workshops.length}</span>
      </div>

      {workshops.length === 0 ? (
        <div className="empty">No workshops yet — pick a template above to build your first one.</div>
      ) : (
        <>
          <nav className="otabband wk-tabs" aria-label="Workshop status">
            {statusTabs.map((t) => (
              <button
                key={t.key}
                className={`otabband-t${statusTab === t.key ? " on" : ""}`}
                onClick={() => setStatusTab(t.key)}
              >
                {t.label}
                <span className="otabband-c">{counts[t.key] ?? 0}</span>
              </button>
            ))}
          </nav>
          <div className="opanel">
            <div className="opanel-body">
          <div className="wk-listbar">
            {workshops.length >= 4 ? tc.controls : <span />}
            {canManage ? (
              <button className="btn-prim" onClick={() => setQuickOpen(true)}>+ New workshop</button>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <div className="empty">No workshops match your filters.</div>
          ) : (
            <div className="tbl-card">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Workshop</th>
                    <th style={{ width: 160 }}>Last edit</th>
                    <th style={{ width: 130 }}>Status</th>
                    <th style={{ width: 48 }} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((w) => {
                    const st = STATUS[w.status] ?? { label: w.status, cls: "w-draft" };
                    return (
                      <tr key={w.id}>
                        <td>
                          <Link className="person wk-cell" href={`/workshops/${w.id}`}>
                            <span className={w.creatorName ? "av sm" : "wfold sm"}>
                              {w.creatorName ? initials(w.creatorName) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                              )}
                            </span>
                            <span>
                              {w.title}
                              <small>
                                {w.creatorName ? `By ${w.creatorName}` : "No facilitator yet"}
                                {w.category ? ` · ${CATEGORY[w.category] ?? w.category}` : ""}
                              </small>
                            </span>
                          </Link>
                        </td>
                        <td>{w.editedLabel}</td>
                        <td><span className={`wpill ${st.cls}`}>{st.label}</span></td>
                        <td className="r wk-kebab-wrap">
                          <button className="wk-kebab" onClick={() => setMenuFor(menuFor === w.id ? null : w.id)} aria-label="Workshop actions">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
                          </button>
                          {menuFor === w.id ? (
                            <>
                              <div className="wk-menu-back" onClick={() => setMenuFor(null)} />
                              <div className="wk-menu">
                                <Link href={`/workshops/${w.id}`} onClick={() => setMenuFor(null)}>Open</Link>
                                <Link href={`/run/${w.id}`} onClick={() => setMenuFor(null)}>Run ▸</Link>
                                {canManage ? <button className="del" onClick={() => remove(w.id)}>Delete</button> : null}
                              </div>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > PER_PAGE ? (
            <div className="wk-pager">
              <span className="wk-pn">
                Showing <b>{(safePage - 1) * PER_PAGE + 1}–{Math.min(rows.length, safePage * PER_PAGE)}</b> of <b>{rows.length}</b>
              </span>
              <div className="wk-pgs">
                <button className="wk-pg" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button key={n} className={`wk-pg${n === safePage ? " on" : ""}`} onClick={() => setPage(n)}>{n}</button>
                ))}
                <button className="wk-pg" disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>›</button>
              </div>
            </div>
          ) : null}
            </div>
          </div>
        </>
      )}
      </>
      ) : tab === "sessions" ? (
        sessions.length ? <SessionsTable rows={sessions} /> : <div className="empty">No sessions yet — start a workshop to run your first.</div>
      ) : (
        <CanvasGallery items={canvasItems} />
      )}

      <SideWindow
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="New workshop"
        subtitle="Start a live session now — add steps as you go"
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setQuickOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={pending || (quickKind === "survey" && !quickInst)} onClick={runQuick}>Start session ▸</button>
            </div>
          </>
        }
      >
        <div className="field">
          <label htmlFor="qs-title">Session name <span className="opt">(optional)</span></label>
          <input className="inp" id="qs-title" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder="Quick session" />
        </div>
        <div className="field">
          <label>Starting module</label>
          <div className="quickmods">
            {QUICK_MODULES.map((m) => (
              <button key={m.kind} type="button" className={`quickmod${quickKind === m.kind ? " on" : ""}`} onClick={() => { setQuickKind(m.kind); setQuickInst(""); }}>
                <span className="quickmod-t">{m.label}</span>
                <span className="quickmod-s">{m.blurb}</span>
              </button>
            ))}
          </div>
        </div>
        {surveyInsts.length ? (
          <div className="field">
            <label>Or an assessment</label>
            <div className="quickmods">
              {surveyInsts.map((s) => (
                <button key={s.kind} type="button" className={`quickmod${quickKind === "survey" && quickInst === s.kind ? " on" : ""}`} onClick={() => { setQuickKind("survey"); setQuickInst(s.kind); }}>
                  <span className="quickmod-t">{s.name}</span>
                  <span className="quickmod-s">Anonymous team survey</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </SideWindow>

      {preview ? (
        <SideWindow
          open={!!preview}
          onClose={() => setPreview(null)}
          title={preview.name}
          subtitle={`${preview.steps} steps · ${preview.minutes} min`}
          footer={
            canManage ? (
              <div className="right">
                <button className="btn-prim" disabled={pending} onClick={() => { const id = preview.id; setPreview(null); use(id); }}>Use template ▸</button>
              </div>
            ) : null
          }
        >
          {preview.source ? <div className="src" style={{ marginTop: 0 }}>{preview.source}</div> : null}
          {preview.description ? <p style={{ color: "var(--muted)", fontSize: 13 }}>{preview.description}</p> : null}
          {scienceByCategory[preview.category] ? (
            <Link className="cat-sci" href={`/help/${scienceByCategory[preview.category]}`} style={{ display: "inline-block", marginBottom: 10 }}>Learn the science →</Link>
          ) : null}
          <ol className="agenda">
            {(preview.phases ?? []).map((p, i) => (
              <li key={i} className="agenda-step">
                <div className="agenda-h">
                  <span className="agenda-t">{p.title}</span>
                  <span className="agenda-meta">{ACTIVITY[p.type]?.label ?? p.type} · {p.minutes}m</span>
                </div>
                {p.prompt ? <div className="agenda-p">{p.prompt}</div> : null}
              </li>
            ))}
          </ol>
        </SideWindow>
      ) : null}

      <SideWindow
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        title="All templates"
        subtitle={`${templates.length} proven frameworks — pick one to preview`}
      >
        {Array.from(new Set(templates.map((t) => t.category))).map((cat) => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div className="a-gt" style={{ marginBottom: 8 }}>{CATEGORY[cat] ?? cat}</div>
            <div className="browse-list">
              {templates.filter((t) => t.category === cat).map((t) => (
                <button key={t.id} type="button" className="browse-row" onClick={() => { setBrowseOpen(false); setPreview(t); }}>
                  <span className="browse-nm">{t.name}</span>
                  <span className="browse-meta">{t.steps} steps · {t.minutes} min</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
