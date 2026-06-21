"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// One shared respondent run experience for every assessment surface — the
// library run, team surveys (standalone + live in a workshop) and individual
// self-assessments. Paged one-question-at-a-time by default (the modern,
// low-abandonment pattern) with: a bottom visual progress bar, a per-item
// keyboard shortcut, an up-front time estimate + privacy line, local autosave /
// resume, and an accessible "show all on one page" fallback for assistive tech.
//
// It only collects answers and calls onSubmit — each caller decides what to
// render afterwards (a report, an aggregate read, a saved confirmation), so the
// scoring/result logic in lib/survey.ts stays the single source of truth.
//
// Question types: Likert (numeric, the default and the only *scored* type),
// single choice, multi-select and free text. Non-Likert answers are collected
// here and handed to onSubmit alongside the numeric ones; callers persist the
// non-numeric answers separately so scoring (numeric means) stays intact.

export type AnswerValue = number | string | string[];
export type QuestionType = "likert" | "single" | "multi" | "text";
export type RunnerItem = {
  key: string;
  dimension: string;
  text: string;
  type?: QuestionType;
  options?: string[];
  required?: boolean;
};
export type RunnerDimension = { key: string; label: string };
export type RunnerInstrument = {
  name: string;
  scale: { min: number; max: number; minLabel: string; maxLabel: string };
  dimensions?: RunnerDimension[];
  items: RunnerItem[];
};

function itemType(it: RunnerItem): QuestionType {
  return it.type ?? "likert";
}
// Split collected answers into numeric scores (Likert — the only scored type)
// and everything else (single/multi/text), which callers persist separately so
// the numeric scoring path stays valid.
export function splitAnswers(a: Record<string, AnswerValue>): {
  scores: Record<string, number>;
  answers: Record<string, AnswerValue>;
} {
  const scores: Record<string, number> = {};
  const answers: Record<string, AnswerValue> = {};
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === "number") scores[k] = v;
    else answers[k] = v;
  }
  return { scores, answers };
}
function isAnswered(v: AnswerValue | undefined): boolean {
  if (v == null) return false;
  if (typeof v === "number") return true;
  if (typeof v === "string") return v.trim() !== "";
  return Array.isArray(v) && v.length > 0;
}

