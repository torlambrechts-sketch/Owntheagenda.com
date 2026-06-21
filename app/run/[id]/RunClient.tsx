"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ACTIVITY, initials } from "@/lib/util";
import { CanvasBoard } from "./CanvasBoard";
import { IdeaModule, type ModuleConfig } from "./IdeaModule";
import { ManualModule } from "./ManualModule";
import { CharterModule } from "./CharterModule";
import { AssessModule } from "./AssessModule";
import { SurveyModule } from "./SurveyModule";
import { SessionPulse } from "./SessionPulse";
import { PlanBoard } from "./PlanBoard";
import { DecisionsPanel } from "./DecisionsPanel";
import { DYNAMIC_LABEL } from "@/lib/grounding";
import type { SurveyInstrument } from "@/lib/survey";
import type { Enums, Json } from "@/types/database.types";

export type RunBlock = {
  id: string;
  ord: number;
  title: string;
  activityType: Enums<"activity_type">;
  duration: number;
  prompt: string | null;
  linkedDynamic: Enums<"team_dynamic"> | null;
  config: ModuleConfig;
  surveyId: string | null;
};
export type Participant = {
  userId: string;
  name: string;
  isFacilitator: boolean;
  ready: boolean;
};
export type Action = { id: string; text: string; owner: string | null; due: string | null; done: boolean };

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

// Drop-in modules the facilitator can add live (no config needed).
const RUN_MODULES = [
  { kind: "canvas", label: "Canvas", blurb: "Freeform board" },
  { kind: "brainstorm", label: "Brainstorm", blurb: "Gather ideas" },
  { kind: "vote", label: "Vote", blurb: "Dot-vote" },
  { kind: "discuss", label: "Discuss", blurb: "Discussion prompt" },
  { kind: "feedback", label: "Feedback", blurb: "Sort into lanes" },
  { kind: "checkin", label: "Check-in", blurb: "Opening round" },
  { kind: "outcome", label: "Outcomes", blurb: "Decisions & actions" },
  { kind: "manual", label: "Notes", blurb: "Facilitator notes" },
];

function toRunBlock(b: {
  id: string; ord: number; title: string; activity_type: Enums<"activity_type">;
  duration: number; prompt: string | null; linked_dynamic: Enums<"team_dynamic"> | null;
  config: unknown; survey_id: string | null;
}): RunBlock {
  return {
    id: b.id, ord: b.ord, title: b.title, activityType: b.activity_type,
    duration: b.duration, prompt: b.prompt, linkedDynamic: b.linked_dynamic,
    config: (b.config ?? {}) as ModuleConfig, surveyId: b.survey_id,
  };
}

