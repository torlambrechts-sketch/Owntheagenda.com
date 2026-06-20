"use client";

import { useState } from "react";

// The quick builder: compose a Flow as a row of step boxes inside one white
// card, configure each step's action + title, add / edit / remove / reorder,
// then create it in a single call. Mirrors the "templates in boxes" create
// strip used on Workshops and Assessments.

type Named = { id: string; name: string };
export type ComposerStep = { kind: string; title: string };

const STEP_KINDS: { value: string; label: string; hint: string }[] = [
  { value: "assessment", label: "Assessment", hint: "Open the pulse" },
  { value: "launch", label: "Collect", hint: "Wait for responses" },
  { value: "branch", label: "Branch", hint: "Route by result" },
  { value: "workshop", label: "Workshop", hint: "Run the session" },
  { value: "commit", label: "Commit", hint: "Capture actions" },
  { value: "repulse", label: "Re-pulse", hint: "Re-measure" },
  { value: "custom", label: "Custom", hint: "Anything else" },
];
const kindLabel = (k: string) => STEP_KINDS.find((s) => s.value === k)?.label ?? k;
const kindHint = (k: string) => STEP_KINDS.find((s) => s.value === k)?.hint ?? "";

const DEFAULT_STEPS: ComposerStep[] = [
  { kind: "assessment", title: "Create assessment" },
  { kind: "launch", title: "Collect responses" },
  { kind: "workshop", title: "Run workshop" },
];
const FULL_LOOP_STEPS: ComposerStep[] = [
  { kind: "assessment", title: "Create assessment" },
  { kind: "launch", title: "Collect responses" },
  { kind: "interpret", title: "Interpret results" },
  { kind: "workshop", title: "Run workshop" },
  { kind: "commit", title: "Run and commit" },
  { kind: "repulse", title: "Track and re-pulse" },
];

export function FlowComposer({
  teams,
  assessments,
  pending,
  onCreate,
}: {
  teams: Named[];
  assessments: { key: string; name: string }[];
  pending: boolean;
  onCreate: (
    title: string,
    teamId: string | null,
    minResponses: number,
    steps: ComposerStep[],
    assessmentKind: string | null,
    collectDays: number,
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [minResp, setMinResp] = useState(4);
  const [collectDays, setCollectDays] = useState(7);
  const [steps, setSteps] = useState<ComposerStep[]>(DEFAULT_STEPS);
  const [assessmentKind, setAssessmentKind] = useState(assessments[0]?.key ?? "");

  function patch(i: number, p: Partial<ComposerStep>) {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...p } : step)));
  }
  function remove(i: number) {
    setSteps((s) => (s.length <= 1 ? s : s.filter((_, idx) => idx !== i)));
  }
  function move(i: number, dir: number) {
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function add() {
    setSteps((s) => [...s, { kind: "workshop", title: "Run workshop" }]);
  }
  function reset() {
    setSteps(DEFAULT_STEPS);
    setTitle("");
  }

  const canCreate = !!title.trim() && steps.length > 0 && !pending;

  return (
    <div className="fc card">
      <div className="fc-head">
        <div className="cat-head" style={{ marginBottom: 0 }}>Build a flow</div>
        <p className="fc-sub">Compose the steps, then create it. Each step is an action the flow runs in order.</p>
        <div className="fc-presets">
          <span className="fc-presets-l">Start from</span>
          <button className="chip" onClick={() => setSteps(DEFAULT_STEPS)}>Quick flow · 3 steps</button>
          <button className="chip" onClick={() => setSteps(FULL_LOOP_STEPS)}>Full operating loop · 6 steps</button>
        </div>
      </div>

      <div className="fc-meta">
        <input
          className="inp"
          placeholder="Flow name — e.g. Q3 psychological safety check"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select className="inp" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">No team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <label className="fc-thr">
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
        <label className="fc-thr">
          Collect within
          <input
            className="inp sm"
            type="number"
            min={1}
            max={90}
            value={collectDays}
            onChange={(e) => setCollectDays(Math.max(1, Number(e.target.value) || 7))}
          />
          days
        </label>
      </div>

      <div className="fc-strip">
        {steps.map((s, i) => (
          <div className="fc-box" key={i}>
            <div className="fc-box-top">
              <span className="fc-num">{i + 1}</span>
              <div className="fc-box-ctl">
                <button className="linkbtn xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move left">←</button>
                <button className="linkbtn xs" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move right">→</button>
                <button className="linkbtn xs danger" disabled={steps.length <= 1} onClick={() => remove(i)} aria-label="Remove">✕</button>
              </div>
            </div>
            <select className="inp sm" value={s.kind} onChange={(e) => patch(i, { kind: e.target.value })}>
              {STEP_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
            <input
              className="inp sm"
              value={s.title}
              placeholder={kindLabel(s.kind)}
              onChange={(e) => patch(i, { title: e.target.value })}
            />
            {s.kind === "assessment" ? (
              <>
                <select
                  className="inp sm"
                  value={assessmentKind}
                  onChange={(e) => setAssessmentKind(e.target.value)}
                  aria-label="Assessment instrument"
                >
                  <option value="">Team pulse (default)</option>
                  {assessments.map((a) => (
                    <option key={a.key} value={a.key}>{a.name}</option>
                  ))}
                </select>
                <a className="fc-new" href="/assessments">+ Create new assessment</a>
              </>
            ) : (
              <span className="fc-hint">{kindHint(s.kind)}</span>
            )}
          </div>
        ))}
        <button type="button" className="fc-add" onClick={add}>
          <span className="fc-add-ring">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          <span className="fc-add-l">Add step</span>
        </button>
      </div>

      <div className="fc-foot">
        <button className="linkbtn xs" disabled={pending} onClick={reset}>Reset</button>
        <button
          className="btn-prim"
          disabled={!canCreate}
          onClick={() => onCreate(title.trim(), teamId || null, minResp, steps, assessmentKind || null, collectDays)}
        >
          Create flow
        </button>
      </div>
    </div>
  );
}
