"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DYN, dynLabel, opLabel } from "@/app/(app)/workflow/dynamics";
import {
  addStep,
  removeStep,
  moveStep,
  reorderSteps,
  setBranch,
  renameFlow,
  updateStep,
  duplicateStep,
} from "@/app/(app)/workflow/actions";

// Full-screen visual Flow Builder — the "Assessment & workshop flow builder"
// design, adapted to the sequence-based program engine. Node positions persist
// in program_step.config.pos; ordering/branching reuse the existing RPCs.

export type Template = { id: string; name: string };
export type BuilderStep = {
  id: string;
  ord: number;
  kind: string;
  title: string;
  status: string;
  gate: string | null;
  config: Record<string, unknown>;
  pos: { x: number; y: number } | null;
  branch: {
    dynamic: string | null;
    op: string | null;
    value: number | null;
    thenTemplate: string | null;
    elseTemplate: string | null;
    thenName: string | null;
    elseName: string | null;
  } | null;
};

type View = "canvas" | "table" | "outline" | "timeline";

const KIND: Record<string, { label: string; tone: string; phase: string }> = {
  assessment: { label: "Assessment", tone: "var(--role)", phase: "Measure" },
  launch: { label: "Collect", tone: "var(--amber)", phase: "Measure" },
  interpret: { label: "Interpret", tone: "var(--muted)", phase: "Measure" },
  score: { label: "Score", tone: "var(--role)", phase: "Measure" },
  workshop: { label: "Workshop", tone: "var(--green)", phase: "Act" },
  commit: { label: "Commit", tone: "var(--green)", phase: "Act" },
  report: { label: "Report", tone: "var(--amber)", phase: "Act" },
  branch: { label: "Branch", tone: "var(--rust)", phase: "Route" },
  repulse: { label: "Re-pulse", tone: "var(--role)", phase: "Route" },
  custom: { label: "Custom", tone: "var(--muted)", phase: "Route" },
};
function kindOf(k: string) { return KIND[k] ?? { label: k, tone: "var(--muted)", phase: "Route" }; }
const PALETTE_GROUPS: { group: string; items: string[] }[] = [
  { group: "Measure", items: ["assessment", "launch", "interpret", "score"] },
  { group: "Act on it", items: ["workshop", "commit", "report"] },
  { group: "Route & follow up", items: ["branch", "repulse", "custom"] },
];
const PHASES = ["Measure", "Act", "Route"];
const PHASE_LABEL: Record<string, string> = { Measure: "Measure", Act: "Act on it", Route: "Route & follow up" };

// Per-kind inspector Configuration fields (the handoff's SCHEMA, adapted to the
// engine's kinds and this product's English copy — no HSE/ROS framing). Values
// persist into program_step.config; they are descriptive metadata the builder
// surfaces, except `branch`, which has its own editor wired to program_set_branch.
type Field =
  | { k: string; l: string; t: "text" | "number" | "textarea" }
  | { k: string; l: string; t: "select"; o: string[] }
  | { k: string; l: string; t: "toggle" };
const SCHEMA: Record<string, Field[]> = {
  assessment: [
    { k: "instrument", l: "Instrument", t: "text" },
    { k: "anonymous", l: "Anonymous responses", t: "toggle" },
  ],
  launch: [
    { k: "min_responses", l: "Wait for responses", t: "number" },
    { k: "collect_days", l: "Collect within (days)", t: "number" },
  ],
  score: [
    { k: "scale", l: "Scale", t: "select", o: ["1–5", "1–7", "0–100"] },
    { k: "aggregation", l: "Aggregation", t: "select", o: ["Section mean", "Lowest section", "Weighted"] },
  ],
  workshop: [
    { k: "duration", l: "Duration (min)", t: "number" },
    { k: "participants", l: "Participants", t: "number" },
    { k: "facilitator", l: "Facilitator", t: "text" },
    { k: "location", l: "Location", t: "text" },
    { k: "output", l: "Expected output", t: "textarea" },
  ],
  commit: [
    { k: "due_days", l: "Due (days)", t: "number" },
    { k: "assignee", l: "Assignee", t: "select", o: ["Auto from result", "Facilitator", "Line manager", "Team lead"] },
  ],
  report: [
    { k: "destination", l: "Destination", t: "select", o: ["Insight hub", "Export PDF", "Email summary"] },
  ],
  repulse: [
    { k: "after_days", l: "Re-pulse after (days)", t: "number" },
  ],
};

function stepPill(s: string) {
  return s === "active" ? { l: "Active", c: "open" }
    : s === "done" ? { l: "Done", c: "internal" }
      : s === "skipped" ? { l: "Skipped", c: "draft" }
        : { l: "Pending", c: "draft" };
}
function subText(s: BuilderStep): string {
  const desc = s.config?.description;
  if (typeof desc === "string" && desc.trim()) return desc;
  if (s.branch) return `If ${dynLabel(s.branch.dynamic)} ${opLabel(s.branch.op)} ${s.branch.value ?? "—"}`;
  switch (s.kind) {
    case "assessment": return "Open the assessment for the team.";
    case "launch": return s.gate || "Hold until enough people respond.";
    case "interpret": return "Read the aggregate result together.";
    case "score": return "Compute the scores from the responses.";
    case "workshop": return "Run the workshop session.";
    case "commit": return "Capture the measures the team agreed.";
    case "report": return "Share the results as a report.";
    case "repulse": return "Re-measure after a while to see movement.";
    default: return s.gate || "A custom step.";
  }
}