export function RunClient({
  workshopId,
  workspaceId,
  teamId,
  initialPulseId,
  title,
  blocks: initialBlocks,
  instruments,
  session: initialSession,
  isFacilitator,
  userId,
  userName,
  initialParticipants,
  initialActions,
}: {
  workshopId: string;
  workspaceId: string;
  teamId: string | null;
  initialPulseId: string | null;
  title: string;
  blocks: RunBlock[];
  instruments: Record<string, SurveyInstrument>;
  session: SessionState;
  isFacilitator: boolean;
  userId: string;
  userName: string;
  initialParticipants: Participant[];
  initialActions: Action[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [blocks, setBlocks] = useState<RunBlock[]>(initialBlocks);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [surveyInsts, setSurveyInsts] = useState<{ kind: string; name: string }[]>([]);
  const [planSource, setPlanSource] = useState<string | null>(null);
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
  const [actOwnerId, setActOwnerId] = useState("");
  const [actDue, setActDue] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [endErr, setEndErr] = useState<string | null>(null);

  const sid = session.id;
  const N = blocks.length;
  // Session measures a dynamic if any block links one — enables the pre/post pulse (F5).
  const measuresDynamic = useMemo(
    () => blocks.some((b) => !!b.linkedDynamic),
    [blocks],
  );
  const block = blocks.find((b) => b.ord === session.currentBlockOrd) ?? blocks[0];
  const acting = isFacilitator && view === "facilitator";
  const moduleMode =
    block?.activityType === "brainstorm" ? "brainstorm" as const
    : block?.activityType === "vote" ? "poll" as const
    : block?.activityType === "feedback" ? "feedback" as const
    : block?.activityType === "checkin" && !!(block?.config as Record<string, unknown>)?.capture ? "brainstorm" as const
    : null;

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
      .select("id, text, owner_name, due_at, status")
      .eq("session_id", sid)
      .order("created_at", { ascending: true });
    setActions(
      (data ?? []).map((a) => ({ id: a.id, text: a.text, owner: a.owner_name, due: a.due_at, done: a.status === "done" })),
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

  const reloadBlocks = useCallback(async () => {
    const { data } = await supabase
      .from("block")
      .select("id, ord, title, activity_type, duration, prompt, linked_dynamic, config, survey_id")
      .eq("workshop_id", workshopId)
      .order("ord", { ascending: true });
    if (data) setBlocks(data.map(toRunBlock));
  }, [supabase, workshopId]);

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
            router.push(`/sessions/${sid}`);
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "block", filter: `workshop_id=eq.${workshopId}` },
        () => reloadBlocks(),
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

  // team-scoped instruments available to add as a live assessment step
  useEffect(() => {
    if (!isFacilitator) return;
    supabase.from("assessment_template").select("key, name").eq("scope", "team").order("name").then(({ data }) => {
      if (data) setSurveyInsts(data.map((t) => ({ kind: t.key, name: t.name })));
    });
  }, [supabase, isFacilitator]);

  // if this run is a scheduled follow-up, the prior session whose plan we can pull forward
  useEffect(() => {
    supabase.from("follow_up").select("source_session_id").eq("workshop_id", workshopId).not("source_session_id", "is", null).limit(1)
      .then(({ data }) => { if (data && data[0]) setPlanSource((data[0] as { source_session_id: string }).source_session_id); });
  }, [supabase, workshopId]);

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
  async function addModule(kind: string, config?: Record<string, unknown>) {
    setAdding(true);
    const { data, error } = await supabase.rpc("add_block_live", {
      p_workshop: workshopId,
      p_kind: kind,
      p_title: null,
      ...(config ? { p_config: config as Json } : {}),
    });
    setAdding(false);
    setAddOpen(false);
    if (error) { setEndErr(error.message); return; }
    await reloadBlocks();
    await phase(data as number);
  }
  const toggleAction = async (id: string) => {
    await supabase.rpc("toggle_action", { p_action: id });
  };
  async function endSession() {
    setEndErr(null);
    if (!confirm("Close the session for everyone? This finalises it and opens the readout.")) return;
    const { error } = await supabase.rpc("end_session", { p_session: sid });
    if (error) { setEndErr(error.message); return; }
    // Best-effort audit; never blocks closing the session. Records how many
    // measures were captured at sign-off.
    try { await supabase.rpc("log_event", { p_action: "session.completed", p_entity_type: "workshop", p_entity_id: workshopId, p_meta: { measures: actions.length } }); } catch { /* non-fatal */ }
  }
  async function toggleReady() {
    const me = participants.find((p) => p.userId === userId);
    await supabase.rpc("set_ready", { p_session: sid, p_ready: !me?.ready });
  }
  async function addAction() {
    if (!actText.trim()) return;
    await supabase.rpc("add_action", {
      p_session: sid,
      p_text: actText.trim(),
      ...(actOwnerId ? { p_owner_id: actOwnerId } : {}),
      ...(actDue ? { p_due: actDue } : {}),
    });
    setActText("");
    setActOwnerId("");
    setActDue("");
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

  const everyoneReady = partCount > 0 && readyCount === partCount;
  const timeUp = session.timerRunning && remaining === 0;
  function participantHint(): string {
    const t = block?.activityType;
    if (t === "checkin") return (block?.config as Record<string, unknown>)?.capture ? "Share your response" : "Reflect, then tap I'm ready";
    const map: Record<string, string> = {
      brainstorm: "Add your ideas", vote: "Cast your votes", feedback: "Add your notes",
      canvas: "Add to the board", manual: "Fill in your user manual", charter: "Contribute to the charter",
      assess: "Complete the assessment", survey: "Complete the assessment", outcome: "Discuss the outcome",
    };
    return map[t ?? ""] ?? "Discuss, then tap I'm ready";
  }
  const statusText = acting
    ? everyoneReady ? "Everyone’s ready" : `${readyCount}/${partCount} ready`
    : me?.ready ? "Ready ✓ — waiting for the group" : participantHint();

  // U2: opt-in auto-advance when the timer ends (facilitator only, once per block).
  const autoAdvancedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!acting || !timeUp || session.currentBlockOrd >= N) return;
    if (!(block?.config as Record<string, unknown>)?.autoAdvance) return;
    if (autoAdvancedRef.current === session.currentBlockOrd) return;
    autoAdvancedRef.current = session.currentBlockOrd;
    phase(session.currentBlockOrd + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acting, timeUp, session.currentBlockOrd, N]);

  // U5: facilitator keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    if (!acting) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" && session.currentBlockOrd < N) phase(session.currentBlockOrd + 1);
      else if (e.key === "ArrowLeft" && session.currentBlockOrd > 1) phase(session.currentBlockOrd - 1);
      else if (e.key === " ") { e.preventDefault(); timer(session.timerRunning ? "pause" : "start"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acting, session.currentBlockOrd, session.timerRunning, N]);

  return (
    <div className="run">
      <div className="runbar">
        <button className="runbtn" title="Previous step" disabled={!acting || session.currentBlockOrd <= 1}
          onClick={() => phase(session.currentBlockOrd - 1)}>‹</button>
        <div className="phase">
          <div className="step">Step {session.currentBlockOrd} of {N}</div>
          <div className="name">
            {block?.title}
            {block?.linkedDynamic ? (
              <span className="rb-grounded" title="Grounded in a team dynamic">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
                {DYNAMIC_LABEL[block.linkedDynamic] ?? block.linkedDynamic}
              </span>
            ) : null}
          </div>
        </div>
        <button className={`runbtn${everyoneReady && acting ? " glow" : ""}`} title="Next step" disabled={!acting || session.currentBlockOrd >= N}
          onClick={() => phase(session.currentBlockOrd + 1)}>›</button>
        <div className={`timer${timeUp ? " up" : remaining <= 30 ? " low" : ""}`}>{mmss(remaining)}</div>
        {acting ? (
          <>
            <button className="runbtn" title={session.timerRunning ? "Pause" : "Start"}
              onClick={() => timer(session.timerRunning ? "pause" : "start")}>
              {session.timerRunning ? "❚❚" : "▶"}
            </button>
            <button className="runbtn" title="Reset" onClick={() => timer("reset")}>↺</button>
            <div className="addmod-wrap" onPointerDown={(e) => e.stopPropagation()}>
              <button className="runbtn" title="Add a module" onClick={() => setAddOpen((o) => !o)}>＋</button>
              {addOpen ? (
                <div className="addmod-pop">
                  <div className="addmod-h">Add a module</div>
                  {RUN_MODULES.map((m) => (
                    <button key={m.kind} className="addmod-item" disabled={adding} onClick={() => addModule(m.kind)}>
                      <b>{m.label}</b><span>{m.blurb}</span>
                    </button>
                  ))}
                  {surveyInsts.length ? (
                    <>
                      <div className="addmod-h">Assessment</div>
                      {surveyInsts.map((s) => (
                        <button key={s.kind} className="addmod-item" disabled={adding} onClick={() => addModule("survey", { kind: s.kind })}>
                          <b>{s.name}</b><span>Anonymous team survey</span>
                        </button>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
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
        <div className={`runstatus${acting && everyoneReady ? " ready" : ""}`}>{statusText}</div>
        {measuresDynamic ? (
          <button className={`runbtn${pulseOpen ? " glow" : ""}`} title="Pulse check — did this session move the dynamic?" onClick={() => setPulseOpen((o) => !o)}>♥</button>
        ) : null}
        {isFacilitator ? (
          <div className="guide-wrap" onPointerDown={(e) => e.stopPropagation()}>
            <button className="runbtn" title="Facilitator guide" onClick={() => setGuideOpen((o) => !o)}>?</button>
            {guideOpen ? (
              <div className="guide-pop">
                <div className="guide-h">Facilitator guide</div>
                <div className="guide-sec">
                  <b>Shortcuts</b>
                  <div className="guide-k"><kbd>←</kbd><kbd>→</kbd> previous / next step</div>
                  <div className="guide-k"><kbd>Space</kbd> start / pause timer</div>
                </div>
                <div className="guide-sec">
                  <b>Tips</b>
                  <ul>
                    <li>Advance when the room shows <b>Everyone&rsquo;s ready</b>.</li>
                    <li>For silent ideation, <b>Reveal cards</b> before voting.</li>
                    <li>After a vote, <b>Promote top 3 →</b> turns winners into commitments.</li>
                    <li>Click a card to edit it or add a detail note.</li>
                  </ul>
                </div>
                <a className="guide-link" href="/help/facilitate-live-session" target="_blank" rel="noreferrer">Full guide ↗</a>
              </div>
            ) : null}
          </div>
        ) : null}
        {isFacilitator ? (
          <div className="roletag" style={{ cursor: "pointer" }}
            onClick={() => setView(view === "facilitator" ? "participant" : "facilitator")}>
            View: {view === "facilitator" ? "Facilitator" : "Participant"}
          </div>
        ) : (
          <div className="roletag">Participant</div>
        )}
        {acting ? <button className="exitbtn" onClick={endSession}>Close ▸</button> : null}
      </div>

      {blocks.length > 1 ? (
        <div className="runrail" aria-label="Run of show">
          {blocks.map((b) => {
            const cur = b.ord === session.currentBlockOrd;
            const done = b.ord < session.currentBlockOrd;
            return (
              <button
                key={b.id}
                type="button"
                className={`runrail-step${cur ? " on" : done ? " done" : ""}`}
                disabled={!acting}
                onClick={() => { if (acting) phase(b.ord); }}
                title={`${ACTIVITY[b.activityType]?.label ?? b.activityType} · ${b.title}`}
              >
                <span className="runrail-n">{done ? "✓" : b.ord}</span>
                <span className="runrail-t">{b.title}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {endErr ? (
        <div className="closegate">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <span>Can’t close yet — {endErr}</span>
          <button className="cg-x" onClick={() => setEndErr(null)}>Dismiss</button>
        </div>
      ) : null}

      {pulseOpen && measuresDynamic ? (
        <SessionPulse sessionId={sid} isFacilitator={isFacilitator} userId={userId} onClose={() => setPulseOpen(false)} />
      ) : null}

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
              isFacilitator={isFacilitator}
              showReady={!isFacilitator || view === "participant"}
              ready={!!me?.ready}
              onToggleReady={toggleReady}
            />
          </div>
        ) : block?.activityType === "manual" ? (
          <div className="stage canvasstage">
            <ManualModule
              key={session.currentBlockOrd}
              workspaceId={workspaceId}
              userId={userId}
              participants={participants.map((p) => ({ userId: p.userId, name: p.name }))}
              title={block?.title ?? "Personal user manual"}
              prompt={block?.prompt ?? null}
              stepLabel={`Personal user manual · Step ${session.currentBlockOrd} of ${N}`}
              config={(block?.config ?? {}) as { fields?: string[]; leaderFirst?: boolean; allowPass?: boolean }}
              showReady={!isFacilitator || view === "participant"}
              ready={!!me?.ready}
              onToggleReady={toggleReady}
            />
          </div>
        ) : block?.activityType === "charter" ? (
          <div className="stage canvasstage">
            <CharterModule
              key={session.currentBlockOrd}
              teamId={teamId}
              sessionId={sid}
              isFacilitator={isFacilitator}
              section={((block?.config as Record<string, unknown>)?.section as "purpose" | "goals" | "roles" | "work_methods" | "norms" | "review") ?? "review"}
              title={block?.title ?? "Team charter"}
              prompt={block?.prompt ?? null}
              stepLabel={`Team charter · Step ${session.currentBlockOrd} of ${N}`}
              showReady={!isFacilitator || view === "participant"}
              ready={!!me?.ready}
              onToggleReady={toggleReady}
            />
          </div>
        ) : block?.activityType === "assess" ? (
          <div className="stage canvasstage">
            <AssessModule
              key={session.currentBlockOrd}
              workshopId={workshopId}
              teamId={teamId}
              isFacilitator={isFacilitator}
              initialPulseId={initialPulseId}
              timing={((block?.config as Record<string, unknown>)?.timing as string) ?? "live"}
              userId={userId}
              title={block?.title ?? "Team assessment"}
              prompt={block?.prompt ?? null}
              stepLabel={`Team assessment · Step ${session.currentBlockOrd} of ${N}`}
              showReady={!isFacilitator || view === "participant"}
              ready={!!me?.ready}
              onToggleReady={toggleReady}
            />
          </div>
        ) : block?.activityType === "survey" ? (
          <div className="stage canvasstage">
            <SurveyModule
              key={session.currentBlockOrd}
              blockId={block.id}
              isFacilitator={isFacilitator}
              initialSurveyId={block.surveyId}
              instrument={instruments[((block?.config as Record<string, unknown>)?.kind as string) ?? "psych_safety_bang"] ?? null}
              timing={((block?.config as Record<string, unknown>)?.timing as string) ?? "live"}
              userId={userId}
              title={block?.title ?? "Survey"}
              prompt={block?.prompt ?? null}
              stepLabel={`Survey · Step ${session.currentBlockOrd} of ${N}`}
              showReady={!isFacilitator || view === "participant"}
              ready={!!me?.ready}
              onToggleReady={toggleReady}
            />
          </div>
        ) : moduleMode ? (
          <div className="stage canvasstage">
            <IdeaModule
              key={session.currentBlockOrd}
              sessionId={sid}
              blockOrd={session.currentBlockOrd}
              mode={moduleMode}
              title={block?.title ?? ""}
              prompt={block?.prompt ?? null}
              stepLabel={`${ACTIVITY[block!.activityType]?.label ?? ""} · Step ${session.currentBlockOrd} of ${N}`}
              config={block?.config ?? {}}
              addPlaceholder={block?.activityType === "checkin" ? "Share your response…" : undefined}
              userId={userId}
              userName={userName}
              isFacilitator={isFacilitator}
              showReady={!isFacilitator || view === "participant"}
              ready={!!me?.ready}
              onToggleReady={toggleReady}
            />
          </div>
        ) : block?.activityType === "outcome" ? (
          <div className="stage planstage">
            <div className="plan-head">
              <div className="pact">Outcome · Step {session.currentBlockOrd} of {N}</div>
              <h2>{block?.title}</h2>
              {block?.prompt ? <div className="ptext">{block.prompt}</div> : null}
            </div>
            <PlanBoard sessionId={sid} blockOrd={session.currentBlockOrd} canEdit={true} members={participants.map((p) => ({ id: p.userId, name: p.name }))} sourceSessionId={planSource} />
          </div>
        ) : (
          <div className="stage">
            <div className="stage-prompt">
              <div className="pact">
                {ACTIVITY[block?.activityType ?? "canvas"]?.label} · Step {session.currentBlockOrd} of {N}
              </div>
              <h2>{block?.title}</h2>
              {block?.prompt ? <div className="ptext">{block.prompt}</div> : null}
              <div className="stage-hint">
                Reflect and share out loud — the facilitator moves on when everyone’s ready.
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
                  {a.owner || a.due ? (
                    <span className="who">
                      {a.owner ? `Owner · ${a.owner}` : ""}
                      {a.owner && a.due ? " · " : ""}
                      {a.due ? `Due ${new Date(a.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <input className="inp" placeholder="Quick commitment…" value={actText}
                onChange={(e) => setActText(e.target.value)} style={{ marginBottom: 6 }} />
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <select className="inp" value={actOwnerId} onChange={(e) => setActOwnerId(e.target.value)} title="Owner">
                  <option value="">Owner — none</option>
                  {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
                </select>
                <input className="inp" type="date" value={actDue} onChange={(e) => setActDue(e.target.value)} title="Due date" style={{ maxWidth: 134 }} />
              </div>
              <button className="btn-prim btn-full" onClick={addAction} disabled={!actText.trim()}>Add commitment</button>
            </div>
          </div>

          <DecisionsPanel
            sessionId={sid}
            userId={userId}
            isFacilitator={isFacilitator}
            participants={participants.map((p) => ({ userId: p.userId, name: p.name }))}
          />

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
