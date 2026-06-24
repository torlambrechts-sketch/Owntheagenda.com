"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { ACTIVITY, clock } from "@/lib/util";
import type { Enums } from "@/types/database.types";
import {
  addBlock,
  updateBlock,
  deleteBlock,
  reorderBlocks,
  setAgendaLayout,
  updateWorkshopTitle,
  scheduleWorkshop,
  setWorkshopObjectives,
  setBlockSurvey,
} from "../actions";
import { sendSurvey } from "../../assessments/actions";
import { PALETTE, DEFAULT_MINUTES, PHASES, PHASE_LABEL, phaseOf as phaseKey, type PhaseKey } from "../blocks";
import { Icon, statusVis, actIcon, PHASE_VIS, WA } from "../visuals";

type Cand = { id: string; name: string; dueAt: string | null; responded: number; total: number };
export type AssessmentPanel = {
  blockId: string;
  stepTitle: string;
  kind: string;
  kindName: string;
  timing: string;
  bound: (Cand & { status: string }) | null;
  candidates: Cand[];
};

type Activity = Enums<"activity_type">;
type Dyn = Enums<"team_dynamic"> | "";

export type BlockConfig = { budget?: number; lanes?: string[]; options?: string[]; silent?: boolean; capture?: boolean; autoAdvance?: boolean; prework?: boolean };

export type BlockRow = {
  id: string;
  title: string;
  activityType: Activity;
  duration: number;
  prompt: string | null;
  linkedDynamic: Enums<"team_dynamic"> | null;
  ownerName: string | null;
  phase: PhaseKey | null;
  config: BlockConfig;
};

// Effective facilitation phase: explicit override, else derived from activity.
function effectivePhase(b: { phase: PhaseKey | null; activityType: Activity }): PhaseKey {
  return b.phase ?? phaseKey(b.activityType);
}
// First natural activity of a phase — used by the board's per-column "Add block".
function defaultActivityFor(ph: PhaseKey): Activity {
  const grp = PALETTE.find((p) => p.key === ph);
  return (grp?.acts[0] ?? "canvas") as Activity;
}

// A grounded agenda block suggested from the team's weakest pulse dynamic.
export type BlockSuggestion = {
  id: string;
  title: string;
  activityType: Activity;
  duration: number;
  prompt: string | null;
  linkedDynamic: Enums<"team_dynamic">;
  dynamicLabel: string;
  why: string;
};

const DYN: [Dyn, string][] = [
  ["", "— none —"],
  ["psych_safety", "Psychological safety"],
  ["trust", "Trust"],
  ["conflict_norms", "Conflict norms"],
  ["role_clarity", "Role clarity"],
  ["decision_rights", "Decision rights"],
];
// Group the runnable activities into the design's facilitation phases (Open →
// Diverge → Converge → Decide → Close) so the picker reads as a phased library.
const ACT_PHASES: { label: string; acts: Activity[] }[] = [
  { label: "Open", acts: ["checkin"] },
  { label: "Diverge", acts: ["brainstorm", "hmw", "canvas"] },
  { label: "Converge", acts: ["vote", "feedback"] },
  { label: "Decide", acts: ["outcome"] },
  { label: "Close", acts: ["retrospective", "discuss"] },
];
const PHASE_COLOR: Record<string, string> = {
  Open: "var(--role)", Diverge: "#6d28d9", Converge: "#0e7490", Decide: "var(--forest)", Close: "var(--amber)",
};
function phaseOf(a: string): { label: string; color: string } {
  const p = ACT_PHASES.find((ph) => ph.acts.includes(a as Activity));
  return p ? { label: p.label, color: PHASE_COLOR[p.label] } : { label: "", color: "var(--green)" };
}
// Short helper text shown under the activity picker per module.
const ACT_HINT: Partial<Record<Activity, string>> = {
  canvas: "Free-form sticky-note board.",
  brainstorm: "Members add idea cards, then dot-vote. Ranked live.",
  vote: "Dot-vote on a set list of options you define below.",
  feedback: "Cards posted into named columns (e.g. Start / Stop / Continue).",
  discuss: "Open discussion against a prompt.",
  checkin: "A round to open or close the room.",
  outcome: "Capture commitments as tracked actions.",
  hmw: "Reframe the problem as “How might we…” and gather ideas, dot-voted live.",
  retrospective: "Cards posted into Start / Stop / Continue columns.",
};

const VIEW_HINT: Record<string, string> = {
  board: "Phase columns — drag blocks between phases, click to edit, add per column.",
  table: "Blocks as table rows — click a row to edit it in the panel.",
  canvas: "Free-form canvas — drag a block left or right to reorder.",
  agenda: "The full agenda — every block with its configuration.",
  timeline: "Phases left to right — read the session at a glance.",
};

