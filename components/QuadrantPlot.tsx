"use client";

import type { SurveyInstrument } from "@/lib/survey";

// 2×2 output for instruments that define `quadrant` (e.g. Strategy Health:
// Strategy quality × Execution readiness). Plots the team's position from two
// named dimension means and names the quadrant they land in.
export function QuadrantPlot({
  inst,
  dims,
}: {
  inst: SurveyInstrument;
  dims: { key: string; mean: number | null }[];
}) {
  const q = inst.quadrant;
  if (!q) return null;
  const xm = dims.find((d) => d.key === q.x)?.mean;
  const ym = dims.find((d) => d.key === q.y)?.mean;
  if (xm == null || ym == null) return null;

  const { min, max } = inst.scale;
  const span = max - min || 1;
  const clamp = (v: number) => Math.max(0, Math.min(1, (v - min) / span)) * 100;
  const xPct = clamp(xm);
  const yPct = clamp(ym);
  const mid = (min + max) / 2;
  const labels = q.q ?? { ll: "", hl: "", lh: "", hh: "" };
  const key = (xm >= mid ? "h" : "l") + (ym >= mid ? "h" : "l");
  const active = (labels as Record<string, string>)[key];

  return (
    <div className="quadwrap">
      <div className="quadylab">{q.yLabel} ↑</div>
      <div className="quadplot">
        <span className="qlab tl">{labels.lh}</span>
        <span className="qlab tr">{labels.hh}</span>
        <span className="qlab bl">{labels.ll}</span>
        <span className="qlab br">{labels.hl}</span>
        <span className="qdot" style={{ left: `${xPct}%`, bottom: `${yPct}%` }} />
      </div>
      <div className="quadxlab">{q.xLabel} →</div>
      {active ? <div className="quadnow">You’re here: <b>{active}</b></div> : null}
    </div>
  );
}
