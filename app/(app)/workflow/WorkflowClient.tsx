"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createProgram,
  setProgramStep,
  startPulse,
  buildWorkshop,
  scheduleRepulse,
  syncProgram,
} from "./actions";

export type StepView = {
  id: string;
  ord: number;
  kind: string;
  title: string;
  status: string;
  gate: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  live: string | null;
  ready: boolean;
};
export type ProgramView = {
  id: string;
  title: string;
  status: string;
  currentOrd: number;
  teamId: string | null;
  steps: StepView[];
};
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
  templates: Named[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [toast, setToast] = useState<string | null>(null);
  // per-program transient inputs for the workshop template + re-pulse date pickers
  const [tmplFor, setTmplFor] = useState<Record<string, string>>({});
  const [dateFor, setDateFor] = useState<Record<string, string>>({});

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
    if (!t) return;
    run(
      () => createProgram(workspaceId, t, teamId || null),
      () => {
        setTitle("");
        setCreating(false);
      },
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Workflow</h1>
          <p className="page-sub">
            One operating loop from assessment through workshop, commitments and
            re-measurement. Start the pulse, build the workshop and schedule the
            re-pulse — each stage advances on its own as the response threshold,
            the workshop and the re-pulse complete.
          </p>
        </div>
        {canManage ? (
          <button className="btn-prim" onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New program"}
          </button>
        ) : null}
      </div>

      {creating ? (
        <div className="wfx-create">
          <input
            className="inp"
            autoFocus
            placeholder="Program name — e.g. Leadership psychological safety loop"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <select className="inp" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button className="btn-prim" disabled={pending || !title.trim()} onClick={create}>
            Create program
          </button>
        </div>
      ) : null}

      {programs.length === 0 ? (
        <div className="empty">
          No programs yet.{" "}
          {canManage ? "Start one to tie an assessment and workshop into a tracked loop." : "An admin can start one."}
        </div>
      ) : (
        programs.map((p) => {
          const hasTeam = !!p.teamId;
          return (
            <div className="wfx-prog" key={p.id}>
              <div className="wfx-prog-h">
                <h3>{p.title}</h3>
                <span className={`pill sm ${STATUS_PILL[p.status] ?? "draft"}`}>
                  {p.status === "completed" ? "Completed" : p.status === "archived" ? "Archived" : "Active"}
                </span>
                <span className="wfx-prog-meta">
                  Stage {Math.min(p.currentOrd, p.steps.length)} of {p.steps.length}
                </span>
                {canManage ? (
                  <button className="btn-sec sm" disabled={pending} onClick={() => run(() => syncProgram(p.id))}>
                    Refresh status
                  </button>
                ) : null}
              </div>
              <div className="wfx-steps">
                {p.steps.map((s) => {
                  const link = STEP_LINK[s.kind];
                  const isActive = s.status === "active";
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
                      {s.live ? (
                        <p className={`wfx-live${s.ready ? " ready" : ""}`}>{s.live}{s.ready ? " · ready" : ""}</p>
                      ) : s.gate ? (
                        <p className="wfx-gate">{s.gate}</p>
                      ) : (
                        <p className="wfx-gate" />
                      )}

                      {/* contextual spawn actions on the active step */}
                      {canManage && isActive && s.kind === "assessment" ? (
                        <button className="btn-prim sm" disabled={pending || !hasTeam} onClick={() => run(() => startPulse(p.id))}>
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
              {canManage && !hasTeam ? (
                <div className="wfx-prog-note">Link this program to a team to start a pulse and build a workshop.</div>
              ) : null}
            </div>
          );
        })
      )}

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
