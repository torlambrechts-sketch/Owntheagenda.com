"use client";

import { useMemo, useState, useTransition } from "react";
import { scoreLeadership } from "./actions";

export type Question = { key: string; ord: number; text: string; reverse: boolean };
export type Facet = { code: string; name: string; questions: Question[] };
export type Category = { code: string; name: string; facets: Facet[] };

type ScoreResult = {
  overall: number | string;
  categories: { code: string; name: string; mean: number | string }[];
  facets: { code: string; name: string; category: string; mean: number | string; answered: number }[];
};

const SCALE = [1, 2, 3, 4, 5, 6, 7];

export function LeadershipTest({ inventory }: { inventory: Category[] }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<ScoreResult | null>(null);
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
      const res = await scoreLeadership(answers);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setResults(res.result as ScoreResult);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (results) {
    const facets = results.facets.map((f) => ({ ...f, mean: Number(f.mean) }));
    const lowest = [...facets].sort((a, b) => a.mean - b.mean).slice(0, 3);
    return (
      <div className="lead-results">
        <div className="lead-overall">
          <div className="lead-score">{Number(results.overall).toFixed(2)}<small>/7</small></div>
          <div className="lead-overall-l">Overall leadership effectiveness</div>
        </div>

        <h3 className="lead-h">By category</h3>
        <div className="lead-cats">
          {results.categories.map((c) => (
            <div className="lead-cat" key={c.code}>
              <div className="lead-cat-h"><span>{c.name}</span><b>{Number(c.mean).toFixed(2)}</b></div>
              <div className="lead-bar"><span style={{ width: `${(Number(c.mean) / 7) * 100}%` }} /></div>
            </div>
          ))}
        </div>

        <h3 className="lead-h">Lowest facets — start here</h3>
        <ul className="lead-low">
          {lowest.map((f) => <li key={f.code}><b>{f.name}</b><span>{f.mean.toFixed(2)}</span></li>)}
        </ul>

        <details className="lead-allfacets">
          <summary>All 21 facets</summary>
          <ul>{facets.map((f) => <li key={f.code}><span>{f.name}</span><b>{f.mean.toFixed(2)}</b></li>)}</ul>
        </details>

        <div style={{ marginTop: 16 }}>
          <button className="btn-sec" onClick={() => setResults(null)}>Retake</button>
        </div>
        <p className="org-note" style={{ marginTop: 10 }}>
          Reverse-worded items are automatically inverted before scoring. Results are shown to you and not saved.
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
        <button className="btn-prim" disabled={pending || answered === 0} onClick={submit}>
          {pending ? "Scoring…" : answered < total ? `See results (${answered}/${total})` : "See results"}
        </button>
      </div>
    </div>
  );
}
