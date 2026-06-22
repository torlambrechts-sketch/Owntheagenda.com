"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createFlowSteps,
  startPlay,
  remindNonResponders,
  setProgramStep,
  startAssessment,
  buildWorkshop,
  scheduleRepulse,
  syncProgram,
  addStep,
  removeStep,
  moveStep,
  setBranch,
  setFlowTask,
  toggleActionItem,
  assignFlowTask,
} from "./actions";
import { ReadinessGate } from "./ReadinessGate";
import { Plays } from "./Plays";
import { FlowBuilder } from "./FlowBuilder";
import { FlowComposer, type ComposerStep } from "./FlowComposer";
import { FlowsTable } from "./FlowsTable";
import { FlowMiniMap } from "./FlowMiniMap";
import { SideWindow } from "@/components/SideWindow";

export type StepView = {
  id: string;
  ord: number;
  kind: string;
  title: string;
  status: string;
  gate: string | null;
  config: Record<string, unknown>;
  scheduledAt: string | null;
  completedAt: string | null;
  live: string | null;
  ready: boolean;
  done: number | null;
  target: number | null;
};
export type ProgramView = {
  id: string;
  title: string;
  status: string;
  currentOrd: number;
  teamId: string | null;
  kind: string;
  playKey: string | null;
  minResponses: number;
  assessmentKind: string | null;
  dueAt: string | null;
  steps: StepView[];
  tasks: TaskView[];
};
export type TaskView = {
  id: string;
  kind: string;
  title: string;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: string | null;
  status: string;
  source: "flow" | "action";
};
export type Member = { id: string; name: string };
export type Template = { id: string; name: string; key: string | null; category: string };
export type Instrument = { key: string; name: string };
type Named = { id: string; name: string };

