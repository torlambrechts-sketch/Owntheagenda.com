"use client";

import type { StepView } from "./WorkflowClient";
import { dynLabel, opLabel } from "./dynamics";

// Read-only visualisation of a flow's steps as a vertical node map — the same
// `.flowmap` language as the detail page, rendered inline (e.g. in a side window)
// straight from the steps we already hold on the list.

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
function kindOf(k: string) { return KIND[k] ?? { label: k, tone: "var(--muted)" }; }
function stepPill(s: string) {
  return s === "active" ? { l: "Active", c: "open" }
    : s === "done" ? { l: "Done", c: "internal" }
      : s === "skipped" ? { l: "Skipped", c: "draft" }
        : { l: "Pending", c: "draft" };
}

export function FlowMiniMap({ steps, templateName }: { steps: StepView[]; templateName: (id: string) => string }) {
  if (!steps.length) return <div className="a-note">This flow has no steps yet.</div>;
  return (
    <div className="flowmap">
      {steps.map((s, i) => {
        const k = kindOf(s.kind); const p = stepPill(s.status);
        const c = (s.config ?? {}) as Record<string, unknown>;
        const isBranch = s.kind === "branch" && (c.dynamic != null || c.then_template != null);
        const thenName = typeof c.then_template === "string" ? templateName(c.then_template) : "a workshop";
        const elseName = typeof c.else_template === "string" ? templateName(c.else_template) : "a workshop";
        return (
          <div key={s.id}>
            <div className="flowmap-node" style={{ borderColor: k.tone }}>
              <span className="flowmap-chip" style={{ background: k.tone }}>{k.label}</span>
              <span className="flowmap-t">{s.title}</span>
              <span className={`pill sm ${p.c}`}>{p.l}</span>
            </div>
            {isBranch ? (
              <div className="flowmap-routes">
                <div className="flowmap-route"><span className="flowmap-cond" style={{ color: "var(--rust)" }}>if {dynLabel(c.dynamic as string)} {opLabel(c.op as string)} {(c.value as number) ?? "—"}</span> → {thenName}</div>
                <div className="flowmap-route"><span className="flowmap-cond" style={{ color: "var(--green)" }}>otherwise</span> → {elseName}</div>
              </div>
            ) : null}
            {i < steps.length - 1 ? <div className="flowmap-arrow" aria-hidden>↓</div> : null}
          </div>
        );
      })}
      <div className="flowmap-end" aria-hidden>End</div>
    </div>
  );
}
