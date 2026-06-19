"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  dynamic: string; label: string; question: string;
  pre_pct: number | null; pre_n: number; post_pct: number | null; post_n: number; delta: number | null;
};

// F5 · the before/after measurement loop. The facilitator opens a quick check
// at the start and again at the end; everyone rates the session's linked
// dynamic(s). The delta — masked below 3 responses — is the proof of movement.
export function SessionPulse({
  sessionId,
  isFacilitator,
  userId,
  onClose,
}: {
  sessionId: string;
  isFacilitator: boolean;
  userId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pre, setPre] = useState<string | null>(null);
  const [post, setPost] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [answeredPre, setAnsweredPre] = useState(false);
  const [answeredPost, setAnsweredPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from("session").select("pre_pulse_id, post_pulse_id").eq("id", sessionId).maybeSingle(),
      supabase.rpc("session_pulse_delta", { p_session: sessionId }),
    ]);
    const preId = (s as { pre_pulse_id: string | null } | null)?.pre_pulse_id ?? null;
    const postId = (s as { post_pulse_id: string | null } | null)?.post_pulse_id ?? null;
    setPre(preId);
    setPost(postId);
    setRows((d ?? []) as Row[]);
    if (preId) {
      const { count } = await supabase.from("pulse_response").select("*", { count: "exact", head: true }).eq("pulse_id", preId).eq("respondent_id", userId);
      setAnsweredPre((count ?? 0) > 0);
    }
    if (postId) {
      const { count } = await supabase.from("pulse_response").select("*", { count: "exact", head: true }).eq("pulse_id", postId).eq("respondent_id", userId);
      setAnsweredPost((count ?? 0) > 0);
    }
  }, [supabase, sessionId, userId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`spulse:${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "session", filter: `id=eq.${sessionId}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 6000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [sessionId, load, supabase]);

  const activePhase: "pre" | "post" | null =
    post && !answeredPost ? "post" : pre && !answeredPre ? "pre" : null;
  const activePulse = activePhase === "post" ? post : activePhase === "pre" ? pre : null;
  const allRated = rows.length > 0 && rows.every((r) => scores[r.dynamic]);
  const hasDelta = rows.some((r) => r.delta != null);

  async function openPhase(phase: "pre" | "post") {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("session_pulse_open", { p_session: sessionId, p_phase: phase });
    setBusy(false);
    if (error) setErr(error.message);
    else load();
  }
  async function submit() {
    if (!activePulse) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("submit_pulse_response", { p_pulse: activePulse, p_scores: scores });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (activePhase === "pre") setAnsweredPre(true); else setAnsweredPost(true);
    setScores({});
    load();
  }

  return (
    <div className="pulse-over" onClick={onClose}>
      <div className="pulse-panel" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <div className="pulse-h">
          <div>
            <div className="pact">Measure</div>
            <h2>Did this session move the needle?</h2>
          </div>
          <button className="sw-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isFacilitator ? (
          <div className="pulse-ctl">
            <button className="btn-sec sm" disabled={busy || !!pre} onClick={() => openPhase("pre")}>{pre ? "✓ Before opened" : "Open ‘before’ check"}</button>
            <button className="btn-sec sm" disabled={busy || !pre || !!post} onClick={() => openPhase("post")}>{post ? "✓ After opened" : "Open ‘after’ check"}</button>
          </div>
        ) : null}
        {err ? <div className="form-err">{err}</div> : null}

        {activePhase && rows.length ? (
          <div className="pulse-form">
            <p className="assess-lead">{activePhase === "pre" ? "Before we start — rate where the team is right now." : "After the session — rate where the team is now."} 1 = strongly disagree, 5 = strongly agree. Anonymous in aggregate.</p>
            {rows.map((r) => (
              <div className="asq" key={r.dynamic}>
                <div className="asq-q"><b>{r.label}</b><span>{r.question}</span></div>
                <div className="asopts">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} className={scores[r.dynamic] === v ? "on" : ""} onClick={() => setScores((sc) => ({ ...sc, [r.dynamic]: v }))}>{v}</button>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn-prim" disabled={!allRated || busy} onClick={submit}>{busy ? "Submitting…" : `Submit my ${activePhase === "pre" ? "before" : "after"} ratings`}</button>
          </div>
        ) : (
          <div className="pulse-wait">
            {!pre ? (
              isFacilitator ? "Open the ‘before’ check to capture a baseline." : "Waiting for the facilitator to open the pulse check…"
            ) : (answeredPre && (!post || answeredPost)) ? "✓ Your ratings are in. Results reveal once 3 people respond." : null}
          </div>
        )}

        {(pre || post) ? (
          <div className="pulse-delta">
            <div className="pd-h">Reading {hasDelta ? "" : "· before / after"}</div>
            {rows.map((r) => {
              const showDelta = r.delta != null;
              return (
                <div className="pd-row" key={r.dynamic}>
                  <div className="pd-label">{r.label}</div>
                  <div className="pd-vals">
                    <span className="pd-pre">{r.pre_pct != null ? `${r.pre_pct}%` : r.pre_n > 0 ? `· · · (${r.pre_n}/3)` : "—"}</span>
                    <span className="pd-arrow">→</span>
                    <span className="pd-post">{r.post_pct != null ? `${r.post_pct}%` : r.post_n > 0 ? `· · · (${r.post_n}/3)` : "—"}</span>
                    {showDelta ? (
                      <span className={`pd-delta${(r.delta as number) > 0 ? " up" : (r.delta as number) < 0 ? " down" : ""}`}>
                        {(r.delta as number) > 0 ? "▲" : (r.delta as number) < 0 ? "▼" : "■"} {Math.abs(r.delta as number)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="pd-note">Scores are an anonymous team average — hidden until at least 3 people respond.</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
