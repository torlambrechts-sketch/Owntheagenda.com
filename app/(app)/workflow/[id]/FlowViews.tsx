"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { reorderSteps, addStep, removeStep, setBranch } from "../actions";

export type FlowStep = {
  id: string;
  ord: number;
  kind: string;
  title: string;
  status: string;
  gate: string | null;
  config?: Record<string, unknown>;
  branch: {
    dynamic: string | null;
    op: string | null;
    value: number | null;
    thenName: string | null;
    elseName: string | null;
  } | null;
};

export type FlowTemplate = { id: string; name: string };

type View = "outline" | "timeline" | "table" | "map";

const KIND: Record<string, { label: string; tone: string }> = {
  assessment: { label: "Assessment", tone: "var(--role)" },
  launch: { label: "Collect", tone: "var(--amber)" },
  interpret: { label: "Interpret", tone: "var(--muted)" },
  score: { label: "Score", tone: "var(--role)" },
  workshop: { label: "Workshop", tone: "var(--green)" },
  commit: { label: "Commit", tone: "var(--green)" },
  report: { label: "Report", tone: "var(--amber)" },
  repulse: { label: "Re-pulse", tone: "var(--role)" },
  branch: { label: "Branch", tone: "var(--rust)" },
  custom: { label: "Custom", tone: "var(--muted)" },
};
// Kinds that can be added on the canvas (mirrors program_add_step's allow-list).
const ADDABLE = ["assessment", "launch", "interpret", "score", "workshop", "commit", "report", "repulse", "branch", "custom"] as const;
const DYN: Record<string, string> = {
  psych_safety: "Psychological safety",
  trust: "Trust",
  conflict_norms: "Conflict norms",
  role_clarity: "Role clarity",
  decision_rights: "Decision rights",
};
function kindOf(k: string) { return KIND[k] ?? { label: k, tone: "var(--muted)" }; }
function dynLabel(d: string | null) { return d ? DYN[d] ?? d : "the reading"; }
function opLabel(op: string | null) { return op === "gte" ? "at or above" : "below"; }
function stepPill(s: string) {
  return s === "active" ? { l: "Active", c: "open" }
    : s === "done" ? { l: "Done", c: "internal" }
      : s === "skipped" ? { l: "Skipped", c: "draft" }
        : { l: "Pending", c: "draft" };
}
function branchText(b: NonNullable<FlowStep["branch"]>) {
  return `If ${dynLabel(b.dynamic)} is ${opLabel(b.op)} ${b.value ?? "—"}, run ${b.thenName ?? "a workshop"}; otherwise ${b.elseName ?? "a workshop"}.`;
}
function previewText(s: FlowStep): string {
  if (s.branch) return branchText(s.branch);
  switch (s.kind) {
    case "assessment": return "Open the assessment for the team.";
    case "launch": return s.gate || "Hold until enough people respond.";
    case "interpret": return "Read the aggregate result together.";
    case "score": return "Compute the scores from the responses.";
    case "workshop": return "Run the workshop session.";
    case "commit": return "Capture the measures the team agreed.";
    case "report": return "Share the results as a report.";
    case "repulse": return "Re-measure after a while to see movement.";
    default: return s.gate || "—";
  }
}

