"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACTIVITY, CATEGORY, initials } from "@/lib/util";
import { SideWindow } from "@/components/SideWindow";
import { buildFromTemplate, deleteWorkshop, quickStart } from "./actions";

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
const STATUS_ORDER = ["all", "live", "scheduled", "draft", "done"];
const STATUS_FILTER_LABEL: Record<string, string> = {
  all: "All", live: "Running", scheduled: "Scheduled", draft: "Draft", done: "Finished",
};

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
}: {
  teamId: string;
  canManage: boolean;
  templates: TemplateCard[];
  workshops: WorkshopRow[];
  recommendation: Recommendation | null;
  surveyInsts?: { kind: string; name: string }[];
  scienceByCategory?: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickKind, setQuickKind] = useState("canvas");
  const [quickInst, setQuickInst] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [preview, setPreview] = useState<TemplateCard | null>(null);
  // list controls
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  // status counts (from the full list, so the filter chips are stable)
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: workshops.length };
    for (const w of workshops) c[w.status] = (c[w.status] ?? 0) + 1;
    return c;
  }, [workshops]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return workshops.filter(
      (w) =>
        (statusFilter === "all" || w.status === statusFilter) &&
        (!needle || w.title.toLowerCase().includes(needle) || (w.creatorName ?? "").toLowerCase().includes(needle)),
    );
  }, [workshops, q, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  useEffect(() => { setPage(1); }, [q, statusFilter]);

  const tprev = (t: TemplateCard) => (
    <div className="wcard-prev">
      {(t.types.length ? t.types : ["canvas"]).slice(0, 6).map((ty, i) => (
        <span key={i} className="wbar" style={{ height: `${34 + ((i * 17) % 56)}%`, background: barColor(ty), opacity: 0.6 }} />
      ))}
    </div>
  );

  return (
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
        <div className="cat-head" style={{ margin: "0 0 12px" }}>
          Create a workshop
          <Link className="cat-sci" href="/library" style={{ marginLeft: "auto" }}>Browse the full library →</Link>
        </div>
        <div className="wk-strip">
          {canManage ? (
            <button className="wcard wcard-new" onClick={() => setQuickOpen(true)}>
              <span className="wcard-ring">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              </span>
              <span className="wcard-nl">New workshop</span>
            </button>
          ) : null}
          {templates.map((t) => (
            <button className="wcard" key={t.id} onClick={() => setPreview(t)} title={t.name}>
              {tprev(t)}
              <span className="wcard-nm">{t.name}</span>
              <span className="wcard-meta">{CATEGORY[t.category] ?? t.category} · {t.steps} steps</span>
            </button>
          ))}
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
          <div className="wk-controls">
            <div className="wk-seg">
              {STATUS_ORDER.filter((s) => s === "all" || counts[s]).map((s) => (
                <button key={s} className={`wseg${statusFilter === s ? " on" : ""}`} onClick={() => setStatusFilter(s)}>
                  {STATUS_FILTER_LABEL[s]}<span className="wseg-n">{counts[s] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="wk-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workshops…" />
            </div>
            {canManage ? (
              <button className="btn-prim" onClick={() => setQuickOpen(true)}>+ New workshop</button>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <div className="empty">No workshops match your filters.</div>
          ) : (
            <div className="wk-tbl">
              <div className="wk-th">
                <span>Workshop</span>
                <span>Last edit</span>
                <span>Status</span>
                <span />
              </div>
              {pageRows.map((w) => {
                const st = STATUS[w.status] ?? { label: w.status, cls: "w-draft" };
                return (
                  <div className="wk-tr" key={w.id}>
                    <Link className="wk-main" href={`/workshops/${w.id}`}>
                      <span className={w.creatorName ? "wav" : "wfold"}>
                        {w.creatorName ? initials(w.creatorName) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                        )}
                      </span>
                      <span className="wk-tt">
                        <span className="wk-title">{w.title}</span>
                        <span className="wk-sub">
                          {w.creatorName ? `By ${w.creatorName}` : "No facilitator yet"}
                          {w.category ? ` · ${CATEGORY[w.category] ?? w.category}` : ""}
                        </span>
                      </span>
                    </Link>
                    <span className="wk-edit">{w.editedLabel}</span>
                    <span><span className={`wpill ${st.cls}`}>{st.label}</span></span>
                    <span className="wk-kebab-wrap">
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
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length > PER_PAGE ? (
            <div className="wk-pager">
              <span className="wk-pn">
                Showing <b>{(safePage - 1) * PER_PAGE + 1}–{Math.min(filtered.length, safePage * PER_PAGE)}</b> of <b>{filtered.length}</b>
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
        </>
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

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