const NODE_W = 230;
const NODE_H = 76;
const COL_X = 90;
const ROW_GAP = 132;
const ROW_Y0 = 40;

export function FlowBuilderShell({
  programId,
  title: initialTitle,
  status,
  teamName,
  templates,
  steps: initialSteps,
}: {
  programId: string;
  title: string;
  status: string;
  teamName: string | null;
  templates: Template[];
  steps: BuilderStep[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [steps, setSteps] = useState<BuilderStep[]>(initialSteps);
  const [title, setTitle] = useState(initialTitle);
  const [view, setView] = useState<View>("canvas");
  const [selId, setSelId] = useState<string | null>(initialSteps[0]?.id ?? null);
  const [addMenu, setAddMenu] = useState(false);
  const [preview, setPreview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => { setSteps(initialSteps); }, [initialSteps]);
  useEffect(() => { setTitle(initialTitle); }, [initialTitle]);

  const ordered = [...steps].sort((a, b) => a.ord - b.ord);
  const selected = steps.find((s) => s.id === selId) ?? null;

  // Effective canvas position for a node (persisted, else a default column).
  const posOf = useCallback(
    (s: BuilderStep) => {
      if (s.pos) return s.pos;
      const i = ordered.findIndex((o) => o.id === s.id);
      return { x: COL_X, y: ROW_Y0 + Math.max(0, i) * ROW_GAP };
    },
    [ordered],
  );

  // ---- action plumbing ----------------------------------------------------
  function run(p: Promise<{ error?: string }>, after?: () => void) {
    setSaving(true); setErr(null);
    startTransition(async () => {
      const res = await p;
      setSaving(false);
      if (res.error) { setErr(res.error); return; }
      after?.();
      router.refresh();
    });
  }
  function doAdd(kind: string) {
    setAddMenu(false);
    const afterOrd = steps.length ? Math.max(...steps.map((s) => s.ord)) : 0;
    run(addStep(programId, afterOrd, kind, kindOf(kind).label));
  }
  function doRemove(id: string) {
    if (selId === id) setSelId(null);
    run(removeStep(id));
  }
  function doRenameStep(id: string, t: string) {
    const s = steps.find((x) => x.id === id);
    if (!s || s.title === t.trim() || !t.trim()) return;
    run(updateStep(id, { title: t }));
  }
  function doBranch(id: string, d: string, o: string, v: number, t: string, e: string) {
    run(setBranch(id, d, o, v, t, e));
  }
  // Merge inspector Description / Configuration values into the step's config.
  function doConfig(id: string, patch: Record<string, unknown>) {
    const s = steps.find((x) => x.id === id);
    if (!s) return;
    run(updateStep(id, { config: { ...s.config, ...patch } }));
  }
  function doDuplicate(id: string) {
    run(duplicateStep(id));
  }
  function persistPos(id: string, x: number, y: number) {
    const s = steps.find((x2) => x2.id === id);
    if (!s) return;
    run(updateStep(id, { config: { ...s.config, pos: { x, y } } }));
  }
  // Make `targetId` the immediate successor of `sourceId` (connect-by-port).
  function connect(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const ids = ordered.map((s) => s.id).filter((i) => i !== targetId);
    const at = ids.indexOf(sourceId);
    if (at < 0) return;
    ids.splice(at + 1, 0, targetId);
    // optimistic reorder
    setSteps((prev) => prev.map((s) => ({ ...s, ord: ids.indexOf(s.id) + 1 })));
    run(reorderSteps(programId, ids));
  }

  function commitTitle() {
    if (title.trim() && title.trim() !== initialTitle) run(renameFlow(programId, title));
  }

  // ---- canvas drag (move) + connect --------------------------------------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const connRef = useRef<{ from: string } | null>(null);
  const [, force] = useState(0);
  const [tempLine, setTempLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const toContent = useCallback((clientX: number, clientY: number) => {
    const el = scrollRef.current;
    if (!el) return { x: clientX, y: clientY };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left + el.scrollLeft, y: clientY - r.top + el.scrollTop };
  }, []);

  const onNodeDown = (e: React.PointerEvent, s: BuilderStep) => {
    if (e.button !== 0) return;
    const p = posOf(s);
    const c = toContent(e.clientX, e.clientY);
    dragRef.current = { id: s.id, dx: c.x - p.x, dy: c.y - p.y, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelId(s.id);
  };
  const onPortDown = (e: React.PointerEvent, s: BuilderStep) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    connRef.current = { from: s.id };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const c = toContent(e.clientX, e.clientY);
    if (dragRef.current) {
      const d = dragRef.current;
      d.moved = true;
      setSteps((prev) => prev.map((s) => (s.id === d.id ? { ...s, pos: { x: Math.max(0, c.x - d.dx), y: Math.max(0, c.y - d.dy) } } : s)));
    } else if (connRef.current) {
      const from = steps.find((s) => s.id === connRef.current!.from);
      if (from) {
        const p = posOf(from);
        setTempLine({ x1: p.x + NODE_W / 2, y1: p.y + NODE_H, x2: c.x, y2: c.y });
      }
    }
  };
  const endInteraction = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      dragRef.current = null;
      if (d.moved) {
        const s = steps.find((x) => x.id === d.id);
        if (s && s.pos) persistPos(d.id, s.pos.x, s.pos.y);
      }
      return;
    }
    if (connRef.current) {
      const from = connRef.current.from;
      connRef.current = null;
      setTempLine(null);
      // find a node under the pointer
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const nodeEl = el?.closest<HTMLElement>("[data-node-id]");
      const targetId = nodeEl?.dataset.nodeId;
      if (targetId && targetId !== from) connect(from, targetId);
      else force((n) => n + 1);
    }
  };

  // keyboard delete on the selected node
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if ((ev.key === "Delete" || ev.key === "Backspace") && selected && view === "canvas") {
        const tag = (ev.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (selected.status !== "done") { ev.preventDefault(); doRemove(selected.id); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, view]);

  // canvas content bounds
  const bounds = ordered.reduce(
    (b, s) => {
      const p = posOf(s);
      return { w: Math.max(b.w, p.x + NODE_W + 80), h: Math.max(b.h, p.y + NODE_H + 80) };
    },
    { w: 800, h: 480 },
  );

  const statusPill = stepPill(status === "active" ? "active" : status === "completed" ? "done" : "skipped");
  const VIEWS: [View, string][] = [["canvas", "Canvas"], ["table", "Table"], ["outline", "Outline"], ["timeline", "Timeline"]];
  const metaphorHint =
    view === "canvas" ? "Drag nodes to lay them out · drag the bottom port onto another step to reorder"
      : view === "table" ? "Every step with its configuration and connection"
        : view === "outline" ? "The run order, top to bottom"
          : "Steps grouped by phase";

  return (
    <div className={`fbz ${fullscreen ? "fullscreen" : "framed"}`}>
      {/* top bar — only in full-screen, where the app shell is hidden */}
      {fullscreen ? (
        <div className="fbz-top">
          <Link href="/workflow" className="fbz-brand">Own<span>theagenda</span></Link>
          <span className="fbz-top-vr" />
          <span className="fbz-top-ctx">Flows · Builder</span>
          <span className="fbz-top-sp" />
          {teamName ? <span className="fbz-top-team">{teamName}</span> : null}
          <button className="fbz-top-exit" onClick={() => setFullscreen(false)}>⤡ Exit full screen</button>
        </div>
      ) : null}

      {/* builder header */}
      <div className="fbz-head">
        <div className="fbz-bc">
          <Link href="/workflow">Flows</Link><span>›</span><span className="fbz-bc-id">{programId.slice(0, 8)}</span>
        </div>
        <div className="fbz-head-row">
          <div className="fbz-head-l">
            <input
              className="fbz-title"
              value={title}
              placeholder="Flow name"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
            <div className="fbz-meta">
              <span className="fbz-chip role">Assessment</span>
              <span className="fbz-arrow">→</span>
              <span className="fbz-chip green">Workshop</span>
              <span className="fbz-meta-vr" />
              <span className={`pill sm ${statusPill.c}`}>{statusPill.l}</span>
              <span className="fbz-dot">·</span>
              <span className="fbz-steps">{steps.length} step{steps.length === 1 ? "" : "s"}</span>
              <span className="fbz-dot">·</span>
              {saving || pending ? (
                <span className="fbz-save saving"><span className="fbz-save-dot" /> Saving…</span>
              ) : err ? (
                <span className="fbz-save err">{err}</span>
              ) : (
                <span className="fbz-save"><span className="fbz-save-dot ok" /> All changes saved</span>
              )}
            </div>
          </div>
          <div className="fbz-head-acts">
            <Link href={`/workflow/${programId}`} className="btn-sec">✕ Close</Link>
            <button className="btn-sec" onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Exit full screen" : "Full screen"}>
              {fullscreen ? "⤡ Exit full screen" : "⤢ Full screen"}
            </button>
            <button className="btn-sec" onClick={() => setPreview(true)}>▷ Preview run</button>
            <button className="btn-prim" onClick={() => router.push("/workflow")}>Publish</button>
          </div>
        </div>
        <div className="fbz-switch-row">
          <div className="fbz-switch">
            {VIEWS.map(([k, l]) => (
              <button key={k} className={`fbz-sw${view === k ? " on" : ""}`} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
          <span className="fbz-hint">{metaphorHint}</span>
        </div>
      </div>

      {/* body */}
      <div className="fbz-body">
        {view === "canvas" ? (
          <>
            {/* palette */}
            <div className="fbz-palette">
              <div className="fbz-pal-h">Add node</div>
              <div className="fbz-pal-s">Click to drop a step onto the canvas.</div>
              {PALETTE_GROUPS.map((g) => (
                <div className="fbz-pal-g" key={g.group}>
                  <div className="fbz-pal-gl">{g.group}</div>
                  {g.items.map((kind) => {
                    const k = kindOf(kind);
                    return (
                      <button key={kind} className="fbz-pal-it" disabled={pending} onClick={() => doAdd(kind)}>
                        <span className="fbz-pal-dot" style={{ background: k.tone }} />
                        {k.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* canvas */}
            <div
              ref={scrollRef}
              className="fbz-canvas"
              onPointerMove={onPointerMove}
              onPointerUp={endInteraction}
              onPointerLeave={(e) => { if (dragRef.current || connRef.current) endInteraction(e); }}
              onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("fbz-surface")) setSelId(null); }}
            >
              <div className="fbz-surface" style={{ width: bounds.w, height: bounds.h }}>
                <svg className="fbz-edges" width={bounds.w} height={bounds.h}>
                  {ordered.map((s, i) => {
                    const next = ordered[i + 1];
                    if (!next) return null;
                    const a = posOf(s); const b = posOf(next);
                    const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H;
                    const x2 = b.x + NODE_W / 2, y2 = b.y;
                    return (
                      <path key={s.id} d={`M ${x1} ${y1} C ${x1} ${y1 + 46} ${x2} ${y2 - 46} ${x2} ${y2}`}
                        fill="none" stroke="var(--line-2)" strokeWidth={2} markerEnd="url(#fbz-arrow)" />
                    );
                  })}
                  {tempLine ? (
                    <path d={`M ${tempLine.x1} ${tempLine.y1} C ${tempLine.x1} ${tempLine.y1 + 46} ${tempLine.x2} ${tempLine.y2 - 46} ${tempLine.x2} ${tempLine.y2}`}
                      fill="none" stroke="var(--forest)" strokeWidth={2} strokeDasharray="5 4" />
                  ) : null}
                  <defs>
                    <marker id="fbz-arrow" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="var(--line-2)" />
                    </marker>
                  </defs>
                </svg>

                {ordered.map((s, i) => {
                  const p = posOf(s); const k = kindOf(s.kind); const pill = stepPill(s.status);
                  const sel = s.id === selId;
                  return (
                    <div
                      key={s.id}
                      data-node-id={s.id}
                      className={`fbz-node${sel ? " sel" : ""}`}
                      style={{ left: p.x, top: p.y, width: NODE_W, borderColor: sel ? "var(--forest)" : k.tone }}
                      onPointerDown={(e) => onNodeDown(e, s)}
                    >
                      <span className="fbz-node-in" aria-hidden />
                      <div className="fbz-node-h">
                        <span className="fbz-node-ord" style={{ background: k.tone }}>{i + 1}</span>
                        <span className="fbz-node-chip" style={{ color: k.tone, borderColor: k.tone }}>{k.label}</span>
                        <span className={`pill sm ${pill.c}`} style={{ marginLeft: "auto" }}>{pill.l}</span>
                      </div>
                      <div className="fbz-node-t">{s.title}</div>
                      <div className="fbz-node-s">{subText(s)}</div>
                      {s.branch ? (
                        <div className="fbz-node-routes">
                          <span className="fbz-route"><b style={{ color: "var(--rust)" }}>if</b> {s.branch.thenName ?? "a workshop"}</span>
                          <span className="fbz-route"><b style={{ color: "var(--green)" }}>else</b> {s.branch.elseName ?? "a workshop"}</span>
                        </div>
                      ) : null}
                      <span
                        className="fbz-node-out"
                        title="Drag onto another step to set it next"
                        onPointerDown={(e) => onPortDown(e, s)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="fbz-canvas-hint">ⓘ Drag nodes to move · drag the bottom port to connect · ⌫ to delete</div>
            </div>

            {/* inspector */}
            <Inspector
              step={selected}
              templates={templates}
              pending={pending}
              onClose={() => setSelId(null)}
              onRename={doRenameStep}
              onBranch={doBranch}
              onConfig={doConfig}
              onDuplicate={doDuplicate}
              onDelete={doRemove}
            />
          </>
        ) : view === "outline" ? (
          <OutlineView ordered={ordered} selId={selId} onSelect={setSelId} onMove={(id, d) => run(moveStep(id, d))} onDelete={doRemove} onAdd={doAdd} addMenu={addMenu} setAddMenu={setAddMenu} pending={pending} />
        ) : view === "timeline" ? (
          <TimelineView ordered={ordered} onSelect={(id) => { setSelId(id); setView("canvas"); }} />
        ) : (
          <TableView ordered={ordered} onSelect={(id) => { setSelId(id); setView("canvas"); }} onAdd={doAdd} onDelete={doRemove} addMenu={addMenu} setAddMenu={setAddMenu} pending={pending} />
        )}
      </div>

      {preview ? <PreviewModal title={title} ordered={ordered} onClose={() => setPreview(false)} /> : null}
    </div>
  );
}

// ---- Inspector (right rail) ----------------------------------------------
function Inspector({
  step, templates, pending, onClose, onRename, onBranch, onConfig, onDuplicate, onDelete,
}: {
  step: BuilderStep | null;
  templates: Template[];
  pending: boolean;
  onClose: () => void;
  onRename: (id: string, t: string) => void;
  onBranch: (id: string, d: string, o: string, v: number, t: string, e: string) => void;
  onConfig: (id: string, patch: Record<string, unknown>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(step?.title ?? "");
  const [desc, setDesc] = useState((step?.config?.description as string) ?? "");
  useEffect(() => { setTitle(step?.title ?? ""); }, [step?.id, step?.title]);
  useEffect(() => { setDesc((step?.config?.description as string) ?? ""); }, [step?.id, step?.config]);
  if (!step) {
    return (
      <div className="fbz-inspect empty">
        <div className="fbz-inspect-empty">Select a node to edit its title, type and settings.</div>
      </div>
    );
  }
  const k = kindOf(step.kind); const pill = stepPill(step.status);
  const fields = SCHEMA[step.kind] ?? [];
  return (
    <div className="fbz-inspect">
      <div className="fbz-inspect-h">
        <span className="fbz-chip" style={{ color: k.tone, borderColor: k.tone }}>{k.label}</span>
        <button className="fbz-inspect-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <label className="fbz-fld">
        <span>Title</span>
        <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => onRename(step.id, title)} />
      </label>
      <label className="fbz-fld">
        <span>Description</span>
        <input className="inp" value={desc} placeholder="Short summary" onChange={(e) => setDesc(e.target.value)} onBlur={() => { if (desc !== ((step.config?.description as string) ?? "")) onConfig(step.id, { description: desc }); }} />
      </label>
      <div className="fbz-fld">
        <span>Status</span>
        <div><span className={`pill sm ${pill.c}`}>{pill.l}</span></div>
      </div>

      {fields.length ? (
        <div className="fbz-cfg">
          <div className="fbz-fld-l">Configuration</div>
          {fields.map((f) => (
            <ConfigField key={f.k} field={f} value={step.config?.[f.k]} pending={pending} onSave={(v) => onConfig(step.id, { [f.k]: v })} />
          ))}
        </div>
      ) : null}

      {step.kind === "branch" ? (
        <BranchEditor step={step} templates={templates} pending={pending} onSave={(d, o, v, t, e) => onBranch(step.id, d, o, v, t, e)} />
      ) : null}

      <div className="fbz-inspect-foot">
        <button className="btn-sec sm fbz-dup" disabled={pending} onClick={() => onDuplicate(step.id)}>⧉ Duplicate</button>
        {step.status !== "done" ? (
          <button className="fbz-del sm" disabled={pending} onClick={() => onDelete(step.id)}>🗑 Delete</button>
        ) : null}
      </div>
      {step.status === "done" ? <p className="fbz-fld-help" style={{ marginTop: 10 }}>Completed steps are locked.</p> : null}
    </div>
  );
}

// A single inspector Configuration field, persisted on change/blur.
function ConfigField({
  field, value, pending, onSave,
}: {
  field: Field;
  value: unknown;
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const [v, setV] = useState<string>(value == null ? "" : String(value));
  useEffect(() => { setV(value == null ? "" : String(value)); }, [value]);
  if (field.t === "toggle") {
    const on = value === true || value === "true";
    return (
      <button className="fbz-toggle" disabled={pending} onClick={() => onSave(!on)}>
        <span>{field.l}</span>
        <span className={`fbz-switch-pill${on ? " on" : ""}`}><span className="fbz-knob" /></span>
      </button>
    );
  }
  return (
    <label className="fbz-fld">
      <span>{field.l}</span>
      {field.t === "select" ? (
        <select className="inp" value={v} onChange={(e) => { setV(e.target.value); onSave(e.target.value); }}>
          <option value="">Choose…</option>
          {field.o.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.t === "textarea" ? (
        <textarea className="inp" rows={2} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onSave(v)} />
      ) : (
        <input className="inp" inputMode={field.t === "number" ? "numeric" : undefined} value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => onSave(field.t === "number" ? (v === "" ? null : Number(v)) : v)} />
      )}
    </label>
  );
}

function BranchEditor({
  step, templates, pending, onSave,
}: {
  step: BuilderStep;
  templates: Template[];
  pending: boolean;
  onSave: (d: string, o: string, v: number, t: string, e: string) => void;
}) {
  const b = step.branch;
  const [dynamic, setDynamic] = useState(b?.dynamic ?? "psych_safety");
  const [op, setOp] = useState(b?.op ?? "lt");
  const [value, setValue] = useState(String(b?.value ?? 3));
  const [thenT, setThenT] = useState(b?.thenTemplate ?? templates[0]?.id ?? "");
  const [elseT, setElseT] = useState(b?.elseTemplate ?? templates[0]?.id ?? "");
  return (
    <div className="fbz-branch">
      <div className="fbz-fld-l">Routing condition</div>
      <div className="fbz-branch-row">
        <span>If</span>
        <select className="inp sm" value={dynamic} onChange={(e) => setDynamic(e.target.value)}>
          {Object.entries(DYN).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="inp sm" value={op} onChange={(e) => setOp(e.target.value)}>
          <option value="lt">is below</option>
          <option value="gte">is at or above</option>
        </select>
        <input className="inp sm" style={{ width: 60 }} type="number" min={1} max={5} step={0.5} value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <label className="fbz-fld"><span>Then run</span>
        <select className="inp" value={thenT} onChange={(e) => setThenT(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="fbz-fld"><span>Otherwise</span>
        <select className="inp" value={elseT} onChange={(e) => setElseT(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <button className="btn-prim sm" disabled={pending || !thenT || !elseT} onClick={() => onSave(dynamic, op, Number(value), thenT, elseT)}>Save routing</button>
    </div>
  );
}

// ---- Outline view ---------------------------------------------------------
function OutlineView({
  ordered, selId, onSelect, onMove, onDelete, onAdd, addMenu, setAddMenu, pending,
}: {
  ordered: BuilderStep[];
  selId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dir: number) => void;
  onDelete: (id: string) => void;
  onAdd: (kind: string) => void;
  addMenu: boolean;
  setAddMenu: (v: boolean) => void;
  pending: boolean;
}) {
  return (
    <div className="fbz-outline">
      <div className="fbz-out-rail">
        <div className="fbz-out-railh">Steps · {ordered.length} in order</div>
        <div className="fbz-out-list">
          {ordered.map((s, i) => {
            const k = kindOf(s.kind);
            return (
              <div key={s.id} className={`fbz-out-row${s.id === selId ? " sel" : ""}`} onClick={() => onSelect(s.id)}>
                <span className="fbz-out-n" style={{ background: k.tone }}>{i + 1}</span>
                <div className="fbz-out-txt">
                  <div className="fbz-out-t">{s.title}</div>
                  <div className="fbz-out-k">{k.label}</div>
                </div>
                <span className="fbz-out-ctl">
                  <button className="linkbtn xs" disabled={pending || i === 0} onClick={(e) => { e.stopPropagation(); onMove(s.id, -1); }}>↑</button>
                  <button className="linkbtn xs" disabled={pending || i === ordered.length - 1} onClick={(e) => { e.stopPropagation(); onMove(s.id, 1); }}>↓</button>
                  {s.status !== "done" ? <button className="linkbtn xs danger" disabled={pending} onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}>✕</button> : null}
                </span>
              </div>
            );
          })}
        </div>
        <div className="fbz-out-add">
          <button className="fbz-out-addbtn" onClick={() => setAddMenu(!addMenu)}>＋ Add step</button>
          {addMenu ? <PaletteMenu onPick={onAdd} pending={pending} /> : null}
        </div>
      </div>
      <div className="fbz-out-main">
        <div className="fbz-out-lv">Linear view</div>
        {ordered.map((s, i) => {
          const k = kindOf(s.kind);
          return (
            <div key={s.id}>
              <div className="fbz-lin" onClick={() => onSelect(s.id)} style={{ borderColor: s.id === selId ? "var(--forest)" : "var(--line)" }}>
                <span className="fbz-lin-i" style={{ background: k.tone }} />
                <div className="fbz-lin-b">
                  <div className="fbz-lin-t">{s.title}</div>
                  <div className="fbz-lin-s">{subText(s)}</div>
                </div>
                <span className="fbz-chip" style={{ color: k.tone, borderColor: k.tone }}>{k.label}</span>
              </div>
              {i < ordered.length - 1 ? <div className="fbz-lin-line" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Timeline view --------------------------------------------------------
function TimelineView({ ordered, onSelect }: { ordered: BuilderStep[]; onSelect: (id: string) => void }) {
  return (
    <div className="fbz-timeline">
      {PHASES.map((phase, pi) => {
        const items = ordered.filter((s) => kindOf(s.kind).phase === phase);
        return (
          <div className="fbz-lanewrap" key={phase}>
            <div className="fbz-lane">
              <div className="fbz-lane-h">{PHASE_LABEL[phase]} <span>{items.length}</span></div>
              <div className="fbz-lane-body">
                {items.length === 0 ? <div className="fbz-lane-empty">No steps in this phase</div> : null}
                {items.map((s) => {
                  const k = kindOf(s.kind);
                  return (
                    <div key={s.id} className="fbz-lane-card" onClick={() => onSelect(s.id)}>
                      <span className="fbz-chip" style={{ color: k.tone, borderColor: k.tone }}>{k.label}</span>
                      <div className="fbz-lane-t">{s.title}</div>
                      <div className="fbz-lane-s">{subText(s)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            {pi < PHASES.length - 1 ? <div className="fbz-lane-arrow">›</div> : null}
          </div>
        );
      })}
    </div>
  );
}

// ---- Table view -----------------------------------------------------------
function TableView({
  ordered, onSelect, onAdd, onDelete, addMenu, setAddMenu, pending,
}: {
  ordered: BuilderStep[];
  onSelect: (id: string) => void;
  onAdd: (kind: string) => void;
  onDelete: (id: string) => void;
  addMenu: boolean;
  setAddMenu: (v: boolean) => void;
  pending: boolean;
}) {
  const connects = (i: number): { tag?: string; label: string }[] => {
    const s = ordered[i];
    if (s.branch) return [{ tag: "if", label: s.branch.thenName ?? "a workshop" }, { tag: "else", label: s.branch.elseName ?? "a workshop" }];
    const n = ordered[i + 1];
    return [{ label: n ? n.title : "End of flow" }];
  };
  return (
    <div className="fbz-tablewrap">
      <div className="bt-card" style={{ maxWidth: 960, margin: "0 auto" }}>
        <div className="bt-head">
          <div>
            <div className="bt-head-t">Flow steps</div>
            <div className="bt-head-s">{ordered.length} step{ordered.length === 1 ? "" : "s"} · executed top to bottom</div>
          </div>
          <div className="bt-addwrap">
            <button className="bt-addbtn" onClick={() => setAddMenu(!addMenu)} aria-expanded={addMenu}>＋ Add step</button>
            {addMenu ? <PaletteMenu onPick={onAdd} pending={pending} /> : null}
          </div>
        </div>
        <div className="bt-grid bt-grid-h"><div>Step</div><div>Name</div><div>Type</div><div>Configuration</div><div>Connects to</div><div /></div>
        {ordered.map((s, i) => {
          const k = kindOf(s.kind); const chips = connects(i);
          return (
            <div className="bt-grid bt-row" key={s.id} style={{ boxShadow: `inset 3px 0 0 ${k.tone}`, cursor: "pointer" }} onClick={() => onSelect(s.id)}>
              <div><span className="bt-order" style={{ color: k.tone, borderColor: k.tone }}>{i + 1}</span></div>
              <div className="bt-name">
                <span className="bt-icon" style={{ background: k.tone }} aria-hidden />
                <div className="bt-name-txt"><div className="bt-name-t">{s.title}</div><div className="bt-name-s">{subText(s)}</div></div>
              </div>
              <div><span className="flow-chip" style={{ color: k.tone, borderColor: k.tone }}>{k.label}</span></div>
              <div className="bt-cfg">{s.branch ? `${dynLabel(s.branch.dynamic)} ${opLabel(s.branch.op)} ${s.branch.value ?? "—"}` : "—"}</div>
              <div className="bt-conns">{chips.map((c, ci) => (<span className="bt-conn" key={ci}>{c.tag ? <span className={`bt-conn-tag ${c.tag}`}>{c.tag}</span> : null}<span className="bt-conn-l">{c.label}</span></span>))}</div>
              <div className="bt-del">{s.status !== "done" ? <button className="bt-delbtn" disabled={pending} onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}>✕</button> : <span className="bt-lock">🔒</span>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Preview run modal ----------------------------------------------------
function cfgStr(s: BuilderStep, key: string): string | null {
  const v = s.config?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}
function cfgNum(s: BuilderStep, key: string): number | null {
  const v = s.config?.[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
function cfgBool(s: BuilderStep, key: string): boolean {
  return s.config?.[key] === true || s.config?.[key] === "true";
}
function estMinutes(steps: BuilderStep[]): number {
  return steps.reduce((m, s) => m + (s.kind === "workshop" ? cfgNum(s, "duration") ?? 90 : 5), 0);
}
function fmtDur(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function PreviewModal({ title, ordered, onClose }: { title: string; ordered: BuilderStep[]; onClose: () => void }) {
  const branch = ordered.find((s) => s.kind === "branch" && s.branch) ?? null;
  const [path, setPath] = useState<"then" | "else">("then");
  return (
    <div className="fbz-pv-scrim" onClick={onClose}>
      <div className="fbz-pv" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="fbz-pv-head">
          <div>
            <div className="fbz-pv-eye">Preview run</div>
            <div className="fbz-pv-title">{title}</div>
          </div>
          <button className="fbz-pv-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {branch && branch.branch ? (
          <div className="fbz-pv-branchbar">
            <span className="fbz-pv-rule">⑂ If {dynLabel(branch.branch.dynamic)} {opLabel(branch.branch.op)} {branch.branch.value ?? "—"}</span>
            <div className="fbz-pv-toggle">
              <button className={path === "then" ? "on" : ""} onClick={() => setPath("then")}>Condition met</button>
              <button className={path === "else" ? "on" : ""} onClick={() => setPath("else")}>Otherwise</button>
            </div>
          </div>
        ) : null}
        <div className="fbz-pv-body">
          {ordered.map((s, i) => <PreviewStep key={s.id} step={s} last={i === ordered.length - 1} path={path} />)}
          <div className="fbz-pv-done">⚑ Run complete · <b>{ordered.length} step{ordered.length === 1 ? "" : "s"}</b> · estimated <b>{fmtDur(estMinutes(ordered))}</b></div>
        </div>
      </div>
    </div>
  );
}

function PreviewStep({ step, last, path }: { step: BuilderStep; last: boolean; path: "then" | "else" }) {
  const k = kindOf(step.kind);
  return (
    <div className="fbz-pv-step">
      {!last ? <span className="fbz-pv-line" /> : null}
      <span className="fbz-pv-dot" style={{ background: k.tone }} />
      <div className="fbz-pv-card">
        <div className="fbz-pv-card-h">
          <span className="fbz-pv-card-t">{step.title}</span>
          <span className="fbz-pv-card-k" style={{ color: k.tone }}>{k.label}</span>
        </div>
        <div className="fbz-pv-card-b"><PreviewBody step={step} path={path} /></div>
      </div>
    </div>
  );
}

// Per-kind preview body — every field is driven by the step's own config, so
// the preview reflects what the builder actually set (no placeholder data).
function PreviewBody({ step: s, path }: { step: BuilderStep; path: "then" | "else" }) {
  switch (s.kind) {
    case "assessment": {
      const instrument = cfgStr(s, "instrument") ?? "Team pulse";
      return (
        <>
          <div className="fbz-pv-sub">{instrument}{cfgBool(s, "anonymous") ? " · anonymous responses" : ""}</div>
          <div className="fbz-pv-q">Respondents answer each item on a 1–5 scale</div>
          <div className="fbz-pv-likert">{[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}</div>
        </>
      );
    }
    case "launch": {
      const min = cfgNum(s, "min_responses"); const days = cfgNum(s, "collect_days");
      return (
        <div className="fbz-pv-chips">
          <span>⏳ Hold for {min ?? "enough"} responses</span>
          {days ? <span>📅 within {days} days</span> : null}
        </div>
      );
    }
    case "interpret":
      return <div className="fbz-pv-sub">Read the aggregate result together before acting.</div>;
    case "score": {
      const scale = cfgStr(s, "scale") ?? "1–5"; const agg = cfgStr(s, "aggregation") ?? "Section mean";
      return <div className="fbz-pv-chips"><span>Scale {scale}</span><span>{agg}</span></div>;
    }
    case "workshop": {
      const dur = cfgNum(s, "duration"); const part = cfgNum(s, "participants");
      const loc = cfgStr(s, "location"); const fac = cfgStr(s, "facilitator"); const out = cfgStr(s, "output");
      const any = dur || part || loc || fac;
      return (
        <>
          {any ? (
            <div className="fbz-pv-chips">
              {dur ? <span>🕐 {dur} min</span> : null}
              {part ? <span>👥 {part} people</span> : null}
              {loc ? <span>📍 {loc}</span> : null}
              {fac ? <span>★ {fac}</span> : null}
            </div>
          ) : <div className="fbz-pv-sub">Run the workshop session on the results.</div>}
          {out ? <div className="fbz-pv-out"><b>Expected output:</b> {out}</div> : null}
        </>
      );
    }
    case "commit": {
      const due = cfgNum(s, "due_days"); const who = cfgStr(s, "assignee") ?? "an owner";
      return <div className="fbz-pv-sub">Capture the agreed measures · {who}{due ? ` · due in ${due} days` : ""}.</div>;
    }
    case "report": {
      const dest = cfgStr(s, "destination") ?? "the Insight hub";
      return <div className="fbz-pv-sub">Share the results to {dest}.</div>;
    }
    case "repulse": {
      const days = cfgNum(s, "after_days");
      return <div className="fbz-pv-sub">Re-measure{days ? ` after ${days} days` : " later"} to track movement.</div>;
    }
    case "branch": {
      if (!s.branch) return <div className="fbz-pv-sub">Set the routing condition.</div>;
      const target = path === "then" ? (s.branch.thenName ?? "a workshop") : (s.branch.elseName ?? "a workshop");
      return (
        <>
          <div className="fbz-pv-cond"><span>Condition</span><code>if {dynLabel(s.branch.dynamic)} {opLabel(s.branch.op)} {s.branch.value ?? "—"}</code></div>
          <div className="fbz-pv-outcome">✓ {path === "then" ? "Condition met" : "Otherwise"} → runs {target}</div>
        </>
      );
    }
    default:
      return <div className="fbz-pv-sub">{subText(s)}</div>;
  }
}

function PaletteMenu({ onPick, pending }: { onPick: (kind: string) => void; pending: boolean }) {
  return (
    <div className="bt-menu" role="menu">
      {PALETTE_GROUPS.map((g) => (
        <div className="bt-menu-g" key={g.group}>
          <div className="bt-menu-gl">{g.group}</div>
          <div className="bt-menu-grid">
            {g.items.map((kind) => {
              const k = kindOf(kind);
              return (
                <button key={kind} className="bt-menu-it" role="menuitem" disabled={pending} onClick={() => onPick(kind)}>
                  <span className="bt-menu-dot" style={{ background: k.tone }} />{k.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