const STEP_LINK: Record<string, { href: string; label: string }> = {
  assessment: { href: "/assessments", label: "Open assessments" },
  launch: { href: "/insight/leadership-teams", label: "Track responses" },
  interpret: { href: "/insight/leadership-teams", label: "View results" },
  workshop: { href: "/workshops", label: "Open workshops" },
  commit: { href: "/actions", label: "Open actions" },
  repulse: { href: "/insight/leadership-teams", label: "Re-pulse" },
};

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function WorkflowClient({
  workspaceId,
  canManage,
  programs,
  teams,
  templates,
  assessments,
  members,
}: {
  workspaceId: string;
  canManage: boolean;
  programs: ProgramView[];
  teams: Named[];
  templates: Template[];
  assessments: Instrument[];
  members: Member[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  // per-program transient inputs + builder toggle
  const [tmplFor, setTmplFor] = useState<Record<string, string>>({});
  const [dateFor, setDateFor] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [viewFlow, setViewFlow] = useState<ProgramView | null>(null);
  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "a workshop";

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }
  function run(fn: () => Promise<{ error?: string }>, ok?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) flash(res.error);
      else {
        ok?.();
        router.refresh();
      }
    });
  }

  function createComposed(
    title: string,
    teamId: string | null,
    minResponses: number,
    steps: ComposerStep[],
    assessmentKind: string | null,
    collectDays: number,
    anonymity: string,
  ) {
    run(
      () => createFlowSteps(workspaceId, title, teamId, minResponses, steps, assessmentKind, collectDays, anonymity),
      () => flash("Flow created"),
    );
  }
  const instrumentName = (k: string | null) => (k ? assessments.find((a) => a.key === k)?.name ?? k : null);

  // Render a single flow's run surface (stage cards + inline builder) for the
  // expanded table row. Keeps all the contextual run actions in one place.
  function renderStages(p: ProgramView): ReactNode {
    const hasTeam = !!p.teamId;
    const isFlow = p.kind === "flow";
    const isEditing = !!editing[p.id];
    return (
      <div className="wfx-run">
        <div className="wfx-run-h">
          {isFlow ? (
            <button
              className="btn-sec sm"
              disabled={pending}
              onClick={() => setEditing((m) => ({ ...m, [p.id]: !m[p.id] }))}
            >
              {isEditing ? "Done editing" : "Edit steps"}
            </button>
          ) : null}
          <button className="btn-sec sm" disabled={pending} onClick={() => run(() => syncProgram(p.id))}>
            Refresh status
          </button>
          {!hasTeam ? <span className="wfx-prog-note">Link a team to start a pulse and build a workshop.</span> : null}
        </div>

        {isEditing ? (
          <FlowBuilder
            program={p}
            templates={templates}
            pending={pending}
            onAdd={(afterOrd, kind, t) => run(() => addStep(p.id, afterOrd, kind, t))}
            onRemove={(sid) => run(() => removeStep(sid))}
            onMove={(sid, dir) => run(() => moveStep(sid, dir))}
            onBranch={(sid, d, o, v, tt, et) => run(() => setBranch(sid, d, o, v, tt, et))}
          />
        ) : (
          <div className="wfx-steps flow">
            {p.steps.map((s) => {
              const link = STEP_LINK[s.kind];
              const isActive = s.status === "active";
              const showGate = isActive && s.kind === "launch" && s.done != null && s.target != null;
              return (
                <div className={`wfx-step ${s.status}`} key={s.id}>
                  <div className="wfx-step-top">
                    <span className="wfx-num">{s.ord}</span>
                    <span className={`wfx-tag ${s.status}`}>
                      {s.status === "done"
                        ? "Done"
                        : s.status === "active"
                          ? "In progress"
                          : s.status === "skipped"
                            ? "Skipped"
                            : "Pending"}
                    </span>
                  </div>
                  <h4>{s.title}</h4>

                  {showGate ? (
                    <ReadinessGate
                      done={s.done ?? 0}
                      target={s.target ?? 3}
                      ready={s.ready}
                      canManage={canManage}
                      pending={pending}
                      onRemind={() =>
                        run(
                          () =>
                            remindNonResponders(p.id).then((r) => {
                              if (!("error" in r)) flash(`Reminded ${r.count} ${r.count === 1 ? "person" : "people"}`);
                              return r;
                            }) as Promise<{ error?: string }>,
                        )
                      }
                      onStartNow={() => run(() => setProgramStep(s.id, "done"))}
                    />
                  ) : s.live ? (
                    <p className={`wfx-live${s.ready ? " ready" : ""}`}>
                      {s.live}
                      {s.ready ? " · ready" : ""}
                    </p>
                  ) : s.gate ? (
                    <p className="wfx-gate">{s.gate}</p>
                  ) : (
                    <p className="wfx-gate" />
                  )}

                  {canManage && isActive && s.kind === "assessment" ? (
                    <div className="wfx-spawn">
                      {instrumentName(p.assessmentKind) ? (
                        <span className="wfx-instr">{instrumentName(p.assessmentKind)}</span>
                      ) : (
                        <span className="wfx-instr muted">Team pulse</span>
                      )}
                      <button
                        className="btn-prim sm"
                        disabled={pending || !hasTeam}
                        onClick={() => run(() => startAssessment(p.id))}
                      >
                        Start assessment
                      </button>
                    </div>
                  ) : null}
                  {canManage && isActive && s.kind === "workshop" ? (
                    <div className="wfx-spawn">
                      <select
                        className="inp sm"
                        value={tmplFor[p.id] ?? ""}
                        onChange={(e) => setTmplFor((m) => ({ ...m, [p.id]: e.target.value }))}
                      >
                        <option value="">Choose template…</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        className="btn-prim sm"
                        disabled={pending || !tmplFor[p.id]}
                        onClick={() => run(() => buildWorkshop(p.id, tmplFor[p.id]))}
                      >
                        Build workshop
                      </button>
                    </div>
                  ) : null}
                  {canManage && isActive && s.kind === "repulse" && !s.live ? (
                    <div className="wfx-spawn">
                      <input
                        className="inp sm"
                        type="date"
                        value={dateFor[p.id] ?? plusDays(30)}
                        onChange={(e) => setDateFor((m) => ({ ...m, [p.id]: e.target.value }))}
                      />
                      <button
                        className="btn-prim sm"
                        disabled={pending}
                        onClick={() => run(() => scheduleRepulse(p.id, dateFor[p.id] ?? plusDays(30)))}
                      >
                        Schedule re-pulse
                      </button>
                    </div>
                  ) : null}

                  <div className="wfx-acts">
                    {link ? (
                      <Link className="linkbtn xs" href={link.href}>
                        {link.label} →
                      </Link>
                    ) : null}
                  </div>

                  {canManage ? (
                    <div className="wfx-manage">
                      {s.status !== "done" ? (
                        <button className="linkbtn xs" disabled={pending} onClick={() => run(() => setProgramStep(s.id, "done"))}>
                          Mark done
                        </button>
                      ) : (
                        <button className="linkbtn xs" disabled={pending} onClick={() => run(() => setProgramStep(s.id, "active"))}>
                          Reopen
                        </button>
                      )}
                      {s.status === "pending" ? (
                        <button className="linkbtn xs" disabled={pending} onClick={() => run(() => setProgramStep(s.id, "active"))}>
                          Start
                        </button>
                      ) : s.status !== "done" && s.status !== "skipped" ? (
                        <button className="linkbtn xs" disabled={pending} onClick={() => run(() => setProgramStep(s.id, "skipped"))}>
                          Skip
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Summary KPIs over the real flows (no dummy data).
  const flowTotal = programs.length;
  const flowActive = programs.filter((p) => p.status === "active").length;
  const flowDone = programs.filter((p) => p.status === "completed").length;
  const flowDrafts = programs.filter((p) => p.status === "draft").length;
  const openTasks = programs.reduce(
    (n, p) => n + p.tasks.filter((t) => t.status !== "done" && t.status !== "skipped").length,
    0,
  );
  const completionRate = flowTotal ? Math.round((flowDone / flowTotal) * 100) : 0;
  const flowKpis = [
    { big: String(flowActive), title: "Active flows", sub: `${flowDrafts} draft${flowDrafts === 1 ? "" : "s"} · ${flowTotal} total` },
    { big: String(flowDone), title: "Completed", sub: `of ${flowTotal} flow${flowTotal === 1 ? "" : "s"}` },
    { big: String(openTasks), title: "Open tasks", sub: "across all flows" },
    { big: `${completionRate}%`, title: "Completion rate", sub: "completed of all" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Flows</h1>
          <p className="page-sub">
            Run an assessment, wait for responses, then run the workshop on the
            results — as one tracked Flow. Build one below (use the full
            operating loop preset for commitments and re-measurement), or
            launch a Play to start in one click.
          </p>
        </div>
      </div>

      {programs.length ? (
        <div className="wf-kpis">
          {flowKpis.map((k) => (
            <div className="wf-kpi" key={k.title}>
              <div className="wf-kpi-big">{k.big}</div>
              <div className="wf-kpi-t">{k.title}</div>
              <div className="wf-kpi-s">{k.sub}</div>
            </div>
          ))}
        </div>
      ) : null}

      {canManage ? (
        <Plays
          teams={teams}
          pending={pending}
          onLaunch={(pk, name, tk, n, ak, tid) => run(() => startPlay(workspaceId, tid, pk, name, tk, n, ak))}
        />
      ) : null}

      {canManage ? (
        <FlowComposer
          teams={teams}
          assessments={assessments}
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          pending={pending}
          onCreate={createComposed}
        />
      ) : null}

      {programs.length === 0 ? (
        <div className="empty">
          No flows yet.{" "}
          {canManage ? "Build one above — or launch a Play — to tie an assessment and workshop together." : "An admin can start one."}
        </div>
      ) : (
        <FlowsTable
          programs={programs}
          teams={teams}
          members={members}
          canManage={canManage}
          pending={pending}
          onToggleTask={(t, status) =>
            run(() => (t.source === "action" ? toggleActionItem(t.id) : setFlowTask(t.id, status)))
          }
          onAssignTask={(taskId, ownerId, ownerName) => run(() => assignFlowTask(taskId, ownerId, ownerName))}
          onView={setViewFlow}
          renderExpanded={renderStages}
        />
      )}

      <SideWindow
        open={!!viewFlow}
        onClose={() => setViewFlow(null)}
        title={viewFlow?.title ?? "Flow"}
        subtitle="Flow visualization"
        size="wide"
        footer={viewFlow ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn-sec" href={`/workflow/${viewFlow.id}`}>Flow detail</Link>
            {canManage ? <Link className="btn-prim" href={`/flow/${viewFlow.id}`}>Open builder →</Link> : null}
          </div>
        ) : null}
      >
        {viewFlow ? <FlowMiniMap steps={viewFlow.steps} templateName={templateName} /> : null}
      </SideWindow>

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