export function FlowViews({
  title,
  status,
  teamName,
  programId,
  canEdit = false,
  templates = [],
  steps: initialSteps,
}: {
  title: string;
  status: string;
  teamName: string | null;
  programId: string;
  canEdit?: boolean;
  templates?: FlowTemplate[];
  steps: FlowStep[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("outline");
  const [preview, setPreview] = useState(false);
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Server prop is the source of truth; resync if it changes (after a refresh).
  useEffect(() => { setSteps(initialSteps); }, [initialSteps]);

  // Run a mutating action: show saving state, surface errors, refresh on success.
  function run(p: Promise<{ error?: string }>) {
    setSaving(true); setErr(null);
    p.then((res) => {
      setSaving(false);
      if (res.error) { setErr(res.error); return; }
      router.refresh();
    });
  }
  function doAdd(kind: string, title: string) {
    // Append after the highest ord — robust to an optimistic drag-reorder whose
    // local `.ord` values haven't been refreshed yet.
    const afterOrd = steps.length ? Math.max(...steps.map((s) => s.ord)) : 0;
    setAdding(false);
    run(addStep(programId, afterOrd, kind, title));
  }
  function doRemove(id: string) {
    if (editId === id) setEditId(null);
    run(removeStep(id));
  }
  function doBranch(id: string, dynamic: string, op: string, value: number, thenT: string, elseT: string) {
    setEditId(null);
    run(setBranch(id, dynamic, op, value, thenT, elseT));
  }

  const statusPill = status === "active" ? { l: "Active", c: "open" }
    : status === "completed" ? { l: "Completed", c: "internal" }
      : { l: "Archived", c: "draft" };

  const connectsTo = (i: number) => {
    const s = steps[i];
    if (s.branch) return `${s.branch.thenName ?? "a workshop"} / ${s.branch.elseName ?? "a workshop"}`;
    const next = steps[i + 1];
    return next ? next.title : "End";
  };

  // Drag-to-reorder on the Map. Reorders optimistically, persists the new
  // sequence, and reverts on error.
  function onDrop(targetId: string) {
    const from = steps.findIndex((s) => s.id === dragId);
    const to = steps.findIndex((s) => s.id === targetId);
    setDragId(null); setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    const next = steps.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const prev = steps;
    setSteps(next);
    setSaving(true); setErr(null);
    reorderSteps(programId, next.map((s) => s.id)).then((res) => {
      setSaving(false);
      if (res.error) { setSteps(prev); setErr(res.error); return; }
      router.refresh();
    });
  }

  return (
    <>
      <div className="a-phead" style={{ marginTop: 8 }}>
        <div>
          <div className="a-pt">{title}</div>
          <div className="a-ps">
            {teamName ? `${teamName} · ` : ""}{steps.length} {steps.length === 1 ? "step" : "steps"}
          </div>
        </div>
        <div className="a-pr">
          <span className={`pill ${statusPill.c}`}>{statusPill.l}</span>
          <button className="btn-sec" onClick={() => setPreview(true)}>▷ Preview run</button>
        </div>
      </div>

      <nav className="as-tabs" aria-label="Flow views">
        {([["outline", "Outline"], ["timeline", "Timeline"], ["table", "Table"], ["map", "Map"]] as [View, string][]).map(([k, l]) => (
          <button key={k} className={`as-tab${view === k ? " on" : ""}`} onClick={() => setView(k)}>{l}</button>
        ))}
      </nav>

      {steps.length === 0 ? (
        <div className="empty">This flow has no steps yet.</div>
      ) : view === "outline" ? (
        <div className="a-ovcard">
          {steps.map((s, i) => {
            const k = kindOf(s.kind); const p = stepPill(s.status);
            return (
              <div key={s.id} className="flow-out-row">
                <span className="flow-out-n" style={{ background: k.tone }}>{i + 1}</span>
                <div className="flow-out-body">
                  <div className="flow-out-h">
                    <span className="flow-out-t">{s.title}</span>
                    <span className="flow-chip" style={{ color: k.tone, borderColor: k.tone }}>{k.label}</span>
                    <span className={`pill sm ${p.c}`}>{p.l}</span>
                  </div>
                  {s.branch ? <div className="flow-out-sub">{branchText(s.branch)}</div>
                    : s.gate ? <div className="flow-out-sub">{s.gate}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "timeline" ? (
        <div className="a-ovcard">
          <div className="wsd-timeline">
            {steps.map((s, i) => {
              const k = kindOf(s.kind); const p = stepPill(s.status);
              return (
                <div className="wsd-step" key={s.id}>
                  {i < steps.length - 1 ? <span className="wsd-line" /> : null}
                  <span className="wsd-dot" style={{ borderColor: k.tone }} />
                  <div className="wsd-step-body">
                    <div className="wsd-step-h">
                      <span className="wsd-step-t">{s.title}</span>
                      <span className="wsd-step-meta">{k.label} · {p.l}</span>
                    </div>
                    {s.branch ? <div className="wsd-step-p">{branchText(s.branch)}</div>
                      : s.gate ? <div className="wsd-step-p">{s.gate}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "table" ? (
        <div className="tbl-card">
          <table className="tbl">
            <thead>
              <tr><th style={{ width: 48 }}>Step</th><th>Name</th><th style={{ width: 120 }}>Type</th><th style={{ width: 110 }}>Status</th><th>Connects to</th></tr>
            </thead>
            <tbody>
              {steps.map((s, i) => {
                const k = kindOf(s.kind); const p = stepPill(s.status);
                return (
                  <tr key={s.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{s.title}</td>
                    <td><span className="flow-chip" style={{ color: k.tone, borderColor: k.tone }}>{k.label}</span></td>
                    <td><span className={`pill sm ${p.c}`}>{p.l}</span></td>
                    <td style={{ color: "var(--muted)" }}>{connectsTo(i)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a-ovcard">
          {canEdit ? (
            <div className="flowmap-hint">
              {saving ? "Saving order…" : err ? <span style={{ color: "var(--rust)" }}>{err}</span> : "Drag a node to reorder the flow."}
            </div>
          ) : null}
          <div className="flowmap">
            {steps.map((s, i) => {
              const k = kindOf(s.kind); const p = stepPill(s.status);
              const editingBranch = canEdit && s.kind === "branch" && editId === s.id;
              return (
                <div key={s.id}>
                  <div
                    className={`flowmap-node${canEdit ? " drag" : ""}${overId === s.id && dragId !== s.id ? " over" : ""}${dragId === s.id ? " dragging" : ""}`}
                    style={{ borderColor: k.tone }}
                    draggable={canEdit}
                    onDragStart={canEdit ? () => setDragId(s.id) : undefined}
                    onDragOver={canEdit ? (e) => { e.preventDefault(); setOverId(s.id); } : undefined}
                    onDragLeave={canEdit ? () => setOverId((o) => (o === s.id ? null : o)) : undefined}
                    onDrop={canEdit ? (e) => { e.preventDefault(); onDrop(s.id); } : undefined}
                    onDragEnd={canEdit ? () => { setDragId(null); setOverId(null); } : undefined}
                  >
                    {canEdit ? <span className="flowmap-grip" aria-hidden>⠿</span> : null}
                    <span className="flowmap-chip" style={{ background: k.tone }}>{k.label}</span>
                    <span className="flowmap-t">{s.title}</span>
                    <span className={`pill sm ${p.c}`}>{p.l}</span>
                    {canEdit ? (
                      <span className="flowmap-acts">
                        {s.kind === "branch" ? (
                          <button className="flowmap-act" draggable={false} title="Edit routing"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setEditId(editingBranch ? null : s.id); }}>✎</button>
                        ) : null}
                        {s.status !== "done" ? (
                          <button className="flowmap-act del" draggable={false} title="Delete step"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); doRemove(s.id); }}>✕</button>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  {editingBranch ? (
                    <BranchEditor step={s} templates={templates} saving={saving}
                      onSave={(d, o, v, t, el) => doBranch(s.id, d, o, v, t, el)} onCancel={() => setEditId(null)} />
                  ) : s.branch ? (
                    <div className="flowmap-routes">
                      <div className="flowmap-route"><span className="flowmap-cond" style={{ color: "var(--rust)" }}>if {dynLabel(s.branch.dynamic)} {opLabel(s.branch.op)} {s.branch.value ?? "—"}</span> → {s.branch.thenName ?? "a workshop"}</div>
                      <div className="flowmap-route"><span className="flowmap-cond" style={{ color: "var(--green)" }}>otherwise</span> → {s.branch.elseName ?? "a workshop"}</div>
                    </div>
                  ) : null}
                  {i < steps.length - 1 ? <div className="flowmap-arrow" aria-hidden>↓</div> : null}
                </div>
              );
            })}
            <div className="flowmap-end" aria-hidden>End</div>
            {canEdit ? (
              adding ? (
                <AddStepForm saving={saving} onAdd={doAdd} onCancel={() => setAdding(false)} />
              ) : (
                <button className="flowmap-add" onClick={() => setAdding(true)}>＋ Add step</button>
              )
            ) : null}
          </div>
        </div>
      )}

      <SideWindow open={preview} onClose={() => setPreview(false)} title="Preview run" subtitle={title}>
        <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
          How this flow runs, step by step. Branches choose a path from the team&rsquo;s reading.
        </p>
        <ol className="agenda">
          {steps.map((s, i) => {
            const k = kindOf(s.kind);
            return (
              <li key={s.id} className="agenda-step">
                <div className="agenda-h">
                  <span className="agenda-t">{i + 1}. {s.title}</span>
                  <span className="agenda-meta" style={{ color: k.tone }}>{k.label}</span>
                </div>
                <div className="agenda-p">{previewText(s)}</div>
              </li>
            );
          })}
        </ol>
      </SideWindow>
    </>
  );
}

// Inline branch-routing editor on the canvas — mirrors the composer's editor,
// backed by program_set_branch.
function BranchEditor({
  step, templates, saving, onSave, onCancel,
}: {
  step: FlowStep;
  templates: FlowTemplate[];
  saving: boolean;
  onSave: (dynamic: string, op: string, value: number, thenT: string, elseT: string) => void;
  onCancel: () => void;
}) {
  const c = step.config ?? {};
  const [dynamic, setDynamic] = useState((c.dynamic as string) ?? "psych_safety");
  const [op, setOp] = useState((c.op as string) ?? "lt");
  const [value, setValue] = useState(String((c.value as number) ?? 3));
  const [thenT, setThenT] = useState((c.then_template as string) ?? templates[0]?.id ?? "");
  const [elseT, setElseT] = useState((c.else_template as string) ?? templates[0]?.id ?? "");
  return (
    <div className="flowmap-edit">
      <div className="flowmap-edit-row">
        <span>If</span>
        <select className="inp sm" value={dynamic} onChange={(e) => setDynamic(e.target.value)}>
          {Object.entries(DYN).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="inp sm" value={op} onChange={(e) => setOp(e.target.value)}>
          <option value="lt">is below</option>
          <option value="gte">is at or above</option>
        </select>
        <input className="inp sm" style={{ width: 64 }} type="number" min={1} max={5} step={0.5} value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <label className="flowmap-edit-pick">Then run
        <select className="inp sm" value={thenT} onChange={(e) => setThenT(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="flowmap-edit-pick">Otherwise
        <select className="inp sm" value={elseT} onChange={(e) => setElseT(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-prim sm" disabled={saving || !thenT || !elseT} onClick={() => onSave(dynamic, op, Number(value), thenT, elseT)}>Save routing</button>
        <button className="btn-sec sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// Inline "add step" form at the end of the canvas — kind + title, backed by
// program_add_step.
function AddStepForm({ saving, onAdd, onCancel }: { saving: boolean; onAdd: (kind: string, title: string) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<string>("workshop");
  const [title, setTitle] = useState("");
  return (
    <div className="flowmap-edit" style={{ marginTop: 6 }}>
      <div className="flowmap-edit-row">
        <select className="inp sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          {ADDABLE.map((k) => <option key={k} value={k}>{kindOf(k).label}</option>)}
        </select>
        <input className="inp sm" style={{ flex: 1, minWidth: 120 }} placeholder={`${kindOf(kind).label} step name`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-prim sm" disabled={saving} onClick={() => onAdd(kind, title)}>Add step</button>
        <button className="btn-sec sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