// Canvas (node-graph) view of the linear agenda: nodes left-to-right joined by
// connectors, draggable to reorder. Click a node to edit it in the side panel.
function AgendaCanvas({
  blocks, selectedId, canManage, onSelect, onReorder,
}: {
  blocks: BlockRow[];
  selectedId: string | null;
  canManage: boolean;
  onSelect: (b: BlockRow) => void;
  onReorder: (ids: string[]) => void;
}) {
  const NODE_W = 210, GAP = 56, STEP = NODE_W + GAP, X0 = 24, Y = 30;
  const [order, setOrder] = useState<string[] | null>(null);
  const dragRef = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const ids = order ?? blocks.map((b) => b.id);
  const byId = new Map(blocks.map((b) => [b.id, b] as const));
  const list = ids.map((id) => byId.get(id)).filter(Boolean) as BlockRow[];

  function onDown(e: React.PointerEvent, id: string) {
    if (!canManage) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { id, startX: e.clientX, moved: false };
    setOrder(blocks.map((b) => b.id));
  }
  function onMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const cur = (order ?? blocks.map((b) => b.id)).slice();
    const from = cur.indexOf(d.id);
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    const target = Math.max(0, Math.min(cur.length - 1, Math.round((from * STEP + dx) / STEP)));
    if (target !== from) {
      cur.splice(from, 1);
      cur.splice(target, 0, d.id);
      d.startX = e.clientX; // re-anchor to the dropped position
      setOrder(cur);
    }
  }
  function onUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const final = order;
    setOrder(null);
    if (d.moved && final && final.join() !== blocks.map((b) => b.id).join()) onReorder(final);
  }

  const width = Math.max(list.length * STEP + X0 + GAP, 600);
  return (
    <div className="wb-canvas" onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      <div className="wb-canvas-surface" style={{ width, height: 200 }}>
        <svg width={width} height={200} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {list.slice(0, -1).map((b, i) => {
            const x1 = X0 + i * STEP + NODE_W, x2 = X0 + (i + 1) * STEP, my = Y + 44;
            return <path key={b.id} d={`M ${x1} ${my} C ${x1 + 28} ${my}, ${x2 - 28} ${my}, ${x2} ${my}`} fill="none" stroke="#cbd5d2" strokeWidth={2} markerEnd="url(#wbarrow)" />;
          })}
          <defs><marker id="wbarrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#cbd5d2" /></marker></defs>
        </svg>
        {list.map((b, i) => {
          const pv = PHASE_VIS[phaseKey(b.activityType)];
          const sel = selectedId === b.id;
          return (
            <div key={b.id} onPointerDown={(e) => onDown(e, b.id)} onClick={() => { if (!dragRef.current?.moved) onSelect(b); }}
              className="wb-node" style={{ left: X0 + i * STEP, top: Y, width: NODE_W, borderColor: sel ? WA.accent : "#e6e2d8", boxShadow: sel ? `0 0 0 2px ${WA.accent}, 0 10px 22px rgba(0,0,0,.12)` : "0 1px 2px rgba(0,0,0,.05),0 4px 10px rgba(0,0,0,.03)", cursor: canManage ? "grab" : "pointer" }}>
              <div className="wb-node-h">
                <span className="wb-node-ic" style={{ background: pv.tint, border: `1px solid ${pv.border}`, color: pv.accent }}><Icon name={actIcon(b.activityType)} size={13} color={pv.accent} /></span>
                <span className="wb-node-kind" style={{ color: pv.accent }}>{ACTIVITY[b.activityType]?.label ?? b.activityType}</span>
              </div>
              <div className="wb-node-t">{b.title || "Untitled"}</div>
              <div className="wb-node-s">{b.duration} min</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtSched(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function BuilderClient({
  workshop,
  teamId,
  teamName,
  canManage,
  blocks,
  assessments,
  suggestions = [],
}: {
  workshop: { id: string; title: string; scheduledAt: string | null; objective: string | null; objectives: string[] };
  teamId: string;
  teamName: string;
  canManage: boolean;
  blocks: BlockRow[];
  assessments: AssessmentPanel[];
  suggestions?: BlockSuggestion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  // assessment binding side-window — asBlockId is the survey step being bound
  const [asBlockId, setAsBlockId] = useState<string | null>(null);
  const [pickSurvey, setPickSurvey] = useState("");
  const [newDue, setNewDue] = useState("");
  const asPanel = assessments.find((a) => a.blockId === asBlockId) ?? null;
  function openPicker(blockId: string) {
    setPickSurvey("");
    setNewDue("");
    setAsBlockId(blockId);
  }
  function attachSurvey(blockId: string) {
    if (!pickSurvey) return;
    run(() => setBlockSurvey(workshop.id, blockId, pickSurvey), "Assessment attached");
    setAsBlockId(null);
  }
  function detachSurvey(blockId: string) {
    run(() => setBlockSurvey(workshop.id, blockId, null), "Detached — will auto-match at start");
  }
  function sendAndAttach(panel: AssessmentPanel) {
    startTransition(async () => {
      const res = await sendSurvey(teamId, panel.kind, newDue || null);
      if (res.error) return flash(res.error);
      if (res.id) {
        const a = await setBlockSurvey(workshop.id, panel.blockId, res.id);
        if (a.error) {
          // The survey was sent to the team; pinning failed. Surface it and
          // refresh so it shows up in the candidate list to pin manually.
          setNewDue("");
          router.refresh();
          return flash(`Sent, but couldn't pin it: ${a.error}. Pick it from the list.`);
        }
      }
      setAsBlockId(null);
      setNewDue("");
      flash("Assessment sent & attached");
      router.refresh();
    });
  }

  // block editor side-window
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState<Activity>("canvas");
  const [duration, setDuration] = useState(10);
  const [prompt, setPrompt] = useState("");
  const [owner, setOwner] = useState("");
  const [phase, setPhase] = useState<PhaseKey | "">("");
  const [dyn, setDyn] = useState<Dyn>("");
  const [lanesText, setLanesText] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [budget, setBudget] = useState(3);
  const [silent, setSilent] = useState(false);
  const [capture, setCapture] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [prework, setPrework] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // title editor
  const [titleOpen, setTitleOpen] = useState(false);
  const [wsTitle, setWsTitle] = useState(workshop.title);

  // builder view metaphor (Workshop App handoff): Table / Canvas / Outline /
  // Timeline reads of the same agenda. Outline is the rich feature-complete list.
  const [bView, setBView] = useState<"board" | "table" | "canvas" | "agenda" | "timeline">("board");
  const [fullscreen, setFullscreen] = useState(false);
  // kanban drag state — id of the block being dragged
  const [dragId, setDragId] = useState<string | null>(null);
  // inline title editing in the builder chrome
  const [titleDraft, setTitleDraft] = useState(workshop.title);
  async function commitTitle() {
    const next = titleDraft.trim();
    if (!next || next === workshop.title) { setTitleDraft(workshop.title); return; }
    const res = await updateWorkshopTitle(workshop.id, next);
    if (res.error) { flash(res.error); setTitleDraft(workshop.title); }
    else { flash("Workshop renamed"); router.refresh(); }
  }
  // quick-add a block straight from the builder palette (no side-window)
  function quickAdd(activityType: Activity, intoPhase?: PhaseKey) {
    const def = DEFAULT_MINUTES[activityType] ?? 10;
    const cfg: Record<string, unknown> =
      activityType === "retrospective" ? { lanes: ["Start", "Stop", "Continue"] }
        : activityType === "vote" ? { budget: 3, options: [] }
          : activityType === "brainstorm" || activityType === "hmw" ? { budget: 3 }
            : {};
    // Pin the phase only when adding into a column that isn't the activity's natural one.
    const ph = intoPhase && intoPhase !== phaseKey(activityType) ? intoPhase : null;
    run(() => addBlock({ workshopId: workshop.id, title: ACTIVITY[activityType]?.label ?? "Step", activityType, duration: def, prompt: null, linkedDynamic: null, phase: ph, config: cfg }), "Block added");
  }
  // Add a grounded suggestion straight into the agenda, carrying its linked
  // dynamic and prompt so the block stays tied to the pulse it targets.
  function addSuggestion(s: BlockSuggestion) {
    const cfg: Record<string, unknown> =
      s.activityType === "retrospective" ? { lanes: ["Start", "Stop", "Continue"] }
        : s.activityType === "vote" ? { budget: 3, options: [] }
          : s.activityType === "brainstorm" || s.activityType === "hmw" ? { budget: 3 }
            : {};
    run(() => addBlock({ workshopId: workshop.id, title: s.title, activityType: s.activityType, duration: s.duration, prompt: s.prompt, linkedDynamic: s.linkedDynamic, config: cfg }), "Suggested block added");
  }
  // Suggestions already represented on the agenda (by linked dynamic) are hidden.
  const usedDynamics = new Set(blocks.map((b) => b.linkedDynamic).filter(Boolean) as string[]);
  const openSuggestions = suggestions.filter((s) => !usedDynamics.has(s.linkedDynamic));

  // schedule editor
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedAt, setSchedAt] = useState("");
  function openSchedule() {
    setSchedAt(toLocalInput(workshop.scheduledAt));
    setSchedOpen(true);
  }
  async function saveSchedule() {
    const res = await scheduleWorkshop(workshop.id, schedAt);
    if (res.error) flash(res.error);
    else {
      setSchedOpen(false);
      flash("Session scheduled — team notified");
      router.refresh();
    }
  }

  // objectives editor (anti-theatre: a session that makes decisions needs one).
  // Stored as an ordered list; the legacy single objective is the first entry.
  const objectives = workshop.objectives.length
    ? workshop.objectives
    : workshop.objective
      ? [workshop.objective]
      : [];
  const [objOpen, setObjOpen] = useState(false);
  const [objDraft, setObjDraft] = useState<string[]>([]);
  function openObjectives() {
    setObjDraft(objectives.length ? [...objectives] : [""]);
    setObjOpen(true);
  }
  function setObjAt(i: number, v: string) {
    setObjDraft((d) => d.map((x, j) => (j === i ? v : x)));
  }
  function addObjRow() {
    setObjDraft((d) => [...d, ""]);
  }
  function removeObjRow(i: number) {
    setObjDraft((d) => (d.length <= 1 ? [""] : d.filter((_, j) => j !== i)));
  }
  async function saveObjectives() {
    const res = await setWorkshopObjectives(workshop.id, objDraft);
    if (res.error) flash(res.error);
    else {
      setObjOpen(false);
      flash("Objectives saved");
      router.refresh();
    }
  }

  const totalMin = blocks.reduce((s, b) => s + b.duration, 0);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }
  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) flash(res.error);
      else {
        flash(ok);
        router.refresh();
      }
    });
  }

  function openAdd() {
    setEditId(null);
    setTitle("");
    setActivity("canvas");
    setDuration(10);
    setPrompt("");
    setOwner("");
    setPhase("");
    setDyn("");
    setLanesText("");
    setOptionsText("");
    setBudget(3);
    setSilent(false);
    setCapture(false);
    setAutoAdvance(false);
    setPrework(false);
    setError(null);
    setOpen(true);
  }
  function openEdit(b: BlockRow) {
    setEditId(b.id);
    setTitle(b.title);
    setActivity(b.activityType);
    setDuration(b.duration);
    setPrompt(b.prompt ?? "");
    setOwner(b.ownerName ?? "");
    setPhase(b.phase ?? "");
    setDyn(b.linkedDynamic ?? "");
    setLanesText((b.config?.lanes ?? []).join("\n"));
    setOptionsText((b.config?.options ?? []).join("\n"));
    setBudget(b.config?.budget ?? 3);
    setSilent(!!b.config?.silent);
    setCapture(!!b.config?.capture);
    setAutoAdvance(!!b.config?.autoAdvance);
    setPrework(!!b.config?.prework);
    setError(null);
    setOpen(true);
  }
  function buildConfig(): Record<string, unknown> {
    const lanes = lanesText.split("\n").map((s) => s.trim()).filter(Boolean);
    const options = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const b = Math.max(1, Number(budget) || 3);
    const base: Record<string, unknown> = autoAdvance ? { autoAdvance: true } : {};
    if (activity === "feedback") return { ...base, lanes };
    if (activity === "retrospective") return { ...base, lanes: lanes.length ? lanes : ["Start", "Stop", "Continue"] };
    if (activity === "vote") return { ...base, options, budget: b };
    if (activity === "brainstorm" || activity === "hmw") return { ...base, budget: b, silent, ...(prework ? { prework: true } : {}) };
    if (activity === "checkin") return { ...base, capture };
    return base;
  }
  function previewHint(): string {
    const b = Math.max(1, Number(budget) || 3);
    switch (activity) {
      case "brainstorm": return prework ? "Members add cards as pre-work before the session, then reveal and dot-vote together live." : silent ? "Participants add idea cards privately, then reveal and dot-vote together." : "Participants add idea cards and dot-vote.";
      case "hmw": return "Members add ideas against the “How might we…” prompt, then dot-vote to prioritise.";
      case "retrospective": return "Participants post cards into the Start / Stop / Continue columns.";
      case "vote": return `Participants vote with ${b} dots across the options.`;
      case "feedback": return "Participants add cards to the columns.";
      case "checkin": return capture ? "Participants type a written response — cards you can edit, vote on and promote." : "Participants reflect, then tap “I’m ready” — no typing.";
      case "canvas": return "Participants collaborate on a shared visual board.";
      case "manual": return "Participants fill in their personal user manual.";
      case "charter": return "Participants co-write the team charter.";
      case "assess":
      case "survey": return "Participants complete an anonymous assessment.";
      case "outcome": return "Capture decisions and owned commitments together.";
      case "discuss": return "Discuss together; advance when everyone’s ready.";
      default: return "Reflect and discuss; advance when everyone’s ready.";
    }
  }
  // A compact visual mock of the module as participants will see it — reflects
  // the columns / options / mode being configured right now.
  function modulePreview() {
    const lanes = lanesText.split("\n").map((s) => s.trim()).filter(Boolean);
    const opts = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const b = Math.max(1, Math.min(5, Number(budget) || 3));
    if (activity === "feedback" || activity === "retrospective") {
      const cols = lanes.length ? lanes : activity === "retrospective" ? ["Start", "Stop", "Continue"] : ["Notes"];
      return (
        <div className="prev-cols">
          {cols.map((c, i) => (
            <div className="prev-col" key={i}><div className="prev-col-h">{c}</div><span className="prev-card mini" /><span className="prev-card mini" /></div>
          ))}
        </div>
      );
    }
    if (activity === "vote") {
      const o = opts.length ? opts : ["Option A", "Option B", "Option C"];
      return (
        <div className="prev-rows">
          {o.slice(0, 4).map((x, i) => (
            <div className="prev-row" key={i}><span>{x}</span><span className="prev-dots">{"●".repeat(b)}</span></div>
          ))}
        </div>
      );
    }
    if (activity === "brainstorm" || activity === "hmw") {
      return (
        <div className="prev-cards">
          <div className="prev-card">An idea… <span className="prev-dots">{"●".repeat(b)}</span></div>
          <div className="prev-card">Another idea…</div>
        </div>
      );
    }
    if (activity === "checkin") {
      return <div className="prev-readyrow">{capture ? <span className="prev-card mini wide" /> : <span className="prev-chip">✓ I’m ready</span>}</div>;
    }
    if (activity === "canvas") {
      return <div className="prev-canvas"><span /><span /><span /></div>;
    }
    if (activity === "outcome") {
      return (
        <div className="prev-rows">
          <div className="prev-row"><span>Decision recorded…</span></div>
          <div className="prev-row"><span>☑ Action · owner · due</span></div>
        </div>
      );
    }
    return null;
  }
  async function saveBlock() {
    setError(null);
    const payload = {
      title,
      activityType: activity,
      duration: Number(duration) || 5,
      prompt: prompt || null,
      linkedDynamic: (dyn || null) as Enums<"team_dynamic"> | null,
      ownerName: owner || null,
      // Persist the phase only when it diverges from the activity's natural phase.
      phase: phase && phase !== phaseKey(activity) ? phase : null,
      config: buildConfig(),
    };
    const res = editId
      ? await updateBlock({ workshopId: workshop.id, blockId: editId, ...payload })
      : await addBlock({ workshopId: workshop.id, ...payload });
    if (res.error) return setError(res.error);
    setOpen(false);
    flash(editId ? "Step updated" : "Step added");
    router.refresh();
  }
  // ---- kanban: drag a block into a phase column ----
  // Recompute the full linear order as the flattened (phase-order, within-column)
  // sequence so ord stays aligned with the board's reading order.
  function dropInto(targetPhase: PhaseKey, beforeId: string | null) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const moved = blocks.find((b) => b.id === id);
    if (!moved) return;
    // Build each column's ordered id list from current effective phases.
    const cols = new Map<PhaseKey, string[]>();
    for (const ph of PHASES) cols.set(ph.key, []);
    for (const b of blocks) {
      if (b.id === id) continue;
      cols.get(effectivePhase(b))!.push(b.id);
    }
    const target = cols.get(targetPhase)!;
    const at = beforeId ? target.indexOf(beforeId) : target.length;
    target.splice(at < 0 ? target.length : at, 0, id);
    // Flatten in phase order → new ord; set phase override where it diverges.
    const layout: { id: string; phase: string | null }[] = [];
    for (const ph of PHASES) {
      for (const bid of cols.get(ph.key)!) {
        const b = bid === id ? moved : blocks.find((x) => x.id === bid)!;
        const natural = phaseKey(b.activityType);
        layout.push({ id: bid, phase: ph.key === natural ? null : ph.key });
      }
    }
    // No-op guard: same order and same phases as now.
    const sameOrder = layout.map((l) => l.id).join() === blocks.map((b) => b.id).join();
    const samePhase = layout.every((l) => (l.phase ?? phaseKey(blocks.find((b) => b.id === l.id)!.activityType)) === effectivePhase(blocks.find((b) => b.id === l.id)!));
    if (sameOrder && samePhase) return;
    run(() => setAgendaLayout(workshop.id, layout), "Agenda updated");
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const ids = blocks.map((b) => b.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => reorderBlocks(workshop.id, ids), "Reordered");
  }
  function duplicate(b: BlockRow) {
    run(() => addBlock({
      workshopId: workshop.id,
      title: `${b.title} (copy)`,
      activityType: b.activityType,
      duration: b.duration,
      prompt: b.prompt ?? null,
      linkedDynamic: b.linkedDynamic ?? null,
      ownerName: b.ownerName ?? null,
      config: (b.config ?? {}) as Record<string, unknown>,
    }), "Duplicated");
  }
  async function saveTitle() {
    const res = await updateWorkshopTitle(workshop.id, wsTitle);
    if (res.error) flash(res.error);
    else {
      setTitleOpen(false);
      flash("Workshop renamed");
      router.refresh();
    }
  }

  let acc = 0;

  return (
    <div className={fullscreen ? "wb-root wb-full" : "wb-root"}>
      <div className={`objbar${objectives.length ? "" : " empty"}`}>
        <div className="objlab">{objectives.length > 1 ? "Objectives" : "Objective"}</div>
        <div className="objtext">
          {objectives.length === 0 ? (
            "Set the objectives — what must be true when this session ends?"
          ) : objectives.length === 1 ? (
            objectives[0]
          ) : (
            <ul className="objlist">
              {objectives.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          )}
        </div>
        {canManage ? (
          <button className="btn-sec" onClick={openObjectives}>
            {objectives.length ? "Edit" : "Set objectives"}
          </button>
        ) : null}
      </div>

      <div className="wb-chrome">
        <div className="wb-crumb">
          <Link href="/workshops" className="wb-crumb-l">Workshops</Link>
          <span className="wb-crumb-sep">›</span>
          <span className="wb-crumb-id">{teamName || "Team"}</span>
        </div>
        <div className="wb-head">
          <div className="wb-head-l">
            {canManage ? (
              <input
                className="wb-title-inp"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="Workshop name"
              />
            ) : (
              <div className="wb-title-static">{workshop.title}</div>
            )}
            <div className="wb-chips">
              <span className="wb-statuspill">{workshop.scheduledAt ? "Scheduled" : "Draft"}</span>
              <span className="wb-dot">·</span>
              <span className="wb-chip"><Icon name="Clock" size={13} color={WA.faint2} /> {totalMin} min</span>
              <span className="wb-dot">·</span>
              <span className="wb-chip">{blocks.length} blocks</span>
              {workshop.scheduledAt ? <><span className="wb-dot">·</span><span className="wb-chip"><Icon name="Calendar" size={13} color={WA.faint2} /> {fmtSched(workshop.scheduledAt)}</span></> : null}
              <span className="wb-dot">·</span>
              {pending ? <span className="wb-saving"><span className="wb-savedot saving" />Saving…</span> : <span className="wb-saved"><span className="wb-savedot" />All changes saved</span>}
            </div>
          </div>
          <div className="wb-actions">
            <button className="wb-btn" onClick={() => setFullscreen((f) => !f)}>{fullscreen ? "Exit full screen" : "Full screen"}</button>
            {canManage ? <button className="wb-btn" onClick={openSchedule}>{workshop.scheduledAt ? "Reschedule" : "Schedule"}</button> : null}
            <button className="wb-btn wb-btn-prim" onClick={() => router.push(`/run/${workshop.id}`)}><Icon name="Play" size={14} color="#fff" /> Start session</button>
          </div>
        </div>
        <div className="wb-viewbar">
          <div className="wb-seg">
            {([["board", "Board"], ["table", "Table"], ["canvas", "Canvas"], ["agenda", "Outline"], ["timeline", "Timeline"]] as const).map(([k, l]) => (
              <button key={k} className={`wb-segbtn${bView === k ? " on" : ""}`} onClick={() => setBView(k)}>{l}</button>
            ))}
          </div>
          <span className="wb-hint">{VIEW_HINT[bView]}</span>
          {canManage ? (
            <div className="wb-palette">
              <span className="wb-palette-l">Add block</span>
              {PALETTE.map((g) => (
                <span key={g.key} className="wb-palette-grp">
                  {g.acts.map((a) => {
                    const pv = PHASE_VIS[g.key];
                    return (
                      <button key={a} type="button" className="wb-palette-item" style={{ borderColor: pv.border, background: pv.tint, color: pv.accent }} onClick={() => quickAdd(a)} title={`Add ${ACTIVITY[a]?.label ?? a}`}>
                        <Icon name={actIcon(a)} size={12} color={pv.accent} />{ACTIVITY[a]?.label ?? a}
                      </button>
                    );
                  })}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {assessments.length ? (
        <div className="card aspanel">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            {assessments.length > 1 ? `Pre-work assessments · ${assessments.length} steps` : "Pre-work assessment"}
          </div>
          {assessments.map((a) => (
            <div className="asrow" key={a.blockId}>
              <div className="asrow-h">
                <div>
                  <b>{a.kindName}</b>
                  {assessments.length > 1 ? <span className="src">{a.stepTitle}</span> : null}
                </div>
                <span className="pill sm draft">{a.timing === "prerequisite" ? "Prerequisite" : "Live in session"}</span>
              </div>
              {a.bound ? (
                <div className="asbound">
                  <div className="asbound-main">
                    <b>{a.bound.name}</b>
                    {a.bound.status === "open" ? (
                      <span className="src">{a.bound.responded}/{a.bound.total} responded</span>
                    ) : (
                      <span className="src" style={{ color: "var(--rust)" }}>closed · {a.bound.responded}/{a.bound.total} responded — detach to auto-match a live one</span>
                    )}
                  </div>
                  <button className="linkbtn" disabled={pending} onClick={() => openPicker(a.blockId)}>Change</button>
                  <button className="linkbtn" style={{ color: "var(--rust)" }} disabled={pending} onClick={() => detachSurvey(a.blockId)}>Detach</button>
                </div>
              ) : (
                <div className="asauto">
                  <span className="form-note" style={{ flex: 1 }}>
                    Nothing pinned — the newest open “{a.kindName}” for {teamName} is used automatically at session start.
                  </span>
                  <button className="btn-sec" disabled={pending} onClick={() => openPicker(a.blockId)}>Attach ▸</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {canManage && openSuggestions.length ? (
        <div className="card aspanel wb-suggest">
          <div className="eyebrow" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="Sparkles" size={13} color="var(--amber)" /> Suggested from assessment
          </div>
          <div className="form-note" style={{ marginTop: 0, marginBottom: 10 }}>
            Grounded in {teamName || "the team"}’s lowest pulse readings — click to drop a targeted block into the agenda.
          </div>
          <div className="wb-suggest-row">
            {openSuggestions.map((s) => {
              const pv = PHASE_VIS[phaseKey(s.activityType)];
              return (
                <button key={s.id} type="button" className="wb-suggest-chip" onClick={() => addSuggestion(s)} disabled={pending} title={`Targets ${s.dynamicLabel} — ${s.why}`}>
                  <span className="wb-suggest-ic" style={{ background: pv.tint, border: `1px solid ${pv.border}`, color: pv.accent }}><Icon name={actIcon(s.activityType)} size={13} color={pv.accent} /></span>
                  <span className="wb-suggest-body">
                    <span className="wb-suggest-t">{s.title}</span>
                    <span className="wb-suggest-m">{s.dynamicLabel} · {s.duration} min</span>
                  </span>
                  <Icon name="Plus" size={13} color="var(--amber)" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {blocks.length === 0 && bView !== "board" ? (
        <div className="empty" style={{ marginTop: 8 }}>No blocks yet — add one from the palette above{canManage ? "" : " (ask a facilitator)"}.</div>
      ) : null}

      {bView === "board" ? (
        <div className="wb-board">
          {PHASES.map((ph) => {
            const items = blocks.filter((b) => effectivePhase(b) === ph.key);
            const mins = items.reduce((s, b) => s + b.duration, 0);
            const pv = PHASE_VIS[ph.key];
            return (
              <div
                key={ph.key}
                className={`wb-col${dragId ? " wb-col-drop" : ""}`}
                onDragOver={canManage ? (e) => { e.preventDefault(); } : undefined}
                onDrop={canManage ? () => dropInto(ph.key, null) : undefined}
              >
                <div className="wb-col-h">
                  <span className="tpl-phase-dot" style={{ background: pv.accent }} />
                  <span className="wb-col-t">{ph.label}</span>
                  <span className="wb-col-m">{items.length}{mins ? ` · ${mins}m` : ""}</span>
                </div>
                <div className="wb-col-body">
                  {items.map((b) => {
                    const sel = editId === b.id;
                    return (
                      <div
                        key={b.id}
                        className={`wb-card${sel ? " on" : ""}`}
                        draggable={canManage}
                        onDragStart={canManage ? () => setDragId(b.id) : undefined}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={canManage ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
                        onDrop={canManage ? (e) => { e.stopPropagation(); dropInto(ph.key, b.id); } : undefined}
                        onClick={() => canManage && openEdit(b)}
                      >
                        <div className="wb-card-h">
                          <span className="wb-card-ic" style={{ background: pv.tint, border: `1px solid ${pv.border}`, color: pv.accent }}><Icon name={actIcon(b.activityType)} size={12} color={pv.accent} /></span>
                          <span className="wb-card-t">{b.title || "Untitled"}</span>
                          {canManage ? (
                            <button className="wb-card-x" title="Remove" onClick={(e) => { e.stopPropagation(); if (confirm("Delete this step?")) run(() => deleteBlock(workshop.id, b.id), "Step removed"); }}>
                              <Icon name="X" size={12} color={WA.faint} />
                            </button>
                          ) : null}
                        </div>
                        <div className="wb-card-m">{ACTIVITY[b.activityType]?.label ?? b.activityType} · {b.duration}m{b.ownerName ? ` · ${b.ownerName}` : ""}</div>
                      </div>
                    );
                  })}
                  {canManage ? (
                    <button className="wb-col-add" onClick={() => quickAdd(defaultActivityFor(ph.key), ph.key)}>
                      <Icon name="Plus" size={13} color={WA.faint} /> Add block
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {blocks.length && bView === "canvas" ? (
        <AgendaCanvas blocks={blocks} selectedId={editId} canManage={canManage} onSelect={openEdit} onReorder={(ids) => run(() => reorderBlocks(workshop.id, ids), "Reordered")} />
      ) : null}

      {blocks.length && bView === "table" ? (
        <div className="tbl-card" style={{ marginBottom: 16 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Step</th>
                <th style={{ width: 120 }}>Phase</th>
                <th style={{ width: 90 }}>Duration</th>
                <th>Connects to</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => {
                const act = ACTIVITY[b.activityType] ?? { label: b.activityType, cls: "" };
                const ph = phaseOf(b.activityType);
                const next = blocks[i + 1];
                return (
                  <tr key={b.id} onClick={() => canManage && openEdit(b)} style={canManage ? { cursor: "pointer" } : undefined}>
                    <td style={{ color: "var(--faint)", fontWeight: 700 }}>{i + 1}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{b.title}</span>
                      <span className={`pill sm ${act.cls}`} style={{ marginLeft: 8 }}>{act.label}</span>
                      {b.ownerName ? <span className="bview-owner" style={{ marginLeft: 8 }}>· {b.ownerName}</span> : null}
                    </td>
                    <td>
                      <span className="bview-phase"><span className="tpl-phase-dot" style={{ background: ph.color }} />{ph.label || "—"}</span>
                    </td>
                    <td>{b.duration} min</td>
                    <td style={{ color: "var(--muted)" }}>{next ? next.title : <span style={{ color: "var(--faint)" }}>End of workshop</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {blocks.length && bView === "timeline" ? (
        <div className="bview-timeline">
          {ACT_PHASES.map((phase) => {
            const items = blocks.filter((b) => phaseOf(b.activityType).label === phase.label);
            if (!items.length) return null;
            const mins = items.reduce((s, b) => s + b.duration, 0);
            return (
              <div className="bview-lane" key={phase.label}>
                <div className="bview-lane-h">
                  <span className="tpl-phase-dot" style={{ background: PHASE_COLOR[phase.label] }} />
                  {phase.label}
                  <span className="bview-lane-meta">{items.length} · {mins}m</span>
                </div>
                <div className="bview-lane-items">
                  {items.map((b) => {
                    const act = ACTIVITY[b.activityType] ?? { label: b.activityType, cls: "" };
                    return (
                      <button key={b.id} type="button" className="bview-chip" onClick={() => canManage && openEdit(b)}>
                        <span className="bview-chip-t">{b.title}</span>
                        <span className="bview-chip-m">{act.label} · {b.duration}m</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="blocks" style={bView === "agenda" ? undefined : { display: "none" }}>
        {blocks.map((b, i) => {
          const start = acc;
          acc += b.duration;
          const act = ACTIVITY[b.activityType] ?? { label: b.activityType, cls: "" };
          const ph = phaseOf(b.activityType);
          const cfgHint =
            b.activityType === "feedback" || b.activityType === "retrospective"
              ? `${b.config?.lanes?.length ?? 0} columns`
              : b.activityType === "vote"
                ? `${b.config?.options?.length ?? 0} options · ${b.config?.budget ?? 3} dots each`
                : b.activityType === "brainstorm" || b.activityType === "hmw"
                  ? `${b.config?.budget ?? 3} dots each${b.config?.silent ? " · silent" : ""}${b.config?.prework ? " · pre-work" : ""}`
                  : null;
          return (
            <div className="block" key={b.id}>
              <div className="time">
                <div className="t">{clock(start)}</div>
                <div className="d">{b.duration} min</div>
              </div>
              <div className="brail" aria-hidden>
                <span className="dot" style={{ borderColor: ph.color }} title={ph.label} />
                {i < blocks.length - 1 ? <span className="line" /> : null}
              </div>
              <div className="bcard">
                <div className="top">
                  <h4>{b.title}</h4>
                  <span className={`pill sm ${act.cls}`}>{act.label}</span>
                  <span className="sp" />
                  {canManage ? (
                    <>
                      <button className="icon-btn" title="Move up" disabled={pending || i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button className="icon-btn" title="Move down" disabled={pending || i === blocks.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button className="icon-btn" title="Edit" onClick={() => openEdit(b)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </button>
                      <button className="icon-btn" title="Duplicate" disabled={pending} onClick={() => duplicate(b)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                      </button>
                      <button className="icon-btn danger" title="Delete" disabled={pending}
                        onClick={() => { if (confirm("Delete this step?")) run(() => deleteBlock(workshop.id, b.id), "Step removed"); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </>
                  ) : null}
                </div>
                {b.linkedDynamic ? (
                  <span className="grounded">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
                    Grounded · {DYN.find((d) => d[0] === b.linkedDynamic)?.[1]}
                  </span>
                ) : null}
                {cfgHint ? (
                  <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{cfgHint}</div>
                ) : null}
                {b.ownerName ? (
                  <div className="bview-owner" style={{ marginTop: 2 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
                    {b.ownerName}
                  </div>
                ) : null}
                {b.activityType === "vote" && (b.config?.options?.length ?? 0) === 0 ? (
                  <div className="bwarn">⚠ No options yet — add options so the team can vote (or seed them live in the run).</div>
                ) : null}
                {b.prompt ? <div className="desc">{b.prompt}</div> : null}
              </div>
            </div>
          );
        })}
        {blocks.length ? (
          <div className="block agenda-end">
            <div className="time"><div className="t" style={{ color: "var(--faint)" }}>{clock(acc)}</div></div>
            <div className="brail" aria-hidden><span className="dot end" /></div>
            <div className="endlbl">End of workshop · {blocks.reduce((s, b) => s + b.duration, 0)} min total</div>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div style={{ marginLeft: 78, marginTop: 4 }}>
          <button className="addlink" onClick={openAdd}>+ Add block</button>
        </div>
      ) : null}

      {/* block editor */}
      <SideWindow
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit block" : "Add block"}
        subtitle={workshop.title}
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={!title} onClick={saveBlock}>
                {editId ? "Save changes" : "Add block"}
              </button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        <div className="field">
          <label>Step name</label>
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Trust audit" />
        </div>
        <div className="two">
          <div className="field">
            <label>Activity type</label>
            <select className="inp" value={activity} onChange={(e) => {
              const a = e.target.value as Activity;
              setActivity(a);
              if (a === "retrospective" && !lanesText.trim()) setLanesText("Start\nStop\nContinue");
              if (a === "hmw" && !prompt.trim()) setPrompt("How might we …");
              // Don't carry the auto-filled HMW framing into a different module.
              else if (a !== "hmw" && prompt.trim() === "How might we …") setPrompt("");
            }}>
              {ACT_PHASES.map((p) => (
                <optgroup key={p.label} label={p.label}>
                  {p.acts.map((a) => (
                    <option key={a} value={a}>{ACTIVITY[a].label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Minutes</label>
            <input className="inp" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        </div>
        {ACT_HINT[activity] ? (
          <div className="form-note" style={{ marginTop: -6, marginBottom: 14 }}>{ACT_HINT[activity]}</div>
        ) : null}
        {activity === "feedback" || activity === "retrospective" ? (
          <div className="field">
            <label>Columns <span className="opt">(one per line)</span></label>
            <textarea className="inp" rows={3} value={lanesText} onChange={(e) => setLanesText(e.target.value)} placeholder={"Start\nStop\nContinue"} />
          </div>
        ) : null}
        {activity === "vote" ? (
          <>
            <div className="field">
              <label>Options to vote on <span className="opt">(one per line)</span></label>
              <textarea className="inp" rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={"Option A\nOption B\nOption C"} />
              {!optionsText.trim() ? (
                <p className="fieldwarn">⚠ Add at least one option — otherwise you’ll need to seed options live during the run.</p>
              ) : null}
            </div>
            <div className="field">
              <label>Votes per person</label>
              <input className="inp" type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
          </>
        ) : null}
        {activity === "brainstorm" || activity === "hmw" ? (
          <>
            <div className="field">
              <label>Votes per person</label>
              <input className="inp" type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
            <div className="field">
              <label className="checkrow">
                <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} />
                Silent ideation — write privately, reveal together
              </label>
              <div className="form-note">Cards stay hidden from others until the facilitator reveals them — prevents loud-voice anchoring.</div>
            </div>
            <div className="field">
              <label className="checkrow">
                <input type="checkbox" checked={prework} onChange={(e) => setPrework(e.target.checked)} />
                Collect as pre-work — members contribute before the session
              </label>
              <div className="form-note">Open the session for pre-work and members add ideas independently ahead of time. Pre-work cards stay private until the live reveal, so the room opens with input already in.</div>
            </div>
          </>
        ) : null}
        {activity === "checkin" ? (
          <div className="field">
            <label className="checkrow">
              <input type="checkbox" checked={capture} onChange={(e) => setCapture(e.target.checked)} />
              Collect written responses
            </label>
            <div className="form-note">On: participants type a response (shown as cards you can edit, vote on and turn into tasks). Off: a reflect-and-ready round with no typing.</div>
          </div>
        ) : null}
        <div className="field">
          <label className="checkrow">
            <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
            Auto-advance when the timer ends
          </label>
          <div className="form-note">When the clock hits 0:00, the session moves to the next step automatically.</div>
        </div>
        <div className="field">
          <label>Facilitator prompt <span className="opt">(optional)</span></label>
          <textarea className="inp" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="The question you'll read aloud…" />
        </div>
        <div className="two">
          <div className="field">
            <label>Phase</label>
            <select className="inp" value={phase} onChange={(e) => setPhase(e.target.value as PhaseKey | "")}>
              <option value="">Auto · {PHASE_LABEL[phaseKey(activity)]}</option>
              {PHASES.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Owner <span className="opt">(optional)</span></label>
            <input className="inp" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who runs this?" />
          </div>
        </div>
        <div className="form-note" style={{ marginTop: -8 }}>Phase sets the board column; “Auto” follows the activity type. Owner shows on the agenda and run cockpit.</div>
        <div className="field">
          <label>Link to a team dynamic <span className="opt">(optional)</span></label>
          <select className="inp" value={dyn} onChange={(e) => setDyn(e.target.value as Dyn)}>
            {DYN.map((d) => (
              <option key={d[0]} value={d[0]}>{d[1]}</option>
            ))}
          </select>
          <div className="form-note">Linking shows a “Grounded” chip tying the step to the pulse.</div>
        </div>
        <div className="field">
          <label>Participant preview</label>
          <div className="prevstage">
            <div className="prev-act">{ACTIVITY[activity]?.label ?? activity} step</div>
            <h3>{title || "Untitled step"}</h3>
            {prompt ? <div className="prev-prompt">{prompt}</div> : null}
            <div className="prev-hint">{previewHint()}</div>
            {modulePreview()}
          </div>
        </div>
      </SideWindow>

      {/* rename */}
      <SideWindow
        open={titleOpen}
        onClose={() => setTitleOpen(false)}
        title="Rename workshop"
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setTitleOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={!wsTitle} onClick={saveTitle}>Save</button>
            </div>
          </>
        }
      >
        <div className="field">
          <label>Workshop title</label>
          <input className="inp" value={wsTitle} onChange={(e) => setWsTitle(e.target.value)} />
        </div>
      </SideWindow>

      {/* schedule */}
      <SideWindow
        open={schedOpen}
        onClose={() => setSchedOpen(false)}
        title="Schedule session"
        subtitle={workshop.title}
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setSchedOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={!schedAt} onClick={saveSchedule}>Schedule &amp; notify</button>
            </div>
          </>
        }
      >
        <div className="field">
          <label>Date &amp; time</label>
          <input className="inp" type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} />
          <div className="form-note">Everyone on {teamName} gets an in-app heads-up.</div>
        </div>
      </SideWindow>

      {/* attach assessment */}
      {asPanel ? (
        <SideWindow
          open={!!asBlockId}
          onClose={() => setAsBlockId(null)}
          title="Attach an assessment"
          subtitle={asPanel.kindName}
          size="compact"
          footer={
            <>
              <button className="btn-sec" onClick={() => setAsBlockId(null)}>Cancel</button>
              <div className="right">
                <button className="btn-prim" disabled={pending || !pickSurvey} onClick={() => attachSurvey(asPanel.blockId)}>Attach selected</button>
              </div>
            </>
          }
        >
          {asPanel.candidates.length ? (
            <div className="field">
              <label>Open {asPanel.kindName} assessments for {teamName}</label>
              {asPanel.candidates.map((c) => (
                <label className="pickrow" key={c.id}>
                  <input type="radio" name="cand" checked={pickSurvey === c.id} onChange={() => setPickSurvey(c.id)} />
                  <span>
                    <b>{c.name}</b>
                    <span className="src"> {c.responded}/{c.total} responded{c.dueAt ? ` · due ${new Date(c.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="form-note">No open assessments of this type yet — send one below.</div>
          )}
          <div className="field" style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
            <label>…or send a new one <span className="opt">(optional due date)</span></label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="inp" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
              <button className="btn-sec" disabled={pending} onClick={() => sendAndAttach(asPanel)}>Send &amp; attach</button>
            </div>
            <div className="form-note">Sends the assessment to {teamName} and pins it to this step.</div>
          </div>
        </SideWindow>
      ) : null}

      {/* objectives */}
      <SideWindow
        open={objOpen}
        onClose={() => setObjOpen(false)}
        title="Session objectives"
        subtitle={workshop.title}
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setObjOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={pending} onClick={saveObjectives}>Save</button>
            </div>
          </>
        }
      >
        <div className="field">
          <label>What must be true when this session ends?</label>
          <div className="objedit">
            {objDraft.map((o, i) => (
              <div className="objedit-row" key={i}>
                <span className="objedit-n">{i + 1}</span>
                <input
                  className="inp"
                  value={o}
                  onChange={(e) => setObjAt(i, e.target.value)}
                  placeholder={i === 0 ? "e.g. Decide Q2 scope and name owners" : "Another objective…"}
                />
                <button type="button" className="icon-btn danger" title="Remove" onClick={() => removeObjRow(i)}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="addlink" style={{ marginTop: 8 }} onClick={addObjRow}>+ Add objective</button>
          <div className="form-note">At least one clear objective is required before a decision-making session can close. The first is the headline.</div>
        </div>
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
