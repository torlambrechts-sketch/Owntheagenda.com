"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { synthesizeSession, addSessionAction, type Synthesis } from "../actions";

export function SessionSynthesis({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [data, setData] = useState<Synthesis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<number, boolean>>({});

  function gen() {
    setErr(null);
    start(async () => {
      const res = await synthesizeSession(sessionId);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setData({ ai: !!res.ai, note: res.note, themes: res.themes ?? [], actions: res.actions ?? [] });
      setAdded({});
    });
  }
  function add(i: number, text: string) {
    start(async () => {
      const res = await addSessionAction(sessionId, text);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setAdded((a) => ({ ...a, [i]: true }));
      router.refresh();
    });
  }

  return (
    <div className="ro-block">
      <div className="ro-block-h">
        <h3>Synthesis</h3>
        {data ? (
          <span className={`pill sm ${data.ai ? "t-brainstorm" : "draft"}`}>{data.ai ? "AI" : "Quick"}</span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button className="btn-sec" disabled={pending} onClick={gen}>
          {pending ? "Thinking…" : data ? "Regenerate" : "Generate"}
        </button>
      </div>

      {err ? <div className="form-err">{err}</div> : null}
      {!data && !pending && !err ? (
        <div className="ro-empty">Cluster this session&rsquo;s ideas and feedback into themes, and draft the next actions.</div>
      ) : null}

      {data ? (
        <>
          {data.themes.map((t, i) => (
            <div className="syn-theme" key={i}>
              <div className="syn-t">{t.title}</div>
              <ul>
                {t.points.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            </div>
          ))}

          {data.actions.length ? (
            <div className="syn-actions">
              <div className="syn-t">Suggested actions</div>
              {data.actions.map((a, i) => (
                <div className="syn-act" key={i}>
                  <span className="ro-text">{a}</span>
                  <button className="btn-sec" disabled={pending || added[i]} onClick={() => add(i, a)}>
                    {added[i] ? "Added ✓" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {data.note ? <div className="syn-note">{data.note}</div> : null}
        </>
      ) : null}
    </div>
  );
}
