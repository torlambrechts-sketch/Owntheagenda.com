"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ACTIVITY, CATEGORY } from "@/lib/util";
import type { Enums } from "@/types/database.types";
import {
  Activity,
  DEFAULT_MINUTES,
  PALETTE,
  PHASES,
  PHASE_ACCENT,
  PHASE_LABEL,
  TemplatePhase,
  phaseOf,
} from "../blocks";
import { saveWorkshopTemplate, deleteWorkshopTemplate, type PhaseInput } from "./actions";

type Category = Enums<"template_category">;

export type TemplateVM = {
  id: string;
  name: string;
  category: Category;
  source: string | null;
  description: string | null;
  owned: boolean;
  system: boolean;
  steps: number;
  minutes: number;
  used: number;
  phases: TemplatePhase[];
};

type Draft = {
  id: string | null;
  name: string;
  category: Category;
  description: string;
  phases: TemplatePhase[];
  readOnly: boolean;
};

const CATEGORY_OPTIONS = Object.keys(CATEGORY) as Category[];

function uid(p: string) {
  return p + Math.random().toString(36).slice(2, 8);
}
function blankPhase(type: Activity): TemplatePhase {
  return { id: uid("p"), title: ACTIVITY[type]?.label ?? "Step", type, minutes: DEFAULT_MINUTES[type] ?? 10, prompt: null };
}

