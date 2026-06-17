"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Dual-mode team assessment. The same module whether the pulse was opened live
// in the room or scheduled as a prerequisite: it lets people rate the five
// dynamics and shows the aggregate, with the min-3 anonymity mask intact.

type Dyn = {
  dynamic: string;
  label: string;
  question: string;
  pct: number | null;
  in_band: boolean | null;
  responses: number | null;
  target_low: number;
  target_high: number;
};

export function AssessModule({
  workshopId,
  teamId,
  isFacilitator,
  initialPulseId,
  timing,
  userId,
  title,
  prompt,
  stepLabel,
  showReady,
  ready,
  onToggleReady,
}: {
  workshopId: string;
  teamId: string | null;
  isFacilitator: boolean;
  initialPulseId: string | null;
  timing: string;
  userId: string;
  title: string;
  prompt: string | null;
  stepLabel: string;
  showReady: boolean;
  ready: boolean;
  onToggleReady: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pulseId, setPulseId] = useState<string | null>(initialPulseId);
  const [dyns, setDyns] = useState<Dyn[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [respondents, setRespondents] = useState(0);
  const [busy, setBusy] = useState(false);

  const loadAgg = useCallback(
    async (pid: string) => {
      if (!teamId) return;
      const { data } = await supabase.rpc("team_dynamics", { p_team: teamId, p_pulse: pid });
      setDyns((data ?? []) as Dyn[]);
      const { data: part } = await supabase.rpc("pulse_participation", { p_pulse: pid });
      const rows = (part ?? []) as { user_id: string; answered: number; completed: boolean }[];
      setRespondents(rows.filter((r) => r.answered > 0).length);
      setSubmitted((prev) => prev || rows.some((r) => r.user_id === userId && r.answered > 0));
    },
    [supabase, teamId, userId],
  );

  useEffect(() => {
    if (pulseId) loadAgg(pulseId);
  }, [pulseId, loadAgg]);

  // pick up the pulse the moment a facilitator opens it; poll the aggregate
  useEffect(() => {
    const ch = supabase
      .channel(`assess:${workshopId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workshop", filter: `id=eq.${workshopId}` },
        (p) => {
          const pid = (p.new as any)?.pulse_id;
          if (pid && pid !== pulseId) setPulseId(pid);
        },
      )
      .subscribe();
    const poll = setInterval(() => { if (pulseId) loadAgg(pulseId); }, 6000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId, pulseId]);

  async function openAssessment() {
    setBusy(true);
    const { data, error } = await supabase.rpc("ensure_workshop_pulse", { p_workshop: workshopId, p_timing: timing });
    setBusy(false);
    if (!error && data) setPulseId(data as string);
  }
  async function submit() {
    if (!pulseId) return;
    setBusy(true);
    await supabase.rpc("submit_pulse_response", { p_pulse: pulseId, p_scores: scores });
    setBusy(false);
    setSubmitted(true);
    loadAgg(pulseId);
  }

  const allRated = dyns.length > 0 && dyns.every((d) => scores[d.dynamic]);

  return (
    <div className="assesswrap">
      <div className="canvashead">
        <div>
          <div className="pact">{stepLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="cright">
          {pulseId ? <span className="pill sm" style={{ background: "var(--canvas-2)", color: "var(--muted)" }}>{respondents} responded</span> : null}
          {showReady ? (
            <button className={`ready${ready ? " on" : ""}`} onClick={onToggleReady}>{ready ? "✓ You're ready" : "I'm ready"}</button>
          ) : null}
        </div>
      </div>
      {prompt ? <div className="canvasprompt">{prompt}</div> : null}

      <div className="assessbody">
        {!pulseId ? (
          <div className="assess-empty">
            {isFacilitator ? (
              <>
                <p>{timing === "prerequisite" ? "No pre-session assessment is linked yet." : "Rate the five team dynamics together to ground the session."}</p>
                <button className="btn-prim" disabled={busy} onClick={openAssessment}>{busy ? "Opening…" : "Open the assessment"}</button>
              </>
            ) : (
              <p>Waiting for the facilitator to open the assessment…</p>
            )}
          </div>
        ) : (
          <>
            {!submitted ? (
              <div className="assess-form">
                <p className="assess-lead">Rate each from 1 (strongly disagree) to 5 (strongly agree). Anonymous in aggregate.</p>
                {dyns.map((d) => (
                  <div className="asq" key={d.dynamic}>
                    <div className="asq-q"><b>{d.label}</b><span>{d.question}</span></div>
                    <div className="asopts">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button key={v} className={scores[d.dynamic] === v ? "on" : ""} onClick={() => setScores((s) => ({ ...s, [d.dynamic]: v }))}>{v}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="mactions">
                  <button className="btn-prim" disabled={!allRated || busy} onClick={submit}>{busy ? "Submitting…" : "Submit my ratings"}</button>
                </div>
              </div>
            ) : (
              <div className="assess-done">✓ Your ratings are in. Results reveal once at least 3 people respond.</div>
            )}

            <div className="assess-agg">
              <div className="aa-h">Team reading {respondents < 3 ? <span className="aa-mask">· hidden until 3 respond ({respondents}/3)</span> : null}</div>
              {dyns.map((d) => {
                const masked = d.pct == null;
                return (
                  <div className="asrow" key={d.dynamic}>
                    <div className="aslabel">{d.label}</div>
                    <div className="astrack">
                      <div className="astarget" style={{ left: `${d.target_low}%`, width: `${Math.max(0, d.target_high - d.target_low)}%` }} />
                      {!masked ? <div className="asmark" style={{ left: `${d.pct}%` }} /> : null}
                    </div>
                    <div className="asval">{masked ? "· · ·" : `${d.pct}%`}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
