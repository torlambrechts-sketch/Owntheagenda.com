"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ACTIVITY, initials } from "@/lib/util";
import { CanvasBoard } from "./CanvasBoard";
import type { Enums } from "@/types/database.types";

export type RunBlock = {
  ord: number;
  title: string;
  activityType: Enums<"activity_type">;
  duration: number;
  prompt: string | null;
  linkedDynamic: Enums<"team_dynamic"> | null;
};
export type Participant = {
  userId: string;
  name: string;
  isFacilitator: boolean;
  ready: boolean;
};
export type Action = { id: string; text: string; owner: string | null; done: boolean };

type SessionState = {
  id: string;
  currentBlockOrd: number;
  timerRunning: boolean;
  timerEndsAt: string | null;
  timerRemaining: number;
};

function mmss(total: number) {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RunClient({
  workshopId,
  title,
  blocks,
  session: initialSession,
  isFacilitator,
  userId,
  userName,
  initialParticipants,
  initialActions,
}: {
  workshopId: string;
  title: string;
  blocks: RunBlock[];
  session: SessionState;
  isFacilitator: boolean;
  userId: string;
  userName: string;
  initialParticipants: Participant[];
  initialActions: Action[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<SessionState>(initialSession);
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [actions, setActions] = useState<Action[]>(initialActions);
  const [now, setNow] = useState(() => Date.now());
  const [summary, setSummary] = useState<number[]>([0, 0, 0, 0, 0]);
  const [myValue, setMyValue] = useState<number | null>(null);
  const [view, setView] = useState<"facilitator" | "participant">(
    isFacilitator ? "facilitator" : "participant",
  );
  const [actText, setActText] = useState("");
  const [actOwner, setActOwner] = useState("");

  const sid = session.id;
  const N = blocks.length;
  const block = blocks.find((b) => b.ord === session.currentBlockOrd) ?? blocks[0];
  const acting = isFacilitator && view === "facilitator";

  const reloadParticipants = useCallback(async () => {
    const { data: parts } = await supabase
      .from("participant")
      .select("user_id, is_facilitator, ready")
      .eq("session_id", sid);
    const ids = (parts ?? []).map((p) => p.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", ids)
      : { data: [] as any[] };
    const nameById = new Map(
      (profs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Member"]),
    );
    setParticipants(
      (parts ?? []).map((p) => ({
        userId: p.user_id,
        name: nameById.get(p.user_id) || "Member",
        isFacilitator: p.is_facilitator,
        ready: p.ready,
      })),
    );
  }, [supabase, sid]);

  const reloadActions = useCallback(async () => {
    const { data } = await supabase
      .from("action_item")
      .select("id, text, owner_name, status")
      .eq("session_id", sid)
      .order("created_at", { ascending: true });
    setActions(
      (data ?? []).map((a) => ({ id: a.id, text: a.text, owner: a.owner_name, done: a.status === "done" })),
    );
  }, [supabase, sid]);

  const reloadAgreement = useCallback(
    async (ord: number) => {
      const { data } = await supabase.rpc("agreement_summary", {
        p_session: sid,
        p_block_ord: ord,
      });
      const counts = [0, 0, 0, 0, 0];
      for (const r of data ?? []) counts[(r as any).value - 1] = (r as any).count;
      setSummary(counts);
      setMyValue(null);
    },
    [supabase, sid],
  );

  // join + subscribe
  useEffect(() => {
    supabase.rpc("join_session", { p_session: sid }).then(() => reloadParticipants());
    reloadAgreement(initialSession.currentBlockOrd);

    const ch = supabase
      .channel(`session:${sid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "session", filter: `id=eq.${sid}` },
        (payload) => {
          const r: any = payload.new;
          if (r.status === "ended") {
            router.push(`/workshops/${workshopId}`);
            return;
          }
          setSession((prev) => {
            if (r.current_block_ord !== prev.currentBlockOrd) reloadAgreement(r.current_block_ord);
            return {
              id: r.id,
              currentBlockOrd: r.current_block_ord,
              timerRunning: r.timer_running,
              timerEndsAt: r.timer_ends_at,
              timerRemaining: r.timer_remaining,
            };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participant", filter: `session_id=eq.${sid}` },
        () => reloadParticipants(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_item", filter: `session_id=eq.${sid}` },
        () => reloadActions(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  // 1s tick for the timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = session.timerRunning && session.timerEndsAt
    ? Math.max(0, Math.ceil((new Date(session.timerEndsAt).getTime() - now) / 1000))
    : session.timerRemaining;

  // ---- actions (facilitator) ----  (await — supabase builders are lazy)
  const phase = async (ord: number) => {
    await supabase.rpc("session_phase", { p_session: sid, p_ord: ord });
  };
  const timer = async (action: string) => {
    await supabase.rpc("session_timer", { p_session: sid, p_action: action });
  };
  const toggleAction = async (id: string) => {
    await supabase.rpc("toggle_action", { p_action: id });
  };
  async function endSession() {
    if (!confirm("End the session for everyone?")) return;
    await supabase.rpc("end_session", { p_session: sid });
  }
  async function toggleReady() {
    const me = participants.find((p) => p.userId === userId);
    await supabase.rpc("set_ready", { p_session: sid, p_ready: !me?.ready });
  }
  async function addAction() {
    if (!actText.trim()) return;
    await supabase.rpc("add_action", { p_session: sid, p_text: actText.trim(), p_owner: actOwner.trim() || undefined });
    setActText("");
    setActOwner("");
  }
  async function vote(v: number) {
    setMyValue(v);
    await supabase.rpc("submit_agreement", { p_session: sid, p_block_ord: session.currentBlockOrd, p_value: v });
    reloadAgreement(session.currentBlockOrd);
  }

  const me = participants.find((p) => p.userId === userId);
  const readyCount = participants.filter((p) => p.ready && !p.isFacilitator).length;
  const partCount = participants.filter((p) => !p.isFacilitator).length;
  const maxBar = Math.max(1, ...summary);

  return (
    <div className="run">
      <div className="runbar">
        <button className="runbtn" title="Previous step" disabled={!acting || session.currentBlockOrd <= 1}
          onClick={() => phase(session.currentBlockOrd - 1)}>‹</button>
        <div className="phase">
          <div className="step">Step {session.currentBlockOrd} of {N}</div>
          <div className="name">{block?.title}</div>
        </div>
        <button className="runbtn" title="Next step" disabled={!acting || session.currentBlockOrd >= N}
          onClick={() => phase(session.currentBlockOrd + 1)}>›</button>
        <div className={`timer${remaining <= 30 ? " low" : ""}`}>{mmss(remaining)}</div>
        {acting ? (
          <>
            <button className="runbtn" title={session.timerRunning ? "Pause" : "Start"}
              onClick={() => timer(session.timerRunning ? "pause" : "start")}>
              {session.timerRunning ? "❚❚" : "▶"}
            </button>
            <button className="runbtn" title="Reset" onClick={() => timer("reset")}>↺</button>
          </>
        ) : null}
        <div className="sp" />
        <div className="presence">
          {participants.map((p) => (
            <span className={`pp${p.ready ? " ready" : ""}`} key={p.userId} title={p.name}>
              <span className="av sm">{initials(p.name)}</span>
              {p.isFacilitator ? "Facilitator" : <span className="dotr" />}
            </span>
          ))}
        </div>
        {isFacilitator ? (
          <div className="roletag" style={{ cursor: "pointer" }}
            onClick={() => setView(view === "facilitator" ? "participant" : "facilitator")}>
            View: {view === "facilitator" ? "Facilitator" : "Participant"}
          </div>
        ) : (
          <div className="roletag">Participant</div>
        )}
        {acting ? <button className="exitbtn" onClick={endSession}>End</button> : null}
      </div>

      <div className="runbody">
        {block?.activityType === "canvas" ? (
          <div className="stage canvasstage">
            <CanvasBoard
              key={session.currentBlockOrd}
              sessionId={sid}
              blockOrd={session.currentBlockOrd}
              title={block?.title ?? "Canvas"}
              prompt={block?.prompt ?? null}
              stepLabel={`Canvas · Step ${session.currentBlockOrd} of ${N}`}
              userName={userName}
              showReady={!isFacilitator || view === "participant"}
              ready={!!me?.ready}
              onToggleReady={toggleReady}
            />
          </div>
        ) : (
          <div className="stage">
            <div className="stage-prompt">
              <div className="pact">
                {ACTIVITY[block?.activityType ?? "canvas"]?.label} · Step {session.currentBlockOrd} of {N}
              </div>
              <h2>{block?.title}</h2>
              <div className="ptext">
                {block?.prompt || "Discuss this step together. The facilitator advances when you're ready."}
              </div>
              {!isFacilitator || view === "participant" ? (
                <button className={`ready${me?.ready ? " on" : ""}`} onClick={toggleReady}>
                  {me?.ready ? "✓ You're ready" : "I'm ready"}
                </button>
              ) : null}
            </div>
          </div>
        )}

        <aside className="runside">
          <div className="rs">
            <h5>Run of show {acting ? <span style={{ color: "var(--faint)" }}>tap to jump</span> : null}</h5>
            {blocks.map((b) => {
              const state = b.ord < session.currentBlockOrd ? "done" : b.ord === session.currentBlockOrd ? "now" : "";
              return (
                <div
                  className={`mini-step ${state}${acting ? " click" : ""}`}
                  key={b.ord}
                  onClick={() => acting && phase(b.ord)}
                >
                  <span className="n">{b.ord < session.currentBlockOrd ? "✓" : b.ord}</span>
                  {b.title}
                </div>
              );
            })}
          </div>

          <div className="rs">
            <h5>Agreement · fist of five</h5>
            <div className="fist">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} className={myValue === v ? "sel" : ""} onClick={() => vote(v)}>{v}</button>
              ))}
            </div>
            <div className="fistbars">
              {summary.map((c, i) => (
                <div className="fbwrap" key={i}>
                  <div className="fb" style={{ height: `${(c / maxBar) * 100}%` }} />
                  <div className="fbn">{i + 1}</div>
                </div>
              ))}
            </div>
            <div className="consent-note" style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>
              5 = fully on board · 1 = serious concern. Anonymous in aggregate.
            </div>
          </div>

          <div className="rs">
            <h5>
              Commitments
              <span style={{ color: "var(--faint)" }}>{actions.length}</span>
            </h5>
            {actions.map((a) => (
              <div className={`actrow${a.done ? " done" : ""}`} key={a.id}>
                <div className={`chk${a.done ? " on" : ""}`} onClick={() => toggleAction(a.id)} />
                <div className="txt">
                  {a.text}
                  {a.owner ? <span className="who">Owner · {a.owner}</span> : null}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <input className="inp" placeholder="Decision or commitment…" value={actText}
                onChange={(e) => setActText(e.target.value)} style={{ marginBottom: 6 }} />
              <div style={{ display: "flex", gap: 6 }}>
                <input className="inp" placeholder="Owner" value={actOwner} onChange={(e) => setActOwner(e.target.value)} />
                <button className="btn-prim" onClick={addAction} disabled={!actText.trim()}>Add</button>
              </div>
            </div>
          </div>

          <div className="rs">
            <h5>In the room <span style={{ color: "var(--faint)" }}>{readyCount}/{partCount} ready</span></h5>
            <div className="presence">
              {participants.map((p) => (
                <span className={`pp${p.ready ? " ready" : ""}`} key={p.userId}>
                  <span className="av sm">{initials(p.name)}</span>
                  {p.name.split(" ")[0]}
                  <span className="dotr" />
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