export function TemplatesClient({ items, canManage }: { items: TemplateVM[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function openNew() {
    setDraft({
      id: null,
      name: "Untitled template",
      category: "team",
      description: "",
      phases: [blankPhase("checkin"), blankPhase("brainstorm"), blankPhase("vote"), blankPhase("outcome")],
      readOnly: false,
    });
  }
  function openEdit(t: TemplateVM) {
    setDraft({
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description ?? "",
      // Fresh ids so reorder/keys are stable in the editor session.
      phases: t.phases.map((p) => ({ ...p, id: uid("p") })),
      readOnly: !t.owned,
    });
  }
  function duplicate(t: TemplateVM) {
    setDraft({
      id: null,
      name: `${t.name} (copy)`,
      category: t.category,
      description: t.description ?? "",
      phases: t.phases.map((p) => ({ ...p, id: uid("p") })),
      readOnly: false,
    });
  }

  // ---- editor mutations (local) ----
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setPhase = (id: string, patch: Partial<TemplatePhase>) =>
    setDraft((d) => (d ? { ...d, phases: d.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : d));
  const addPhase = (type: Activity) =>
    setDraft((d) => (d ? { ...d, phases: [...d.phases, blankPhase(type)] } : d));
  const removePhase = (id: string) =>
    setDraft((d) => (d ? { ...d, phases: d.phases.filter((p) => p.id !== id) } : d));
  const movePhase = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const arr = d.phases.slice();
      const i = arr.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, phases: arr };
    });

  function save() {
    if (!draft) return;
    const phases: PhaseInput[] = draft.phases.map((p) => ({ title: p.title, type: p.type, minutes: p.minutes, prompt: p.prompt }));
    startTransition(async () => {
      const res = await saveWorkshopTemplate({ id: draft.id, name: draft.name, category: draft.category, description: draft.description, phases });
      if (res.error) flash(res.error);
      else {
        flash(draft.id ? "Template saved" : "Template created");
        setDraft(null);
        router.refresh();
      }
    });
  }
  function removeTemplate() {
    if (!draft?.id) return;
    if (!confirm("Delete this template? Workshops already built from it are unaffected.")) return;
    const id = draft.id;
    startTransition(async () => {
      const res = await deleteWorkshopTemplate(id);
      if (res.error) flash(res.error);
      else {
        flash("Template deleted");
        setDraft(null);
        router.refresh();
      }
    });
  }

  if (draft) {
    return (
      <>
        <TemplateEditor
          draft={draft}
          pending={pending}
          onName={(v) => set({ name: v })}
          onCategory={(v) => set({ category: v })}
          onDescription={(v) => set({ description: v })}
          onPhase={setPhase}
          onAdd={addPhase}
          onRemove={removePhase}
          onMove={movePhase}
          onSave={save}
          onCancel={() => setDraft(null)}
          onDelete={draft.id ? removeTemplate : undefined}
          onDuplicate={draft.readOnly ? () => set({ id: null, readOnly: false, name: `${draft.name} (copy)` }) : undefined}
        />
        <div className={`toast${toast ? " show" : ""}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
          <span>{toast}</span>
        </div>
      </>
    );
  }

  const owned = items.filter((t) => t.owned);
  const system = items.filter((t) => t.system);

  return (
    <>
      <div className="wk-listbar" style={{ marginBottom: 4 }}>
        <span className="page-sub" style={{ margin: 0 }}>{items.length} templates · {owned.length} you can edit</span>
        {canManage ? <button className="btn-prim" onClick={openNew}>+ New template</button> : null}
      </div>

      {owned.length ? (
        <>
          <div className="cat-head">Your templates <span className="n">{owned.length}</span></div>
          <div className="tpl-grid">
            {owned.map((t) => (
              <TemplateCard key={t.id} t={t} canManage={canManage} onOpen={() => openEdit(t)} onDuplicate={() => duplicate(t)} />
            ))}
          </div>
        </>
      ) : null}

      <div className="cat-head" style={{ marginTop: owned.length ? 26 : 8 }}>Framework library <span className="n">{system.length}</span></div>
      {system.length === 0 ? (
        <div className="empty">No system templates yet.</div>
      ) : (
        <div className="tpl-grid">
          {system.map((t) => (
            <TemplateCard key={t.id} t={t} canManage={canManage} onOpen={() => openEdit(t)} onDuplicate={() => duplicate(t)} />
          ))}
        </div>
      )}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}

function phaseBars(phases: TemplatePhase[]) {
  return phases.slice(0, 8).map((p, i) => (
    <span key={i} className="tpl-bar" style={{ height: `${38 + ((i * 19) % 52)}%`, background: PHASE_ACCENT[phaseOf(p.type)], opacity: 0.62 }} />
  ));
}

function TemplateCard({ t, canManage, onOpen, onDuplicate }: { t: TemplateVM; canManage: boolean; onOpen: () => void; onDuplicate: () => void }) {
  return (
    <div className="tpl-card">
      <button type="button" className="tpl-card-main" onClick={onOpen} title={t.owned ? "Edit template" : "View template"}>
        <span className="tpl-prev">{t.phases.length ? phaseBars(t.phases) : <span className="tpl-bar" style={{ height: "40%", background: "var(--line-2)" }} />}</span>
        <span className="tpl-nm">{t.name}</span>
        <span className="tpl-meta">
          {CATEGORY[t.category] ?? t.category} · {t.steps} steps · {t.minutes} min
        </span>
        <span className="tpl-tags">
          {t.owned ? <span className="pill sm role-manager">Editable</span> : <span className="pill sm draft">Framework</span>}
          {t.used > 0 ? <span className="tpl-used">Used {t.used}×</span> : null}
        </span>
      </button>
      {canManage ? (
        <div className="tpl-card-foot">
          {t.owned ? (
            <button className="linkbtn" onClick={onOpen}>Edit</button>
          ) : (
            <button className="linkbtn" onClick={onDuplicate}>Duplicate to edit</button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TemplateEditor({
  draft,
  pending,
  onName,
  onCategory,
  onDescription,
  onPhase,
  onAdd,
  onRemove,
  onMove,
  onSave,
  onCancel,
  onDelete,
  onDuplicate,
}: {
  draft: Draft;
  pending: boolean;
  onName: (v: string) => void;
  onCategory: (v: Category) => void;
  onDescription: (v: string) => void;
  onPhase: (id: string, patch: Partial<TemplatePhase>) => void;
  onAdd: (type: Activity) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  const ro = draft.readOnly;
  const total = useMemo(() => draft.phases.reduce((s, p) => s + (Number(p.minutes) || 0), 0), [draft.phases]);
  const phaseSummary = useMemo(() => {
    return PHASES.map((ph) => {
      const items = draft.phases.filter((p) => phaseOf(p.type) === ph.key);
      return { ...ph, count: items.length, mins: items.reduce((s, p) => s + (Number(p.minutes) || 0), 0) };
    }).filter((p) => p.count > 0);
  }, [draft.phases]);

  return (
    <>
      <div className="tpl-eyebrow">{ro ? "Framework (read-only)" : draft.id ? "Edit template" : "New template"}</div>

      <div className="tpl-editor">
        {/* left: meta + agenda */}
        <div className="tpl-editor-main">
          <div className="card">
            <div className="field">
              <label htmlFor="tpl-name">Name</label>
              <input id="tpl-name" className="inp" value={draft.name} disabled={ro} onChange={(e) => onName(e.target.value)} />
            </div>
            <div className="tpl-meta-row">
              <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                <label htmlFor="tpl-cat">Category</label>
                <select id="tpl-cat" className="inp" value={draft.category} disabled={ro} onChange={(e) => onCategory(e.target.value as Category)}>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{CATEGORY[c] ?? c}</option>
                  ))}
                </select>
              </div>
              <div className="tpl-totals">
                <span className="tpl-total-n">{draft.phases.length}</span> steps
                <span className="tpl-total-dot">·</span>
                <span className="tpl-total-n">{total}</span> min
              </div>
            </div>
            <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
              <label htmlFor="tpl-desc">Description <span className="opt">(optional)</span></label>
              <textarea id="tpl-desc" className="inp" rows={2} value={draft.description} disabled={ro} onChange={(e) => onDescription(e.target.value)} placeholder="When should a facilitator reach for this?" />
            </div>
          </div>

          {phaseSummary.length ? (
            <div className="tpl-phases">
              {phaseSummary.map((p) => (
                <span key={p.key} className="tpl-phase-chip">
                  <span className="tpl-phase-dot" style={{ background: p.accent }} />
                  {p.label}
                  <b>{p.count}</b>
                  <small>{p.mins}m</small>
                </span>
              ))}
            </div>
          ) : null}

          <div className="cat-head" style={{ marginTop: 18 }}>Agenda <span className="n">{draft.phases.length}</span></div>
          {draft.phases.length === 0 ? (
            <div className="empty">No steps yet — add blocks from the library →</div>
          ) : (
            <ol className="tpl-steps">
              {draft.phases.map((p, i) => {
                const ph = phaseOf(p.type);
                return (
                  <li key={p.id} className="tpl-step">
                    <span className="tpl-step-rail" style={{ background: PHASE_ACCENT[ph] }} />
                    <span className="tpl-step-num">{i + 1}</span>
                    <div className="tpl-step-body">
                      <div className="tpl-step-top">
                        <span className="pill sm" style={{ background: "var(--canvas-2)", color: "var(--muted)" }}>{PHASE_LABEL[ph]}</span>
                        <span className="tpl-step-type">{ACTIVITY[p.type]?.label ?? p.type}</span>
                      </div>
                      <input
                        className="inp tpl-step-title"
                        value={p.title}
                        disabled={ro}
                        onChange={(e) => onPhase(p.id, { title: e.target.value })}
                        placeholder="Step title"
                      />
                      <input
                        className="inp tpl-step-prompt"
                        value={p.prompt ?? ""}
                        disabled={ro}
                        onChange={(e) => onPhase(p.id, { prompt: e.target.value || null })}
                        placeholder="Facilitator prompt (optional)"
                      />
                    </div>
                    <div className="tpl-step-side">
                      <div className="tpl-step-dur">
                        <input
                          className="inp"
                          inputMode="numeric"
                          value={String(p.minutes)}
                          disabled={ro}
                          onChange={(e) => onPhase(p.id, { minutes: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })}
                          style={{ width: 52, textAlign: "center" }}
                        />
                        <span>min</span>
                      </div>
                      {!ro ? (
                        <div className="tpl-step-ctrls">
                          <button className="tpl-icon" disabled={i === 0} onClick={() => onMove(p.id, -1)} aria-label="Move up">↑</button>
                          <button className="tpl-icon" disabled={i === draft.phases.length - 1} onClick={() => onMove(p.id, 1)} aria-label="Move down">↓</button>
                          <button className="tpl-icon danger" onClick={() => onRemove(p.id)} aria-label="Remove step">✕</button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* right: block library + actions */}
        <aside className="tpl-editor-side">
          {!ro ? (
            <div className="card tpl-palette">
              <div className="tpl-side-h">Block library</div>
              {PALETTE.map((grp) => (
                <div key={grp.key} className="tpl-pal-grp">
                  <div className="tpl-pal-label"><span className="tpl-phase-dot" style={{ background: grp.accent }} />{grp.label}</div>
                  <div className="tpl-pal-items">
                    {grp.acts.map((a) => (
                      <button key={a} type="button" className="tpl-pal-item" onClick={() => onAdd(a)}>
                        + {ACTIVITY[a]?.label ?? a}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <div className="tpl-side-h">Framework</div>
              <p className="page-sub" style={{ margin: 0 }}>
                This is a built-in framework. Duplicate it to customise the agenda
                for your workspace.
              </p>
            </div>
          )}

          <div className="tpl-actions">
            {ro ? (
              <>
                <button className="btn-sec" onClick={onCancel}>Back</button>
                {onDuplicate ? <button className="btn-prim" onClick={onDuplicate}>Duplicate to edit</button> : null}
              </>
            ) : (
              <>
                {onDelete ? <button className="btn-sec danger" disabled={pending} onClick={onDelete}>Delete</button> : <span />}
                <div className="right" style={{ display: "flex", gap: 8 }}>
                  <button className="btn-sec" disabled={pending} onClick={onCancel}>Cancel</button>
                  <button className="btn-prim" disabled={pending || draft.phases.length === 0} onClick={onSave}>
                    {draft.id ? "Save template" : "Create template"}
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