export function AssessmentRunner({
  instrument,
  initialAnswers,
  onSubmit,
  onBack,
  submitLabel = "See my report ›",
  draftKey,
  onChange,
  privacyNote,
  estimateMins,
  allowPartial = false,
  headerSub = "Answer as honestly as you can — there are no right or wrong answers.",
}: {
  instrument: RunnerInstrument;
  initialAnswers?: Record<string, AnswerValue>;
  onSubmit: (answers: Record<string, AnswerValue>) => void | Promise<void>;
  onBack?: () => void;
  submitLabel?: string;
  /** localStorage key — when set, in-progress answers are saved and resumed. */
  draftKey?: string;
  /** Optional: mirror in-progress answers elsewhere (e.g. server-side draft). */
  onChange?: (answers: Record<string, AnswerValue>) => void;
  privacyNote?: string;
  estimateMins?: number;
  /** Allow submitting before every item is answered (shows provisional progress). */
  allowPartial?: boolean;
  headerSub?: string;
}) {
  const items = instrument.items;
  const n = items.length;
  const { min, max, minLabel, maxLabel } = instrument.scale;

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => ({ ...(initialAnswers ?? {}) }));
  const [idx, setIdx] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resumed, setResumed] = useState(false);
  const hydrated = useRef(false);

  // Resume any locally-saved draft once on mount. A draft is the respondent's
  // own in-progress work and is strictly newer than server-provided initial
  // answers (a retake's prior scores), so it WINS the merge — otherwise an
  // edited-then-reloaded retake would silently revert to the old scores. The
  // draft is cleared on successful submit, so it only exists mid-attempt.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (!draftKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, AnswerValue>;
      if (saved && typeof saved === "object" && Object.keys(saved).length) {
        setAnswers((cur) => ({ ...cur, ...saved }));
        setResumed(true);
      }
    } catch { /* ignore malformed draft */ }
  }, [draftKey]);

  // Persist on every change while answering.
  useEffect(() => {
    if (!draftKey || typeof window === "undefined") return;
    try {
      if (Object.keys(answers).length) window.localStorage.setItem(draftKey, JSON.stringify(answers));
    } catch { /* storage full / unavailable — non-fatal */ }
  }, [answers, draftKey]);

  // Optional external mirror (e.g. server-side draft for cross-device resume).
  // Kept in a ref so a changing callback identity doesn't re-fire the effect.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => {
    if (Object.keys(answers).length) onChangeRef.current?.(answers);
  }, [answers]);

  const answered = useMemo(() => items.filter((it) => isAnswered(answers[it.key])).length, [items, answers]);
  const pct = n ? Math.round((answered / n) * 100) : 0;
  // Submission gates on *required* items (non-Likert questions can be optional).
  // When every item is optional, still require at least one answer so a wholly
  // blank response can't be submitted.
  const requiredItems = useMemo(() => items.filter((it) => it.required !== false), [items]);
  const allRated = n > 0 && requiredItems.every((it) => isAnswered(answers[it.key])) && (requiredItems.length > 0 || answered > 0);

  const opts = useMemo(() => {
    const out: number[] = [];
    for (let v = min; v <= max; v++) out.push(v);
    return out;
  }, [min, max]);
  const optLabel = useCallback(
    (v: number) => (v === min ? `${v} · ${minLabel}` : v === max ? `${v} · ${maxLabel}` : String(v)),
    [min, max, minLabel, maxLabel],
  );

  const setAnswer = useCallback((key: string, v: number) => setAnswers((a) => ({ ...a, [key]: v })), []);
  const setVal = useCallback((key: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [key]: v })), []);
  const toggleMulti = useCallback((key: string, opt: string) => setAnswers((a) => {
    const cur = Array.isArray(a[key]) ? (a[key] as string[]) : [];
    return { ...a, [key]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
  }), []);

  const doSubmit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(answers);
      // Success — clear the local draft so a later visit starts clean.
      if (draftKey && typeof window !== "undefined") {
        try { window.localStorage.removeItem(draftKey); } catch { /* non-fatal */ }
      }
    } catch {
      // The caller surfaces its own error; keep the draft and stay on the run
      // so nothing is lost.
    } finally {
      setBusy(false);
    }
  }, [answers, busy, draftKey, onSubmit]);

  // Keyboard: digit keys pick a value (Likert only), ← / → and Enter navigate.
  // Disabled in the single-page fallback and while typing in a field.
  useEffect(() => {
    if (showAll) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const it = items[idx];
      if (!it) return;
      if (itemType(it) === "likert" && /^[0-9]$/.test(e.key)) {
        const v = Number(e.key);
        if (v >= min && v <= max) { setAnswer(it.key, v); e.preventDefault(); }
        return;
      }
      if (e.key === "ArrowLeft") { setIdx((i) => Math.max(0, i - 1)); e.preventDefault(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (it.required !== false && !isAnswered(answers[it.key])) return;
        if (idx < n - 1) { setIdx((i) => Math.min(n - 1, i + 1)); }
        else if (allRated) { void doSubmit(); }
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAll, items, idx, n, min, max, answers, allRated, setAnswer, doSubmit]);

  const intro = (
    <div className="arun-intro">
      {typeof estimateMins === "number" ? <span>◷ ~{estimateMins} min</span> : null}
      <span>{min} = {minLabel} · {max} = {maxLabel}</span>
      {privacyNote ? <span className="arun-priv">{privacyNote}</span> : null}
    </div>
  );

  // Non-Likert controls, shared by both render modes.
  const choiceInput = (it: RunnerItem) => {
    const t = itemType(it);
    if (t === "text") {
      return (
        <textarea
          className="arun-text"
          rows={3}
          aria-label={it.text}
          value={typeof answers[it.key] === "string" ? (answers[it.key] as string) : ""}
          onChange={(e) => setVal(it.key, e.target.value)}
          placeholder="Type your answer…"
        />
      );
    }
    const options = it.options ?? [];
    if (t === "multi") {
      const cur = Array.isArray(answers[it.key]) ? (answers[it.key] as string[]) : [];
      return (
        <div className="arun-choices" role="group" aria-label={it.text}>
          {options.map((o) => (
            <button key={o} type="button" role="checkbox" aria-checked={cur.includes(o)}
              className={`arun-choice${cur.includes(o) ? " on" : ""}`} onClick={() => toggleMulti(it.key, o)}>
              <span className="arun-box sq" />{o}
            </button>
          ))}
        </div>
      );
    }
    // single
    return (
      <div className="arun-choices" role="radiogroup" aria-label={it.text}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={answers[it.key] === o}
            className={`arun-choice${answers[it.key] === o ? " on" : ""}`} onClick={() => setVal(it.key, o)}>
            <span className="arun-box" />{o}
          </button>
        ))}
      </div>
    );
  };

  // ---- accessible single-page fallback ----
  if (showAll) {
    const byDim = instrument.dimensions?.length
      ? instrument.dimensions.map((d) => ({ d, its: items.filter((it) => it.dimension === d.key) }))
      : [{ d: null as RunnerDimension | null, its: items }];
    return (
      <div className="a-run">
        <div className="a-runtop">
          {onBack ? <button className="a-back" onClick={onBack} aria-label="Back">‹</button> : null}
          <div className="a-runtop-h">{instrument.name}</div>
          <button className="arun-allbtn" onClick={() => setShowAll(false)}>Switch to one-at-a-time ›</button>
        </div>
        {intro}
        {byDim.map(({ d, its }) => (
          <div key={d?.key ?? "all"} className="svgroup" role="group" aria-label={d?.label ?? instrument.name}>
            {d ? <div className="svgroup-h">{d.label}</div> : null}
            {its.map((it) => (
              <div className="asq" key={it.key}>
                <div className="asq-q"><span>{it.text}</span></div>
                {itemType(it) === "likert" ? (
                  <div className="asopts sv7" role="radiogroup" aria-label={it.text}>
                    {opts.map((v) => (
                      <button
                        key={v}
                        role="radio"
                        aria-checked={answers[it.key] === v}
                        aria-label={optLabel(v)}
                        className={answers[it.key] === v ? "on" : ""}
                        onClick={() => setAnswer(it.key, v)}
                      >{v}</button>
                    ))}
                  </div>
                ) : choiceInput(it)}
              </div>
            ))}
          </div>
        ))}
        <div className="mactions" style={{ marginTop: 14 }}>
          <span className="arun-count">{answered} / {n} answered</span>
          <button className="btn-prim" disabled={(allowPartial ? answered === 0 : !allRated) || busy} onClick={doSubmit}>{busy ? "Saving…" : submitLabel}</button>
        </div>
      </div>
    );
  }

  // ---- paged one-question-at-a-time ----
  const it = items[idx];
  const cur = it ? answers[it.key] : undefined;
  const last = idx === n - 1;
  const curType = it ? itemType(it) : "likert";
  const curRequired = it ? it.required !== false : false;
  const nextBlocked = curRequired && !isAnswered(cur);
  return (
    <div className="a-run">
      <div className="a-runtop">
        {onBack ? <button className="a-back" onClick={onBack} aria-label="Back">‹</button> : null}
        <div className="a-runtop-h">{instrument.name}<span className="a-runtop-sub">{headerSub}</span></div>
        <button className="arun-allbtn" onClick={() => setShowAll(true)}>Show all questions ›</button>
      </div>
      {intro}
      {resumed ? <div className="arun-resumed">↩ Picked up where you left off — your answers were saved on this device.</div> : null}

      <div className="a-qcard">
        <div className="a-runmeta"><span>Question {idx + 1} of {n}</span><span>{answered} / {n} answered</span></div>
        {curType === "likert" ? <div className="a-qnum">This statement fits me</div> : null}
        <div className="a-qtext">{it?.text}{!curRequired ? <span className="arun-optional"> · optional</span> : null}</div>
        {curType === "likert" ? (
          <div className="a-likert" role="radiogroup" aria-label={it?.text}>
            {opts.map((v, oi) => {
              const checked = cur === v;
              // Roving tabindex: only the checked option (or the first, when none
              // is chosen) is in the tab order; arrows move within the group.
              const tab = checked || (cur == null && oi === 0) ? 0 : -1;
              return (
                <div
                  key={v}
                  className={`a-lopt${checked ? " on" : ""}`}
                  role="radio"
                  aria-checked={checked}
                  aria-label={optLabel(v)}
                  tabIndex={tab}
                  onClick={() => it && setAnswer(it.key, v)}
                  onKeyDown={(e) => {
                    if (!it) return;
                    if (e.key === " ") { e.preventDefault(); setAnswer(it.key, v); return; }
                    let m = -1;
                    if (e.key === "ArrowDown") m = Math.min(opts.length - 1, oi + 1);
                    else if (e.key === "ArrowUp") m = Math.max(0, oi - 1);
                    else if (e.key === "Home") m = 0;
                    else if (e.key === "End") m = opts.length - 1;
                    else return;
                    e.preventDefault();
                    e.stopPropagation();
                    setAnswer(it.key, opts[m]);
                    (e.currentTarget.parentElement?.children[m] as HTMLElement | undefined)?.focus();
                  }}
                >
                  <span className="a-lr" />{optLabel(v)}
                  <span className="arun-kbd">{v}</span>
                </div>
              );
            })}
          </div>
        ) : (
          it ? choiceInput(it) : null
        )}
      </div>

      {/* visual-only progress, placed below the question (higher-completion placement) */}
      <div className="a-progress arun-progress-bottom" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>

      <div className="a-runnav">
        <button className="btn-sec" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>‹ Back</button>
        <div className="sp" />
        {allowPartial && !last && answered > 0 ? (
          <button className="btn-sec" disabled={busy} onClick={doSubmit}>{busy ? "Saving…" : `See results (${answered}/${n})`}</button>
        ) : null}
        {last ? (
          <button className="btn-prim" disabled={busy || (allowPartial ? answered === 0 : nextBlocked || !allRated)} onClick={doSubmit}>{busy ? "Saving…" : allowPartial && !allRated ? `See results (${answered}/${n})` : submitLabel}</button>
        ) : (
          <button className="btn-prim" disabled={nextBlocked} onClick={() => setIdx((i) => Math.min(n - 1, i + 1))}>Next ›</button>
        )}
      </div>
    </div>
  );
}
