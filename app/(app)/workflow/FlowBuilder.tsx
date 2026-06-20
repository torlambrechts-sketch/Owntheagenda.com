"use client";

import { useState } from "react";
import type { ProgramView, StepView, Template } from "./WorkflowClient";

// The visual node editor for a Flow: add / remove / reorder steps and
// configure a branch node that routes to one of two workshop templates based
// on a pulse dynamic. Backed by the program_add_step / _remove_step /
// _move_step / _set_branch RPCs.

const DYNAMICS: { value: string; label: string }[] = [
  { value: "psych_safety", label: "Psychological safety" },
  { value: "trust", label: "Trust" },
  { value: "conflict_norms", label: "Conflict norms" },
  { value: "role_clarity", label: "Role clarity" },
  { value: "decision_rights", label: "Decision rights" },
];
const ADDABLE: { value: string; label: string }[] = [
  { value: "workshop", label: "Workshop" },
  { value: "branch", label: "Branch (route by result)" },
  { value: "custom", label: "Custom step" },
];
const dynLabel = (v?: string) => DYNAMICS.find((d) => d.value === v)?.label ?? v ?? "—";

function BranchConfig({
  step,
  templates,
  pending,
  onSave,
}: {
  step: StepView;
  templates: Template[];
  pending: boolean;
  onSave: (dynamic: string, op: string, value: number, thenT: string, elseT: string) => void;
}) {
  const cfg = step.config ?? {};
  const workshops = templates;
  const [dynamic, setDynamic] = useState((cfg.dynamic as string) ?? "psych_safety");
  const [op, setOp] = useState((cfg.op as string) ?? "lt");
  const [value, setValue] = useState(String((cfg.value as number) ?? 3));
  const [thenT, setThenT] = useState((cfg.then_template as string) ?? workshops[0]?.id ?? "");
  const [elseT, setElseT] = useState((cfg.else_template as string) ?? workshops[0]?.id ?? "");
  const [editing, setEditing] = useState(!cfg.then_template);

  if (!editing) {
    return (
      <div className="fb-branch">
        <p className="fb-cond">
          If <b>{dynLabel(cfg.dynamic as string)}</b> {cfg.op === "lt" ? "<" : "≥"} {String(cfg.value)} →{" "}
          {templates.find((t) => t.id === cfg.then_template)?.name ?? "—"}, else{" "}
          {templates.find((t) => t.id === cfg.else_template)?.name ?? "—"}
        </p>
        <button className="linkbtn xs" onClick={() => setEditing(true)}>
          Edit condition
        </button>
      </div>
    );
  }

  return (
    <div className="fb-branch">
      <div className="fb-cond-row">
        <span>If</span>
        <select className="inp sm" value={dynamic} onChange={(e) => setDynamic(e.target.value)}>
          {DYNAMICS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select className="inp sm" value={op} onChange={(e) => setOp(e.target.value)}>
          <option value="lt">is below</option>
          <option value="gte">is at or above</option>
        </select>
        <input
          className="inp sm fb-val"
          type="number"
          min={1}
          max={5}
          step={0.5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <label className="fb-pick">
        Then run
        <select className="inp sm" value={thenT} onChange={(e) => setThenT(e.target.value)}>
          {workshops.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fb-pick">
        Otherwise
        <select className="inp sm" value={elseT} onChange={(e) => setElseT(e.target.value)}>
          {workshops.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn-prim sm"
        disabled={pending || !thenT || !elseT}
        onClick={() => {
          onSave(dynamic, op, Number(value), thenT, elseT);
          setEditing(false);
        }}
      >
        Save condition
      </button>
    </div>
  );
}

export function FlowBuilder({
  program,
  templates,
  pending,
  onAdd,
  onRemove,
  onMove,
  onBranch,
}: {
  program: ProgramView;
  templates: Template[];
  pending: boolean;
  onAdd: (afterOrd: number, kind: string, title: string) => void;
  onRemove: (stepId: string) => void;
  onMove: (stepId: string, dir: number) => void;
  onBranch: (stepId: string, dynamic: string, op: string, value: number, thenT: string, elseT: string) => void;
}) {
  const [addKind, setAddKind] = useState("workshop");
  const steps = [...program.steps].sort((a, b) => a.ord - b.ord);
  const lastOrd = steps.length ? steps[steps.length - 1].ord : 0;

  return (
    <div className="fb">
      <div className="fb-list">
        {steps.map((s, i) => (
          <div className={`fb-node ${s.status}`} key={s.id}>
            <div className="fb-node-h">
              <span className="fb-kind">{s.kind}</span>
              <strong className="fb-title">{s.title}</strong>
              <span className={`wfx-tag ${s.status}`}>{s.status}</span>
              <div className="fb-node-ctl">
                <button className="linkbtn xs" disabled={pending || i === 0} onClick={() => onMove(s.id, -1)} aria-label="Move up">
                  ↑
                </button>
                <button
                  className="linkbtn xs"
                  disabled={pending || i === steps.length - 1}
                  onClick={() => onMove(s.id, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  className="linkbtn xs danger"
                  disabled={pending || s.status === "done"}
                  onClick={() => onRemove(s.id)}
                  aria-label="Remove step"
                >
                  ✕
                </button>
              </div>
            </div>
            {s.kind === "branch" ? (
              <BranchConfig
                step={s}
                templates={templates}
                pending={pending}
                onSave={(d, o, v, t, e) => onBranch(s.id, d, o, v, t, e)}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="fb-add">
        <select className="inp sm" value={addKind} onChange={(e) => setAddKind(e.target.value)}>
          {ADDABLE.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          className="btn-sec sm"
          disabled={pending}
          onClick={() => onAdd(lastOrd, addKind, ADDABLE.find((k) => k.value === addKind)?.label ?? addKind)}
        >
          + Add step
        </button>
      </div>
    </div>
  );
}
