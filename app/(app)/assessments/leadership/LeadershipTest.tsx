"use client";

import { useMemo, useState, useTransition } from "react";
import { scoreLeadership, saveLeadershipResponse } from "./actions";
import { ScoreReadout, type Readout } from "./ScoreReadout";

export type Question = { key: string; ord: number; text: string; reverse: boolean };
export type Facet = { code: string; name: string; questions: Question[] };
export type Category = { code: string; name: string; facets: Facet[] };

const SCALE = [1, 2, 3, 4, 5, 6, 7];

export function LeadershipTest({
  inventory,
  teamId,
  priorResult,
}: {
  inventory: Category[];
  teamId: string | null;
  priorResult: Readout | null;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Readout | null>(priorResult);
  const [taking, setTaking] = useState(!priorResult);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const total = useMemo(
    () => inventory.reduce((s, c) => s + c.facets.reduce((t, f) => t + f.questions.length, 0), 0),
    [inventory],
  );
  const answered = Object.keys(answers).length;

  function submit() {
    setErr(null);
    start(async () => {
      const res = teamId
        ? await saveLeadershipResponse(teamId, answers)
        : await scoreLeadership(answers);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setResults(res.result as Readout);
      setTaking(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (results && !taking) {
    return (
      <div>
        <ScoreReadout data={results} />
        <div style={{ marginTop: 16 }}>
          <button className="btn-sec" onClick={() => { setAnswers({}); setTaking(true); }}>Retake</button>
        </div>
        <p className="org-note" style={{ marginTop: 10 }}>
          Reverse-worded items are inverted before scoring.
          {teamId
            ? " Your answers are saved privately — only the anonymized team aggregate is shared with team leads."
            : " Results are shown to you and not saved."}
        </p>
      </div>
    );
  }

  return (
    <div className="lead-test">
      <div className="lead-progress">
        <div className="lead-progress-bar"><span style={{ width: `${total ? (answered / total) * 100 : 0}%` }} /></div>
        <span>{answered}/{total}</span>
      </div>
      {err ? <div className="form-err">{err}</div> : null}

      {inventory.map((cat) => (
        <section className="lead-section" key={cat.code}>
          <h2 className="lead-cat-title">{cat.name}</h2>
          {cat.facets.map((f) => (
            <div className="lead-facet" key={f.code}>
              <div className="lead-facet-name">{f.name}</div>
              {f.questions.map((q) => (
                <div className="lq" key={q.key}>
                  <div className="lq-text">{q.text}</div>
                  <div className="lscale" role="group" aria-label={q.text}>
                    {SCALE.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`lopt${answers[q.key] === v ? " on" : ""}`}
                        onClick={() => setAnswers((a) => ({ ...a, [q.key]: v }))}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      <div className="lead-submit">
        <span className="lscale-legend">1 = Strongly disagree · 7 = Strongly agree</span>
        <div style={{ display: "flex", gap: 8 }}>
          {results ? <button className="btn-sec" onClick={() => setTaking(false)}>Cancel</button> : null}
          <button className="btn-prim" disabled={pending || answered === 0} onClick={submit}>
            {pending ? "Saving…" : answered < total ? `See results (${answered}/${total})` : "See results"}
          </button>
        </div>
      </div>
    </div>
  );
}
