"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Re-measure trends for a team's instruments: the composite (0–100) of each
// survey of a kind over time, with the latest value and the delta vs the
// previous reading. Self-fetching; the whole section hides until at least one
// instrument has two or more unmasked readings, so it never adds empty chrome.

type Point = { id: string; name: string; created_at: string; respondents: number; composite: number | null };
type Series = { kind: string; name: string; scored: number[] };

export function SurveyTrends({ teamId, instruments }: { teamId: string; instruments: { kind: string; name: string }[] }) {
  const [series, setSeries] = useState<Series[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let live = true;
    (async () => {
      const out: Series[] = [];
      for (const inst of instruments) {
        const { data } = await supabase.rpc("survey_trend", { p_team: teamId, p_kind: inst.kind });
        const pts = (Array.isArray(data) ? (data as unknown as Point[]) : [])
          .map((p) => p.composite)
          .filter((c): c is number => typeof c === "number");
        if (pts.length >= 2) out.push({ kind: inst.kind, name: inst.name, scored: pts });
      }
      if (live) setSeries(out);
    })();
    return () => { live = false; };
  }, [teamId, instruments]);

  if (!series.length) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="cat-head" style={{ marginTop: 0, fontSize: 15 }}>Re-measure trend <span className="n">{series.length}</span></div>
      <p className="page-sub" style={{ marginTop: -4 }}>Has re-running the assessment moved the number? Overall index (0–100) over time.</p>
      {series.map((s) => <TrendRow key={s.kind} name={s.name} scored={s.scored} />)}
    </div>
  );
}

function TrendRow({ name, scored }: { name: string; scored: number[] }) {
  const latest = scored[scored.length - 1];
  const prev = scored[scored.length - 2];
  const delta = Math.round((latest - prev) * 10) / 10;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const w = 120, h = 28, pad = 3;
  const step = scored.length > 1 ? (w - pad * 2) / (scored.length - 1) : 0;
  const xy = (c: number, i: number) => [pad + i * step, pad + (1 - c / 100) * (h - pad * 2)] as const;
  const poly = scored.map((c, i) => xy(c, i).map((n) => n.toFixed(1)).join(",")).join(" ");

  return (
    <div className="strend">
      <span className="strend-name">{name}</span>
      <svg className="strend-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <polyline points={poly} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {scored.map((c, i) => { const [x, y] = xy(c, i); return <circle key={i} cx={x} cy={y} r={i === scored.length - 1 ? 2.6 : 1.6} fill="var(--green)" />; })}
      </svg>
      <span className="strend-now">
        <span className="strend-val">{latest}</span>
        <span className="strend-den">/ 100</span>
      </span>
      <span className={`strend-delta ${dir}`}>{dir === "up" ? "▲" : dir === "down" ? "▼" : "—"} {Math.abs(delta)}</span>
    </div>
  );
}
