"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowLeft, ArrowRight, EyeOff, Check } from "lucide-react";
import { submitAssessment } from "../../actions";

type Question = { dynamic: string; label: string; question: string };

const SCALE = [
  { score: 20, label: "Strongly disagree" },
  { score: 40, label: "Disagree" },
  { score: 60, label: "Neutral" },
  { score: 80, label: "Agree" },
  { score: 100, label: "Strongly agree" },
];

export function TakeFlow({
  pulseId,
  pulseName,
  questions,
}: {
  pulseId: string;
  pulseName: string;
  questions: Question[];
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [state, formAction] = useFormState(submitAssessment, { ok: true });

  const total = questions.length;
  const q = questions[i];
  const answered = Object.keys(answers).length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const isLast = i === total - 1;
  const current = answers[q?.dynamic];

  function pick(score: number) {
    setAnswers((a) => ({ ...a, [q.dynamic]: score }));
  }

  return (
    <div className="m2-take">
      <div className="m2-take-card">
        {/* head */}
        <div className="m2-take-head">
          <div>
            <div className="m2-eyebrow" style={{ marginBottom: 2 }}>{pulseName}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Question {Math.min(i + 1, total)} of {total}</div>
          </div>
          <span className="m2-pill draft"><EyeOff size={12} /> Anonymous</span>
        </div>

        {/* progress */}
        <div className="m2-bar" style={{ margin: "14px 0 4px" }}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 600, marginBottom: 22 }}>
          {answered >= total ? "All answered — ready to submit" : answered > total / 2 ? "You're past halfway — keep going!" : "+10 XP banked per answer"}
        </div>

        {/* question */}
        <form action={formAction}>
          {/* carry every answer so the final submit posts them all */}
          {Object.entries(answers).map(([dyn, score]) => (
            <input key={dyn} type="hidden" name={`score:${dyn}`} value={score} />
          ))}
          <input type="hidden" name="pulse_id" value={pulseId} />

          {q ? (
            <>
              <div className="m2-take-dyn">{q.label}</div>
              <h1 className="m2-take-q">{q.question}</h1>
              <div className="m2-scale">
                {SCALE.map((s) => (
                  <button
                    type="button"
                    key={s.score}
                    className={`m2-scale-opt${current === s.score ? " selected" : ""}`}
                    onClick={() => pick(s.score)}
                    aria-pressed={current === s.score}
                  >
                    <span className="m2-scale-dot">{current === s.score ? <Check size={14} /> : null}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: "var(--muted)" }}>This assessment has no questions configured.</p>
          )}

          {state.error ? <div className="m2-ob-error" style={{ maxWidth: "none", marginTop: 18 }}>{state.error}</div> : null}

          {/* footer */}
          <div className="m2-take-foot">
            {i > 0 ? (
              <button type="button" className="m2-btn sec" onClick={() => setI((n) => n - 1)}>
                <ArrowLeft size={15} /> Back
              </button>
            ) : (
              <Link href="/m2/assessments" className="m2-btn ghost">Save &amp; exit</Link>
            )}
            {!isLast ? (
              <button
                type="button"
                className="m2-btn"
                disabled={current == null}
                onClick={() => setI((n) => n + 1)}
              >
                Next <ArrowRight size={15} />
              </button>
            ) : (
              <Submit disabled={answered < total} />
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="m2-btn" disabled={disabled || pending}>
      {pending ? "Submitting…" : "Submit"} {!pending ? <Check size={15} /> : null}
    </button>
  );
}
