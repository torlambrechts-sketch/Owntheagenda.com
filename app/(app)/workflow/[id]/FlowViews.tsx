"use client";

import { useState } from "react";
import { SideWindow } from "@/components/SideWindow";

export type FlowStep = {
  id: string;
  ord: number;
  kind: string;
  title: string;
  status: string;
  gate: string | null;
  branch: {
    dynamic: string | null;
    op: string | null;
    value: number | null;
    thenName: string | null;
    elseName: string | null;
  } | null;
};

type View = "outline" | "timeline" | "table" | "map";

const KIND: Record<string, { label: string; tone: string }> = {
  assessment: { label: "Assessment", tone: "var(--role)" },
  launch: { label: "Collect", tone: "var(--amber)" },
  interpret: { label: "Interpret", tone: "var(--muted)" },
  workshop: { label: "Workshop", tone: "var(--green)" },
  commit: { label: "Commit", tone: "var(--green)" },
  repulse: { label: "Re-pulse", tone: "var(--role)" },
  branch: { label: "Branch", tone: "var(--rust)" },
  custom: { label: "Custom", tone: "var(--muted)" },
};
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
    case "workshop": return "Run the workshop session.";
    case "commit": return "Capture the measures the team agreed.";
    case "repulse": return "Re-measure after a while to see movement.";
    default: return s.gate || "—";
  }
}

export function FlowViews({
  title,
  status,
  teamName,
  steps,
}: {
  title: string;
  status: string;
  teamName: string | null;
  steps: FlowStep[];
}) {
  const [view, setView] = useState<View>("outline");
  const [preview, setPreview] = useState(false);

  const statusPill = status === "active" ? { l: "Active", c: "open" }
    : status === "completed" ? { l: "Completed", c: "internal" }
      : { l: "Archived", c: "draft" };

  const connectsTo = (i: number) => {
    const s = steps[i];
    if (s.branch) return `${s.branch.thenName ?? "a workshop"} / ${s.branch.elseName ?? "a workshop"}`;
    const next = steps[i + 1];
    return next ? next.title : "End";
  };

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
          <div className="flowmap">
            {steps.map((s, i) => {
              const k = kindOf(s.kind); const p = stepPill(s.status);
              return (
                <div key={s.id}>
                  <div className="flowmap-node" style={{ borderColor: k.tone }}>
                    <span className="flowmap-chip" style={{ background: k.tone }}>{k.label}</span>
                    <span className="flowmap-t">{s.title}</span>
                    <span className={`pill sm ${p.c}`}>{p.l}</span>
                  </div>
                  {s.branch ? (
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
