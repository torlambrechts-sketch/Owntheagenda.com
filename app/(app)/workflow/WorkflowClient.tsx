"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createProgram,
  createFlow,
  startPlay,
  remindNonResponders,
  setProgramStep,
  startPulse,
  buildWorkshop,
  scheduleRepulse,
  syncProgram,
  addStep,
  removeStep,
  moveStep,
  setBranch,
} from "./actions";
import { ReadinessGate } from "./ReadinessGate";
import { Plays } from "./Plays";
import { FlowBuilder } from "./FlowBuilder";

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
  steps: StepView[];
};
export type Template = { id: string; name: string; key: string | null; category: string };
type Named = { id: string; name: string };

const STEP_LINK: Record<string, { href: string; label: string }> = {
  assessment: { href: "/assessments", label: "Open assessments" },
  launch: { href: "/insight/leadership-teams", label: "Track responses" },
  interpret: { href: "/insight/leadership-teams", label: "View results" },
  workshop: { href: "/workshops", label: "Open workshops" },
  commit: { href: "/actions", label: "Open actions" },
  repulse: { href: "/insight/leadership-teams", label: "Re-pulse" },
};
const STATUS_PILL: Record<string, string> = { active: "open", completed: "open", archived: "draft" };

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
}: {
  workspaceId: string;
  canManage: boolean;
  programs: ProgramView[];
  teams: Named[];
  templates: Template[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createMode, setCreateMode] = useState<null | "flow" | "program">(null);
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [minResp, setMinResp] = useState(4);
  const [toast, setToast] = useState<string | null>(null);
  // per-program transient inputs + builder toggle
  const [tmplFor, setTmplFor] = useState<Record<string, string>>({});
  const [dateFor, setDateFor] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});

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

  function create() {
    const t = title.trim();
    if (!t || !createMode) return;
    const fn =
      createMode === "flow"
        ? () => createFlow(workspaceId, t, teamId || null, minResp)
        : () => createProgram(workspaceId, t, teamId || null);
    run(fn, () => {
      setTitle("");
      setCreateMode(null);
    });
  }

  const workshopTemplates = templates; // any template can be a workshop block-set

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Flows</h1>
          <p className="page-sub">
            Run an assessment, wait for responses, then run the workshop on the
            results — as one tracked Flow. Each stage advances on its own as the
            response threshold and the workshop complete. Need the full loop
            (commitments and re-measurement)? Start a Program instead.
          </p>
        </div>
        {canManage ? (
          <div className="page-head-acts">
            <button className="btn-prim" onClick={() => setCreateMode((v) => (v === "flow" ? null : "flow"))}>
              {createMode === "flow" ? "Cancel" : "New flow"}
            </button>
            <button className="btn-sec" onClick={() => setCreateMode((v) => (v === "program" ? null : "program"))}>
              {createMode === "program" ? "Cancel" : "New program"}
            </button>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <Plays
          teams={teams}
          pending={pending}
          onLaunch={(pk, name, tk, n, tid) => run(() => startPlay(workspaceId, tid, pk, name, tk, n))}
        />
      ) : null}

      {createMode ? (
        <div className="wfx-create">
          <input
            className="inp"
            autoFocus
            placeholder={
              createMode === "flow"
                ? "Flow name — e.g. Q3 psychological safety check"
                : "Program name — e.g. Leadership effectiveness loop"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <select className="inp" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {createMode === "flow" ? (
            <label className="wfx-thr">
              Wait for
              <input
                className="inp sm"
                type="number"
                min={3}
                max={50}
                value={minResp}
                onChange={(e) => setMinResp(Math.max(3, Number(e.target.value) || 3))}
              />
              responses
            </label>
          ) : null}
          <button className="btn-prim" disabled={pending || !title.trim()} onClick={create}>
            {createMode === "flow" ? "Create flow" : "Create program"}
          </button>
        </div>
      ) : null}

      {programs.length === 0 ? (
        <div className="empty">
          No flows yet.{" "}
          {canManage ? "Start a Flow — or launch a Play above — to tie an assessment and workshop together." : "An admin can start one."}
        </div>
      ) : (
        programs.map((p) => {
          const hasTeam = !!p.teamId;
          const isFlow = p.kind === "flow";
          const isEditing = !!editing[p.id];
          return (
            <div className="wfx-prog" key={p.id}>
              <div className="wfx-prog-h">
                <h3>{p.title}</h3>
                <span className={`pill sm ${isFlow ? "internal" : "interview"}`}>{p.playKey ? "Play" : isFlow ? "Flow" : "Program"}</span>
                <span className={`pill sm ${STATUS_PILL[p.status] ?? "draft"}`}>
                  {p.status === "completed" ? "Completed" : p.status === "archived" ? "Archived" : "Active"}
                </span>
                <span className="wfx-prog-meta">
                  Stage {Math.min(p.currentOrd, p.steps.length)} of {p.steps.length}
                </span>
                {canManage ? (
                  <>
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
                  </>
                ) : null}
              </div>

              {isEditing ? (
                <div className="wfx-builder">
                  <FlowBuilder
                    program={p}
                    templates={workshopTemplates}
                    pending={pending}
                    onAdd={(afterOrd, kind, t) => run(() => addStep(p.id, afterOrd, kind, t))}
                    onRemove={(sid) => run(() => removeStep(sid))}
                    onMove={(sid, dir) => run(() => moveStep(sid, dir))}
                    onBranch={(sid, d, o, v, tt, et) => run(() => setBranch(sid, d, o, v, tt, et))}
                  />
                </div>
              ) : (
                <div className={`wfx-steps${isFlow ? " flow" : ""}`}>
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

                        {/* contextual spawn actions on the active step */}
                        {canManage && isActive && s.kind === "assessment" ? (
                          <button
                            className="btn-prim sm"
                            disabled={pending || !hasTeam}
                            onClick={() => run(() => startPulse(p.id))}
                          >
                            Start pulse
                          </button>
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
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
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
              {canManage && !hasTeam ? (
                <div className="wfx-prog-note">Link this to a team to start a pulse and build a workshop.</div>
              ) : null}
            </div>
          );
        })
      )}

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
