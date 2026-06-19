"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProgram, setProgramStep } from "./actions";

export type StepView = {
  id: string;
  ord: number;
  kind: string;
  title: string;
  status: string;
  gate: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
};
export type ProgramView = {
  id: string;
  title: string;
  status: string;
  currentOrd: number;
  steps: StepView[];
};

// Where each stage hands off to in the rest of the product.
const STEP_LINK: Record<string, { href: string; label: string }> = {
  assessment: { href: "/assessments", label: "Open assessments" },
  launch: { href: "/assessments", label: "Track responses" },
  interpret: { href: "/assessments", label: "View results" },
  workshop: { href: "/workshops", label: "Open workshops" },
  commit: { href: "/actions", label: "Open actions" },
  repulse: { href: "/assessments", label: "Re-pulse" },
};
const STATUS_PILL: Record<string, string> = {
  active: "open",
  completed: "open",
  archived: "draft",
};

export function WorkflowClient({
  workspaceId,
  canManage,
  programs,
}: {
  workspaceId: string;
  canManage: boolean;
  programs: ProgramView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function create() {
    const t = title.trim();
    if (!t) return;
    startTransition(async () => {
      const res = await createProgram(workspaceId, t);
      if (res.error) flash(res.error);
      else {
        setTitle("");
        setCreating(false);
        router.refresh();
      }
    });
  }

  function step(stepId: string, status: string) {
    startTransition(async () => {
      const res = await setProgramStep(stepId, status);
      if (res.error) flash(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Workflow</h1>
          <p className="page-sub">
            One operating loop from assessment through workshop, commitments and
            re-measurement. Each stage hands off to the builder it belongs to.
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
        programs.map((p) => (
          <div className="wfx-prog" key={p.id}>
            <div className="wfx-prog-h">
              <h3>{p.title}</h3>
              <span className={`pill sm ${STATUS_PILL[p.status] ?? "draft"}`}>
                {p.status === "completed" ? "Completed" : p.status === "archived" ? "Archived" : "Active"}
              </span>
              <span className="wfx-prog-meta">
                Stage {Math.min(p.currentOrd, p.steps.length)} of {p.steps.length}
              </span>
            </div>
            <div className="wfx-steps">
              {p.steps.map((s) => {
                const link = STEP_LINK[s.kind];
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
                    {s.gate ? <p className="wfx-gate">{s.gate}</p> : <p className="wfx-gate" />}
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
                          <button className="btn-sec sm" disabled={pending} onClick={() => step(s.id, "done")}>
                            Mark done
                          </button>
                        ) : (
                          <button className="btn-sec sm" disabled={pending} onClick={() => step(s.id, "active")}>
                            Reopen
                          </button>
                        )}
                        {s.status === "pending" ? (
                          <button className="linkbtn xs" disabled={pending} onClick={() => step(s.id, "active")}>
                            Start
                          </button>
                        ) : s.status !== "done" && s.status !== "skipped" ? (
                          <button className="linkbtn xs" disabled={pending} onClick={() => step(s.id, "skipped")}>
                            Skip
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
