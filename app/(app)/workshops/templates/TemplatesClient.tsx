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
  PHASE_LABEL,
  TemplatePhase,
  phaseOf,
} from "../blocks";
import { Icon, catVis, actIcon, PHASE_VIS, WA } from "../visuals";
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
const uid = (p: string) => p + Math.random().toString(36).slice(2, 8);
const blankPhase = (type: Activity): TemplatePhase => ({ id: uid("p"), title: ACTIVITY[type]?.label ?? "Step", type, minutes: DEFAULT_MINUTES[type] ?? 10, prompt: null });

export function TemplatesClient({ items, canManage }: { items: TemplateVM[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2400); }

  const openNew = () => setDraft({ id: null, name: "Untitled template", category: "team", description: "", phases: [blankPhase("checkin"), blankPhase("brainstorm"), blankPhase("vote"), blankPhase("outcome")], readOnly: false });
  const openEdit = (t: TemplateVM) => setDraft({ id: t.id, name: t.name, category: t.category, description: t.description ?? "", phases: t.phases.map((p) => ({ ...p, id: uid("p") })), readOnly: !t.owned });
  const duplicate = (t: TemplateVM) => setDraft({ id: null, name: `${t.name} (copy)`, category: t.category, description: t.description ?? "", phases: t.phases.map((p) => ({ ...p, id: uid("p") })), readOnly: false });

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setPhase = (id: string, patch: Partial<TemplatePhase>) => setDraft((d) => (d ? { ...d, phases: d.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : d));
  const addPhase = (type: Activity) => setDraft((d) => (d ? { ...d, phases: [...d.phases, blankPhase(type)] } : d));
  const removePhase = (id: string) => setDraft((d) => (d ? { ...d, phases: d.phases.filter((p) => p.id !== id) } : d));
  const movePhase = (id: string, dir: -1 | 1) => setDraft((d) => {
    if (!d) return d;
    const arr = d.phases.slice();
    const i = arr.findIndex((p) => p.id === id); const j = i + dir;
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
      else { flash(draft.id ? "Template saved" : "Template created"); setDraft(null); router.refresh(); }
    });
  }
  function removeTemplate() {
    if (!draft?.id) return;
    if (!confirm("Delete this template? Workshops already built from it are unaffected.")) return;
    const id = draft.id;
    startTransition(async () => {
      const res = await deleteWorkshopTemplate(id);
      if (res.error) flash(res.error);
      else { flash("Template deleted"); setDraft(null); router.refresh(); }
    });
  }

  const toastEl = (
    <div className={`toast${toast ? " show" : ""}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
      <span>{toast}</span>
    </div>
  );

  if (draft) {
    return (<><TemplateEditor draft={draft} pending={pending} onName={(v) => set({ name: v })} onCategory={(v) => set({ category: v })} onDescription={(v) => set({ description: v })} onPhase={setPhase} onAdd={addPhase} onRemove={removePhase} onMove={movePhase} onSave={save} onCancel={() => setDraft(null)} onDelete={draft.id ? removeTemplate : undefined} onDuplicate={draft.readOnly ? () => set({ id: null, readOnly: false, name: `${draft.name} (copy)` }) : undefined} />{toastEl}</>);
  }

  const owned = items.filter((t) => t.owned);
  const system = items.filter((t) => t.system);

  return (
    <div style={{ color: WA.ink2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: WA.faint }}>{items.length} templates · {owned.length} you can edit</span>
        {canManage ? (
          <button onClick={openNew} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: WA.accent, color: "#fff", border: "none", borderRadius: 7, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}><Icon name="Plus" size={16} color="#fff" /> New template</button>
        ) : null}
      </div>

      {owned.length ? (
        <>
          <SectionHead label="Your templates" n={owned.length} />
          <Grid items={owned} canManage={canManage} onOpen={openEdit} onDuplicate={duplicate} />
        </>
      ) : null}

      <div style={{ marginTop: owned.length ? 26 : 4 }}>
        <SectionHead label="Framework library" n={system.length} />
      </div>
      {system.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: WA.faint }}>No system templates yet.</div> : <Grid items={system} canManage={canManage} onOpen={openEdit} onDuplicate={duplicate} />}

      {toastEl}
    </div>
  );
}

function SectionHead({ label, n }: { label: string; n: number }) {
  return <div style={{ fontFamily: WA.serif, fontSize: 19, fontWeight: 600, color: WA.ink, marginBottom: 12 }}>{label} <span style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: WA.faint2 }}>· {n}</span></div>;
}

function Grid({ items, canManage, onOpen, onDuplicate }: { items: TemplateVM[]; canManage: boolean; onOpen: (t: TemplateVM) => void; onDuplicate: (t: TemplateVM) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(248px,1fr))", gap: 12, marginBottom: 4 }}>
      {items.map((t) => {
        const v = catVis(t.category);
        return (
          <div key={t.id} style={{ display: "flex", flexDirection: "column", background: "#fff", border: `1px solid ${WA.cardBorder}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(0,0,0,.04)", overflow: "hidden" }}>
            <button type="button" onClick={() => onOpen(t)} style={{ textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: "16px 16px 12px", fontFamily: "inherit", flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={21} color={v.accent} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: WA.ink, lineHeight: 1.25 }}>{t.name}</div>
                  <div style={{ marginTop: 2, fontSize: 12.5, color: WA.faint, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.description ?? `${CATEGORY[t.category] ?? t.category} workshop`}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 13, paddingTop: 12, borderTop: `1px solid ${WA.hair}`, fontSize: 11.5, color: WA.faint }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="Clock" size={13} color={WA.faint2} />{t.minutes} min</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="Layers" size={13} color={WA.faint2} />{t.steps} blocks</span>
                {t.used > 0 ? <span style={{ marginLeft: "auto", color: WA.faint2 }}>Used {t.used}×</span> : null}
              </div>
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderTop: `1px solid ${WA.hair}`, background: "#faf9f5" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: t.owned ? v.accent : WA.faint2 }}>{t.owned ? "Editable" : "Framework"}</span>
              {canManage ? (
                t.owned
                  ? <button onClick={() => onOpen(t)} style={{ border: "none", background: "none", color: WA.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                  : <button onClick={() => onDuplicate(t)} style={{ border: "none", background: "none", color: WA.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Duplicate</button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TemplateEditor({ draft, pending, onName, onCategory, onDescription, onPhase, onAdd, onRemove, onMove, onSave, onCancel, onDelete, onDuplicate }: {
  draft: Draft; pending: boolean;
  onName: (v: string) => void; onCategory: (v: Category) => void; onDescription: (v: string) => void;
  onPhase: (id: string, patch: Partial<TemplatePhase>) => void; onAdd: (type: Activity) => void; onRemove: (id: string) => void; onMove: (id: string, dir: -1 | 1) => void;
  onSave: () => void; onCancel: () => void; onDelete?: () => void; onDuplicate?: () => void;
}) {
  const ro = draft.readOnly;
  const v = catVis(draft.category);
  const total = useMemo(() => draft.phases.reduce((s, p) => s + (Number(p.minutes) || 0), 0), [draft.phases]);
  const phaseSummary = useMemo(() => PHASES.map((ph) => {
    const its = draft.phases.filter((p) => phaseOf(p.type) === ph.key);
    return { ...ph, vis: PHASE_VIS[ph.key], count: its.length, mins: its.reduce((s, p) => s + (Number(p.minutes) || 0), 0) };
  }).filter((p) => p.count > 0), [draft.phases]);

  const card: React.CSSProperties = { background: "#fff", border: `1px solid ${WA.cardBorder}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(0,0,0,.04)" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: WA.faint, marginBottom: 6 };
  const inp: React.CSSProperties = { width: "100%", background: "#fff", border: "1px solid #d4d4d4", borderRadius: 7, padding: "9px 11px", fontSize: 13.5, fontFamily: "inherit", color: WA.ink2 };

  return (
    <div style={{ color: WA.ink2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: WA.accent }}>{ro ? "Framework (read-only)" : draft.id ? "Edit template" : "New template"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {ro ? (
            <>
              <button onClick={onCancel} style={btnSec}>Back</button>
              {onDuplicate ? <button onClick={onDuplicate} style={btnPrim}>Duplicate to edit</button> : null}
            </>
          ) : (
            <>
              {onDelete ? <button disabled={pending} onClick={onDelete} style={{ ...btnSec, color: "#b8584a", borderColor: "#e8cfca" }}>Delete</button> : null}
              <button disabled={pending} onClick={onCancel} style={btnSec}>Cancel</button>
              <button disabled={pending || draft.phases.length === 0} onClick={onSave} style={btnPrim}>{draft.id ? "Save template" : "Create template"}</button>
            </>
          )}
        </div>
      </div>

      <div className="tpl-edit-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 18, alignItems: "start" }}>
        {/* main */}
        <div>
          <div style={{ ...card, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={24} color={v.accent} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={labelStyle}>Name</label>
                <input style={inp} value={draft.name} disabled={ro} onChange={(e) => onName(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 14, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Category</label>
                <select style={inp} value={draft.category} disabled={ro} onChange={(e) => onCategory(e.target.value as Category)}>
                  {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{CATEGORY[c] ?? c}</option>)}
                </select>
              </div>
              <div style={{ whiteSpace: "nowrap", paddingBottom: 8, fontSize: 12, color: WA.faint }}>
                <b style={{ fontFamily: WA.serif, fontSize: 18, color: WA.ink, fontWeight: 600 }}>{draft.phases.length}</b> steps <span style={{ color: "#d4d4d4", margin: "0 5px" }}>·</span> <b style={{ fontFamily: WA.serif, fontSize: 18, color: WA.ink, fontWeight: 600 }}>{total}</b> min
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Description <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#bcbcb3" }}>(optional)</span></label>
              <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={draft.description} disabled={ro} onChange={(e) => onDescription(e.target.value)} placeholder="When should a facilitator reach for this?" />
            </div>
          </div>

          {phaseSummary.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0" }}>
              {phaseSummary.map((p) => (
                <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${WA.cardBorder}`, borderRadius: 20, padding: "4px 11px", fontSize: 12, color: WA.faint, fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.vis.accent }} />{p.label}<b style={{ color: WA.ink }}>{p.count}</b><small style={{ color: WA.faint2, fontWeight: 600 }}>{p.mins}m</small>
                </span>
              ))}
            </div>
          ) : null}

          <div style={{ fontFamily: WA.serif, fontSize: 18, fontWeight: 600, color: WA.ink, margin: "18px 0 12px" }}>Agenda <span style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: WA.faint2 }}>· {draft.phases.length}</span></div>
          {draft.phases.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: WA.faint, ...card }}>No steps yet — add blocks from the library →</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {draft.phases.map((p, i) => {
                const ph = phaseOf(p.type); const pv = PHASE_VIS[ph];
                return (
                  <div key={p.id} style={{ position: "relative", display: "flex", gap: 12, alignItems: "flex-start", ...card, padding: "13px 14px 13px 16px", overflow: "hidden" }}>
                    <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: pv.accent }} />
                    <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: pv.tint, border: `1px solid ${pv.border}`, color: pv.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}><Icon name={actIcon(p.type)} size={15} color={pv.accent} /></span>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: pv.accent }}>{PHASE_LABEL[ph]}</span>
                        <span style={{ fontSize: 11, color: WA.faint2 }}>{ACTIVITY[p.type]?.label ?? p.type}</span>
                      </div>
                      <input style={{ ...inp, fontWeight: 600 }} value={p.title} disabled={ro} onChange={(e) => onPhase(p.id, { title: e.target.value })} placeholder="Step title" />
                      <input style={{ ...inp, fontSize: 12.5 }} value={p.prompt ?? ""} disabled={ro} onChange={(e) => onPhase(p.id, { prompt: e.target.value || null })} placeholder="Facilitator prompt (optional)" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 9, flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: WA.faint2, fontWeight: 600 }}>
                        <input style={{ ...inp, width: 52, textAlign: "center", padding: "6px 4px" }} inputMode="numeric" value={String(p.minutes)} disabled={ro} onChange={(e) => onPhase(p.id, { minutes: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} />min
                      </div>
                      {!ro ? (
                        <div style={{ display: "flex", gap: 5 }}>
                          <IconBtn disabled={i === 0} onClick={() => onMove(p.id, -1)} label="Move up">↑</IconBtn>
                          <IconBtn disabled={i === draft.phases.length - 1} onClick={() => onMove(p.id, 1)} label="Move down">↓</IconBtn>
                          <IconBtn danger onClick={() => onRemove(p.id)} label="Remove">✕</IconBtn>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* side: block library */}
        <aside className="tpl-edit-side" style={{ position: "sticky", top: 14 }}>
          {!ro ? (
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: WA.faint, marginBottom: 12 }}>Block library</div>
              {PALETTE.map((grp) => {
                const pv = PHASE_VIS[grp.key];
                return (
                  <div key={grp.key} style={{ marginBottom: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: pv.accent, marginBottom: 7 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: pv.accent }} />{grp.label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {grp.acts.map((a) => (
                        <button key={a} type="button" onClick={() => onAdd(a)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${pv.border}`, background: pv.tint, color: pv.accent, borderRadius: 7, padding: "5px 9px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          <Icon name={actIcon(a)} size={13} color={pv.accent} />{ACTIVITY[a]?.label ?? a}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: WA.faint, marginBottom: 10 }}>Framework</div>
              <p style={{ margin: 0, fontSize: 13, color: WA.faint }}>This is a built-in framework. Duplicate it to customise the agenda for your workspace.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const btnPrim: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: WA.accent, color: "#fff", border: "none", borderRadius: 7, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnSec: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: "#404040", border: "1px solid #d4d4d4", borderRadius: 7, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

function IconBtn({ children, onClick, disabled, danger, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; label: string }) {
  return <button onClick={onClick} disabled={disabled} aria-label={label} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${danger ? "#e8cfca" : "#d4d4d4"}`, background: "#fff", color: danger ? "#b8584a" : WA.faint, fontSize: 13, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{children}</button>;
}
