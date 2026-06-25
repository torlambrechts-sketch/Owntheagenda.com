"use client";

// Design-taxonomy run modules + the per-block dispatcher for the rebuilt RUN
// COCKPIT. These render the NEW block types (checkin, framing, discussion,
// breakout, vote, decision, actions, reflect, break, canvas) and map LEGACY
// activity types onto the closest new renderer. The session engine, presence,
// timer and realtime subscriptions all live in RunClient — these modules only
// own per-block content + persistence.
//
// Persistence reuses existing tables (no new tables invented):
//   - checkin / discussion / breakout / reflect / vote-options -> `idea`
//     (lane namespaces: checkin, point, group:<name>, reflect, option)
//   - vote tallies -> `idea_vote` via idea_vote_toggle RPC
//   - actions -> `action_item` via add_action RPC / direct insert under RLS
//   - decisions -> `decision` (filtered by block_ord)
//   - canvas -> existing CanvasBoard (rendered by RunClient)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/util";
import { WA, PHASE_VIS, Icon, actIcon } from "@/app/(app)/workshops/visuals";
import { phaseOf, PHASE_LABEL, type PhaseKey, type Activity } from "@/app/(app)/workshops/blocks";
import { configText, configList } from "@/app/(app)/workshops/blockConfig";

type ConfigT = Record<string, unknown>;

// Map any activity_type (design or legacy) to a renderer key. Unknown -> fallback.
export type RendererKey =
  | "checkin" | "framing" | "discussion" | "breakout" | "vote" | "decision"
  | "actions" | "reflect" | "break" | "canvas"
  | "survey" | "assess" | "charter" | "manual" | "ideaBrainstorm" | "outcome"
  | "fallback";

// LEGACY aliases reuse the closest new renderer (or existing module).
export function rendererFor(type: string): RendererKey {
  switch (type) {
    // design taxonomy
    case "checkin": return "checkin";
    case "framing": return "framing";
    case "discussion": return "discussion";
    case "breakout": return "breakout";
    case "vote": return "vote";
    case "decision": return "decision";
    case "actions": return "actions";
    case "reflect": return "reflect";
    case "break": return "break";
    case "canvas": return "canvas";
    // legacy aliases -> closest new renderer
    case "discuss": return "discussion";
    case "brainstorm": return "ideaBrainstorm"; // keep the rich IdeaModule board
    case "hmw": return "ideaBrainstorm";
    case "feedback": return "breakout";
    case "retrospective": return "reflect";
    case "outcome": return "outcome"; // keep the existing PlanBoard outcome path
    case "charter": return "framing";
    case "manual": return "framing";
    // existing assessment modules kept as-is
    case "assess": return "assess";
    case "survey": return "survey";
    default: return "fallback";
  }
}

// ---------- shared bits ----------

const sharedReady = (showReady: boolean, ready: boolean, onToggleReady: () => void) =>
  showReady ? (
    <button
      onClick={onToggleReady}
      style={{
        border: ready ? `1px solid ${WA.accent}` : `1px solid ${WA.cardBorder}`,
        background: ready ? WA.accent : "#fff",
        color: ready ? "#fff" : WA.ink2,
        borderRadius: 999,
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {ready ? "✓ You're ready" : "I'm ready"}
    </button>
  ) : null;

export type ModuleProps = {
  type: Activity;
  sessionId: string;
  blockOrd: number;
  title: string;
  prompt: string | null;
  config: ConfigT;
  userId: string;
  userName: string;
  isFacilitator: boolean;
  acting: boolean; // facilitator + facilitator-view
  showReady: boolean;
  ready: boolean;
  onToggleReady: () => void;
  participants: { userId: string; name: string }[];
};

// A small typed view of the `idea` rows these modules use.
type IdeaRow = {
  id: string;
  lane: string | null;
  text: string;
  detail: string | null;
  authorId: string | null;
  authorName: string | null;
};
const IDEA_COLS = "id, lane, text, detail, author_id, author_name";
function mapIdea(r: any): IdeaRow {
  return {
    id: r.id, lane: r.lane ?? null, text: r.text ?? "", detail: r.detail ?? null,
    authorId: r.author_id ?? null, authorName: r.author_name ?? null,
  };
}

// Hook: load + realtime-subscribe to the `idea` rows for this block.
function useBlockIdeas(sessionId: string, blockOrd: number) {
  const supabase = useMemo(() => createClient(), []);
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("idea")
      .select(IDEA_COLS)
      .eq("session_id", sessionId)
      .eq("block_ord", blockOrd)
      .order("created_at", { ascending: true });
    setIdeas((data ?? []).map(mapIdea));
  }, [supabase, sessionId, blockOrd]);
  useEffect(() => {
    load();
    const ch = supabase
      .channel(`runmod-idea:${sessionId}:${blockOrd}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "idea", filter: `session_id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as any)?.id;
          if (id) setIdeas((prev) => prev.filter((i) => i.id !== id));
          return;
        }
        const r = p.new as any;
        if (!r || r.block_ord !== blockOrd) return;
        const idea = mapIdea(r);
        setIdeas((prev) => {
          const i = prev.findIndex((x) => x.id === idea.id);
          if (i === -1) return [...prev, idea];
          const next = prev.slice();
          next[i] = idea;
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, blockOrd]);
  return { supabase, ideas, reload: load, setIdeas };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${WA.cardBorder}`,
    borderRadius: 8,
    padding: "9px 11px",
    fontSize: 13.5,
    fontFamily: "inherit",
    color: WA.ink,
    background: "#fff",
  };
}
function primBtn(disabled = false): React.CSSProperties {
  return {
    border: "none",
    background: disabled ? WA.faint2 : WA.accent,
    color: "#fff",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
}
function cardStyle(): React.CSSProperties {
  return {
    background: "#fff",
    border: `1px solid ${WA.cardBorder}`,
    borderRadius: 10,
    padding: "11px 13px",
    fontSize: 13.5,
    color: WA.ink,
    lineHeight: 1.5,
  };
}
function firstName(n: string | null | undefined) {
  return n ? n.split(" ")[0] : "";
}

// ===================================================================
// CHECK-IN — one short response per person, lane 'checkin'
// ===================================================================
function CheckinModule(p: ModuleProps) {
  const { ideas, supabase } = useBlockIdeas(p.sessionId, p.blockOrd);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const question = configText(p.type, p.config, "question") || p.prompt || "How are you arriving?";
  const responses = ideas.filter((i) => i.lane === "checkin");
  const mine = responses.find((i) => i.authorId === p.userId);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (mine) {
      const { error } = await supabase.from("idea").update({ text }).eq("id", mine.id);
      if (error) setErr(error.message);
      return;
    }
    const { error } = await supabase.from("idea").insert({
      session_id: p.sessionId, block_ord: p.blockOrd, lane: "checkin",
      text, author_name: p.userName,
    });
    if (error) { setErr(error.message); setDraft(text); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...cardStyle(), background: WA.kpiBg, borderColor: WA.cardBorder, fontSize: 15, fontWeight: 500 }}>
        {question}
      </div>
      {p.showReady ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={inputStyle()}
            placeholder="Your one-word / one-line answer…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          <button style={primBtn(!draft.trim())} disabled={!draft.trim()} onClick={submit}>
            {mine ? "Update" : "Share"}
          </button>
        </div>
      ) : null}
      {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {responses.map((r) => (
          <div key={r.id} style={{ ...cardStyle(), display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
            <span style={{
              width: 24, height: 24, borderRadius: "50%", background: WA.kpiBg,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: WA.muted, flex: "none",
            }}>{initials(r.authorName)}</span>
            <b style={{ fontWeight: 600 }}>{r.text}</b>
            <span style={{ color: WA.faint, fontSize: 11.5 }}>{firstName(r.authorName)}</span>
          </div>
        ))}
        {responses.length === 0 ? <div style={{ color: WA.faint, fontSize: 13 }}>No check-ins yet.</div> : null}
      </div>
    </div>
  );
}

// ===================================================================
// FRAMING — read-only statement + objectives (also serves legacy charter/manual)
// ===================================================================
function FramingModule(p: ModuleProps) {
  const statement = configText(p.type, p.config, "statement") || p.prompt || "";
  const objectives = configList(p.type, p.config, "objectives");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {statement ? (
        <div style={{ ...cardStyle(), fontSize: 16, lineHeight: 1.6, fontFamily: WA.serif, borderLeft: `3px solid ${WA.accent}` }}>
          {statement}
        </div>
      ) : null}
      {objectives.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: WA.muted }}>Objectives</div>
          {objectives.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: WA.accent, marginTop: 2 }}><Icon name="Check" size={15} /></span>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: WA.ink2 }}>{o}</span>
            </div>
          ))}
        </div>
      ) : null}
      {sharedReady(p.showReady, p.ready, p.onToggleReady)}
    </div>
  );
}

// ===================================================================
// DISCUSSION — shared talking points, lane 'point' (legacy discuss too)
// ===================================================================
function DiscussionModule(p: ModuleProps) {
  const { ideas, supabase } = useBlockIdeas(p.sessionId, p.blockOrd);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const seededRef = useRef(false);
  const seedPoints = configList(p.type, p.config, "seedPoints");
  const points = ideas.filter((i) => i.lane === "point");

  // Facilitator seeds the talking points once (idempotent via idea_seed RPC).
  useEffect(() => {
    if (!p.isFacilitator || seededRef.current || !seedPoints.length || points.length) return;
    seededRef.current = true;
    supabase.rpc("idea_seed", { p_session: p.sessionId, p_block_ord: p.blockOrd, p_texts: seedPoints });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.isFacilitator, points.length]);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const { error } = await supabase.from("idea").insert({
      session_id: p.sessionId, block_ord: p.blockOrd, lane: "point",
      text, author_name: p.userName,
    });
    if (error) { setErr(error.message); setDraft(text); }
  }
  async function remove(id: string) {
    await supabase.from("idea").delete().eq("id", id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={inputStyle()}
          placeholder="Put a point on the table…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <button style={primBtn(!draft.trim())} disabled={!draft.trim()} onClick={add}>Add</button>
      </div>
      {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {points.map((i) => (
          <div key={i.id} style={{ ...cardStyle(), display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ color: WA.accent, marginTop: 2 }}><Icon name="MessageCircle" size={15} /></span>
            <span style={{ flex: 1 }}>{i.text}</span>
            <span style={{ color: WA.faint, fontSize: 11.5 }}>{firstName(i.authorName)}</span>
            {i.authorId === p.userId || p.isFacilitator ? (
              <button onClick={() => remove(i.id)} title="Remove" style={{ border: "none", background: "none", color: WA.faint2, cursor: "pointer", fontSize: 13 }}>✕</button>
            ) : null}
          </div>
        ))}
        {points.length === 0 ? <div style={{ color: WA.faint, fontSize: 13 }}>No points yet — add the first.</div> : null}
      </div>
      {sharedReady(p.showReady, p.ready, p.onToggleReady)}
    </div>
  );
}

// ===================================================================
// BREAKOUT — per-group findings, lane 'group:<name>' (legacy feedback too)
// ===================================================================
function BreakoutModule(p: ModuleProps) {
  const { ideas, supabase } = useBlockIdeas(p.sessionId, p.blockOrd);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const task = configText(p.type, p.config, "task");
  const brief = configText(p.type, p.config, "brief") || p.prompt || "";
  const groups = configList(p.type, p.config, "groups");
  const groupNames = groups.length ? groups : ["Group A", "Group B"];

  async function add(group: string) {
    const text = (drafts[group] ?? "").trim();
    if (!text) return;
    setDrafts((d) => ({ ...d, [group]: "" }));
    const { error } = await supabase.from("idea").insert({
      session_id: p.sessionId, block_ord: p.blockOrd, lane: `group:${group}`,
      text, author_name: p.userName,
    });
    if (error) { setErr(error.message); setDrafts((d) => ({ ...d, [group]: text })); }
  }
  async function remove(id: string) {
    await supabase.from("idea").delete().eq("id", id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {task ? <div style={{ ...cardStyle(), background: WA.kpiBg, fontWeight: 500 }}>{task}</div> : null}
      {brief ? <div style={{ fontSize: 13, color: WA.muted, lineHeight: 1.5 }}>{brief}</div> : null}
      {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: `repeat(${Math.min(groupNames.length, 3)}, minmax(0,1fr))` }}>
        {groupNames.map((g) => {
          const items = ideas.filter((i) => i.lane === `group:${g}`);
          return (
            <div key={g} style={{ display: "flex", flexDirection: "column", gap: 8, background: WA.segBg2, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: WA.ink2 }}>{g} <span style={{ color: WA.faint, fontWeight: 500 }}>{items.length}</span></div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ ...inputStyle(), fontSize: 12.5, padding: "7px 9px" }}
                  placeholder="Add a finding…"
                  value={drafts[g] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [g]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") add(g); }}
                />
              </div>
              {items.map((i) => (
                <div key={i.id} style={{ ...cardStyle(), padding: "8px 10px", fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ flex: 1 }}>{i.text}</span>
                  {i.authorId === p.userId || p.isFacilitator ? (
                    <button onClick={() => remove(i.id)} title="Remove" style={{ border: "none", background: "none", color: WA.faint2, cursor: "pointer", fontSize: 12 }}>✕</button>
                  ) : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {sharedReady(p.showReady, p.ready, p.onToggleReady)}
    </div>
  );
}

// ===================================================================
// VOTE — options seeded as lane 'option', tallies via idea_vote_toggle
// ===================================================================
function VoteModule(p: ModuleProps) {
  const { ideas, supabase } = useBlockIdeas(p.sessionId, p.blockOrd);
  const [votes, setVotes] = useState<{ ideaId: string; voterId: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const seededRef = useRef(false);
  const question = configText(p.type, p.config, "question") || p.prompt || "";
  const options = configList(p.type, p.config, "options");
  const opts = ideas.filter((i) => i.lane === "option");

  // load + subscribe votes
  useEffect(() => {
    let active = true;
    const loadVotes = async () => {
      const { data } = await supabase.from("idea_vote").select("idea_id, voter_id").eq("session_id", p.sessionId).eq("block_ord", p.blockOrd);
      if (active) setVotes((data ?? []).map((v: any) => ({ ideaId: v.idea_id, voterId: v.voter_id })));
    };
    loadVotes();
    const ch = supabase
      .channel(`runmod-vote:${p.sessionId}:${p.blockOrd}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_vote", filter: `session_id=eq.${p.sessionId}` }, (pl) => {
        if (pl.eventType === "INSERT") {
          const r = pl.new as any;
          if (r.block_ord !== p.blockOrd) return;
          setVotes((prev) => prev.some((v) => v.ideaId === r.idea_id && v.voterId === r.voter_id) ? prev : [...prev, { ideaId: r.idea_id, voterId: r.voter_id }]);
        } else if (pl.eventType === "DELETE") {
          const r = pl.old as any;
          setVotes((prev) => prev.filter((v) => !(v.ideaId === r.idea_id && v.voterId === r.voter_id)));
        }
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sessionId, p.blockOrd]);

  // Facilitator seeds the options once.
  useEffect(() => {
    if (!p.isFacilitator || seededRef.current || !options.length || opts.length) return;
    seededRef.current = true;
    supabase.rpc("idea_seed", { p_session: p.sessionId, p_block_ord: p.blockOrd, p_texts: options });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.isFacilitator, opts.length]);

  const countFor = (id: string) => votes.filter((v) => v.ideaId === id).length;
  const iVoted = (id: string) => votes.some((v) => v.ideaId === id && v.voterId === p.userId);
  const max = Math.max(1, ...opts.map((o) => countFor(o.id)));
  const ranked = [...opts].sort((a, b) => countFor(b.id) - countFor(a.id));

  async function toggle(id: string) {
    const had = iVoted(id);
    setVotes((prev) => had ? prev.filter((v) => !(v.ideaId === id && v.voterId === p.userId)) : [...prev, { ideaId: id, voterId: p.userId }]);
    const { error } = await supabase.rpc("idea_vote_toggle", { p_idea: id });
    if (error) setErr(error.message);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {question ? <div style={{ ...cardStyle(), background: WA.kpiBg, fontWeight: 500 }}>{question}</div> : null}
      {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
      {opts.length === 0 ? (
        <div style={{ color: WA.faint, fontSize: 13 }}>
          {p.isFacilitator ? "Add options in the builder, or they will seed automatically." : "Waiting for the facilitator to open voting…"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ranked.map((o) => {
            const c = countFor(o.id);
            const mine = iVoted(o.id);
            return (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => toggle(o.id)}
                  title={mine ? "Remove your vote" : "Vote"}
                  style={{
                    width: 26, height: 26, borderRadius: "50%", flex: "none", cursor: "pointer",
                    border: mine ? `1px solid ${WA.accent}` : `1px solid ${WA.cardBorder}`,
                    background: mine ? WA.accent : "#fff",
                  }}
                />
                <div style={{ flex: 1, ...cardStyle(), padding: "8px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 5 }}>
                    <span>{o.text}</span><b>{c}</b>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: WA.segBg }}>
                    <div style={{ height: "100%", borderRadius: 4, background: WA.accent, width: `${(c / max) * 100}%`, transition: "width .3s" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {sharedReady(p.showReady, p.ready, p.onToggleReady)}
    </div>
  );
}

// ===================================================================
// ACTIONS — SMART action capture into action_item (priority + detail)
// ===================================================================
function ActionsModule(p: ModuleProps) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<{ id: string; text: string; owner: string | null; due: string | null; priority: string | null; detail: string | null; status: string }[]>([]);
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("med");
  const [detail, setDetail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const instruction = configText(p.type, p.config, "prompt") || p.prompt || "For each commitment: who, what, by when.";

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("action_item")
      .select("id, text, owner_name, due_at, priority, detail, status")
      .eq("session_id", p.sessionId)
      .order("created_at", { ascending: true });
    setItems((data ?? []).map((a: any) => ({ id: a.id, text: a.text, owner: a.owner_name, due: a.due_at, priority: a.priority, detail: a.detail, status: a.status })));
  }, [supabase, p.sessionId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`runmod-act:${p.sessionId}:${p.blockOrd}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "action_item", filter: `session_id=eq.${p.sessionId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sessionId]);

  async function add() {
    const t = text.trim();
    if (!t) return;
    setErr(null);
    // Reuse add_action RPC for text/owner/due, then patch priority+detail (new columns).
    const { data, error } = await supabase.rpc("add_action", {
      p_session: p.sessionId,
      p_text: t,
      ...(owner ? { p_owner: owner } : {}),
      ...(due ? { p_due: due } : {}),
    });
    if (error) { setErr(error.message); return; }
    const id = (data as any)?.id;
    if (id && (priority !== "med" || detail.trim())) {
      await supabase.from("action_item").update({ priority, detail: detail.trim() || null }).eq("id", id);
    }
    setText(""); setOwner(""); setDue(""); setPriority("med"); setDetail("");
  }
  async function toggle(id: string) {
    await supabase.rpc("toggle_action", { p_action: id });
  }

  const prClr: Record<string, string> = { high: "#b45309", med: WA.muted, low: WA.faint };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, color: WA.muted, lineHeight: 1.5 }}>{instruction}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((a) => (
          <div key={a.id} style={{ ...cardStyle(), display: "flex", alignItems: "flex-start", gap: 10, opacity: a.status === "done" ? 0.6 : 1 }}>
            <button
              onClick={() => toggle(a.id)}
              style={{
                width: 18, height: 18, borderRadius: 5, flex: "none", marginTop: 1, cursor: "pointer",
                border: `1px solid ${a.status === "done" ? WA.accent : WA.cardBorder}`,
                background: a.status === "done" ? WA.accent : "#fff", color: "#fff", fontSize: 11, lineHeight: 1,
              }}
            >{a.status === "done" ? "✓" : ""}</button>
            <div style={{ flex: 1 }}>
              <div style={{ textDecoration: a.status === "done" ? "line-through" : "none" }}>{a.text}</div>
              {a.detail ? <div style={{ fontSize: 12, color: WA.faint, marginTop: 2 }}>{a.detail}</div> : null}
              <div style={{ fontSize: 11.5, color: WA.faint, marginTop: 3, display: "flex", gap: 8 }}>
                {a.owner ? <span>Owner · {a.owner}</span> : null}
                {a.due ? <span>Due {new Date(a.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span> : null}
                {a.priority ? <span style={{ color: prClr[a.priority] ?? WA.faint, fontWeight: 600 }}>{a.priority.toUpperCase()}</span> : null}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 ? <div style={{ color: WA.faint, fontSize: 13 }}>No actions yet.</div> : null}
      </div>
      {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
      {p.acting || p.showReady ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: WA.segBg2, borderRadius: 10, padding: 12 }}>
          <input style={inputStyle()} placeholder="What needs to happen?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <input style={inputStyle()} placeholder="Detail (optional)…" value={detail} onChange={(e) => setDetail(e.target.value)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select style={{ ...inputStyle(), maxWidth: 160 }} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Owner — none</option>
              {p.participants.map((m) => <option key={m.userId} value={m.name}>{m.name}</option>)}
            </select>
            <input style={{ ...inputStyle(), maxWidth: 150 }} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <select style={{ ...inputStyle(), maxWidth: 120 }} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
            <button style={primBtn(!text.trim())} disabled={!text.trim()} onClick={add}>Add action</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ===================================================================
// REFLECT — private-ish reflections, lane 'reflect' (legacy retrospective)
// ===================================================================
function ReflectModule(p: ModuleProps) {
  const { ideas, supabase } = useBlockIdeas(p.sessionId, p.blockOrd);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const promptText = configText(p.type, p.config, "prompt") || p.prompt || "What will you take away?";
  const responses = ideas.filter((i) => i.lane === "reflect");
  const mine = responses.find((i) => i.authorId === p.userId);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft(""); setNote("");
    const payload = { text, detail: note.trim() || null };
    if (mine) {
      const { error } = await supabase.from("idea").update(payload).eq("id", mine.id);
      if (error) setErr(error.message);
      return;
    }
    const { error } = await supabase.from("idea").insert({
      session_id: p.sessionId, block_ord: p.blockOrd, lane: "reflect",
      ...payload, author_name: p.userName,
    });
    if (error) { setErr(error.message); setDraft(text); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...cardStyle(), background: WA.kpiBg, fontWeight: 500 }}>{promptText}</div>
      {p.showReady ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={inputStyle()} placeholder="Your reflection…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <input style={inputStyle()} placeholder="Optional note…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button style={{ ...primBtn(!draft.trim()), alignSelf: "flex-start" }} disabled={!draft.trim()} onClick={submit}>{mine ? "Update" : "Share reflection"}</button>
        </div>
      ) : null}
      {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {responses.map((r) => (
          <div key={r.id} style={cardStyle()}>
            <div>{r.text}</div>
            {r.detail ? <div style={{ fontSize: 12, color: WA.faint, marginTop: 3 }}>{r.detail}</div> : null}
            <div style={{ fontSize: 11.5, color: WA.faint, marginTop: 4 }}>{firstName(r.authorName)}</div>
          </div>
        ))}
        {responses.length === 0 ? <div style={{ color: WA.faint, fontSize: 13 }}>No reflections yet.</div> : null}
      </div>
    </div>
  );
}

// ===================================================================
// BREAK — calm timer-led message
// ===================================================================
function BreakModule(p: ModuleProps) {
  const message = configText(p.type, p.config, "message") || p.prompt || "Stretch, refill, reset.";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "48px 24px", textAlign: "center" }}>
      <span style={{ color: WA.accent }}><Icon name="Coffee" size={44} sw={1.5} /></span>
      <div style={{ fontFamily: WA.serif, fontSize: 24, color: WA.ink }}>Break</div>
      <div style={{ fontSize: 15, color: WA.muted, maxWidth: 420, lineHeight: 1.5 }}>{message}</div>
      {sharedReady(p.showReady, p.ready, p.onToggleReady)}
    </div>
  );
}

// ===================================================================
// DECISION — proposals into the `decision` table, filtered by block_ord
// ===================================================================
function DecisionModule(p: ModuleProps) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<{ id: string; title: string; rationale: string | null; status: string }[]>([]);
  const [decisionText, setDecisionText] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const seededRef = useRef(false);
  const proposals = configList(p.type, p.config, "proposals");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("decision")
      .select("id, title, rationale, status, block_ord")
      .eq("session_id", p.sessionId)
      .order("created_at", { ascending: true });
    setRows((data ?? []).filter((d: any) => d.block_ord === p.blockOrd).map((d: any) => ({ id: d.id, title: d.title, rationale: d.rationale, status: d.status })));
  }, [supabase, p.sessionId, p.blockOrd]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`runmod-dec:${p.sessionId}:${p.blockOrd}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decision", filter: `session_id=eq.${p.sessionId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sessionId, p.blockOrd]);

  // Facilitator seeds proposals once (create_decision per proposal under this block).
  useEffect(() => {
    if (!p.isFacilitator || seededRef.current || !proposals.length || rows.length) return;
    seededRef.current = true;
    (async () => {
      for (const title of proposals) {
        const { data } = await supabase.rpc("create_decision", { p_session: p.sessionId, p_title: title });
        const id = (data as any)?.id;
        // stamp block_ord (column exists) so it scopes to this block
        if (id) await supabase.from("decision").update({ block_ord: p.blockOrd }).eq("id", id);
      }
      load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.isFacilitator, rows.length]);

  async function addProposal(title: string) {
    const { data, error } = await supabase.rpc("create_decision", { p_session: p.sessionId, p_title: title });
    if (error) { setErr(error.message); return; }
    const id = (data as any)?.id;
    if (id) await supabase.from("decision").update({ block_ord: p.blockOrd }).eq("id", id);
    load();
  }
  async function decide(id: string) {
    const text = (decisionText[id] ?? "").trim();
    const { error } = await supabase.from("decision").update({
      rationale: text || null, status: "committed", decider_user_id: p.userId,
    }).eq("id", id);
    if (error) { setErr(error.message); return; }
    setDecisionText((s) => ({ ...s, [id]: "" }));
    load();
  }
  async function reopen(id: string) {
    await supabase.from("decision").update({ status: "draft" }).eq("id", id);
    load();
  }

  const [newTitle, setNewTitle] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
      {rows.map((d) => {
        const committed = d.status === "committed";
        return (
          <div key={d.id} style={{ ...cardStyle(), borderLeft: `3px solid ${committed ? WA.accent : WA.cardBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px",
                padding: "2px 8px", borderRadius: 999,
                background: committed ? "#dcfce7" : WA.segBg, color: committed ? "#166534" : WA.muted,
              }}>{committed ? "Decided" : "Open"}</span>
              <b style={{ flex: 1, fontWeight: 600 }}>{d.title}</b>
            </div>
            {committed ? (
              <>
                {d.rationale ? <div style={{ fontSize: 13, color: WA.ink2, marginTop: 8, lineHeight: 1.5 }}>{d.rationale}</div> : null}
                {p.acting ? <button onClick={() => reopen(d.id)} style={{ marginTop: 8, border: "none", background: "none", color: WA.faint, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Reopen</button> : null}
              </>
            ) : p.acting ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <input style={inputStyle()} placeholder="The decision we are making…" value={decisionText[d.id] ?? ""} onChange={(e) => setDecisionText((s) => ({ ...s, [d.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") decide(d.id); }} />
                <button style={primBtn()} onClick={() => decide(d.id)}>Decide ▸</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: WA.faint, marginTop: 6 }}>Awaiting decision…</div>
            )}
          </div>
        );
      })}
      {rows.length === 0 ? <div style={{ color: WA.faint, fontSize: 13 }}>No proposals yet.</div> : null}
      {p.acting ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input style={inputStyle()} placeholder="Add a proposal to decide…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) { addProposal(newTitle.trim()); setNewTitle(""); } }} />
          <button style={primBtn(!newTitle.trim())} disabled={!newTitle.trim()} onClick={() => { addProposal(newTitle.trim()); setNewTitle(""); }}>Add</button>
        </div>
      ) : null}
    </div>
  );
}

// ===================================================================
// FALLBACK — safe title + prompt, never crashes
// ===================================================================
function FallbackModule(p: ModuleProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {p.prompt ? <div style={{ ...cardStyle(), background: WA.kpiBg, lineHeight: 1.5 }}>{p.prompt}</div> : null}
      <div style={{ fontSize: 13, color: WA.muted }}>
        Discuss out loud — the facilitator moves on when everyone is ready.
      </div>
      {sharedReady(p.showReady, p.ready, p.onToggleReady)}
    </div>
  );
}

// ===================================================================
// DISPATCHER — picks the renderer for the design + legacy types this file owns.
// Returns null for the renderer keys handled by RunClient's existing paths
// (canvas / survey / assess / charter-as-CharterModule / manual / ideaBrainstorm /
// outcome) so the caller can keep those code paths.
// ===================================================================
export function DesignModule(props: ModuleProps): JSX.Element | null {
  const key = rendererFor(props.type);
  switch (key) {
    case "checkin": return <CheckinModule {...props} />;
    case "framing": return <FramingModule {...props} />;
    case "discussion": return <DiscussionModule {...props} />;
    case "breakout": return <BreakoutModule {...props} />;
    case "vote": return <VoteModule {...props} />;
    case "decision": return <DecisionModule {...props} />;
    case "actions": return <ActionsModule {...props} />;
    case "reflect": return <ReflectModule {...props} />;
    case "break": return <BreakModule {...props} />;
    case "fallback": return <FallbackModule {...props} />;
    // these keys are rendered by RunClient's existing code paths:
    case "canvas":
    case "survey":
    case "assess":
    case "charter":
    case "manual":
    case "ideaBrainstorm":
    case "outcome":
      return null;
    default: return <FallbackModule {...props} />;
  }
}

// ===================================================================
// REACTION BAR — floating emoji bursts (presentation only, ephemeral local state)
// ===================================================================
const BURST_EMOJI = ["👍", "🙌", "🎯", "💡", "🔥", "❤️"] as const;
let burstSeq = 0;
export function ReactionBar() {
  const [bursts, setBursts] = useState<{ id: number; emoji: string; x: number }[]>([]);
  function fire(emoji: string) {
    const id = ++burstSeq;
    const x = 10 + Math.random() * 70;
    setBursts((b) => [...b, { id, emoji, x }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 2200);
  }
  return (
    <div style={{ position: "relative", display: "flex", gap: 6, alignItems: "center" }}>
      {BURST_EMOJI.map((e) => (
        <button
          key={e}
          onClick={() => fire(e)}
          style={{
            border: `1px solid ${WA.cardBorder}`, background: "#fff", borderRadius: 999,
            width: 36, height: 36, fontSize: 16, cursor: "pointer", lineHeight: 1,
          }}
          title="React"
        >{e}</button>
      ))}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
        {bursts.map((b) => (
          <span
            key={b.id}
            style={{
              position: "absolute", left: `${b.x}%`, bottom: 0, fontSize: 24,
              animation: "rm-float 2.1s ease-out forwards",
            }}
          >{b.emoji}</span>
        ))}
      </div>
      <style>{`@keyframes rm-float{0%{opacity:0;transform:translateY(0) scale(.6)}15%{opacity:1}100%{opacity:0;transform:translateY(-160px) scale(1.3)}}`}</style>
    </div>
  );
}

// ===================================================================
// SESSION COMMENT THREAD — "Discussion · this block" backed by session_comment
// ===================================================================
type SComment = { id: string; userId: string | null; authorName: string | null; body: string; createdAt: string };
export function BlockCommentThread({
  sessionId, blockOrd, userId, userName,
}: { sessionId: string; blockOrd: number; userId: string; userName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<SComment[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("session_comment")
      .select("id, user_id, author_name, body, created_at")
      .eq("session_id", sessionId)
      .eq("block_ord", blockOrd)
      .order("created_at", { ascending: true });
    setComments((data ?? []).map((c: any) => ({ id: c.id, userId: c.user_id, authorName: c.author_name, body: c.body, createdAt: c.created_at })));
  }, [supabase, sessionId, blockOrd]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`runmod-cmt:${sessionId}:${blockOrd}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "session_comment", filter: `session_id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as any)?.id;
          if (id) setComments((prev) => prev.filter((c) => c.id !== id));
          return;
        }
        const r = p.new as any;
        if (!r || r.block_ord !== blockOrd) return;
        setComments((prev) => prev.some((c) => c.id === r.id) ? prev : [...prev, { id: r.id, userId: r.user_id, authorName: r.author_name, body: r.body, createdAt: r.created_at }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, blockOrd]);

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    // The trigger stamps author + workspace; we still pass author_name as a fallback.
    const { error } = await supabase.from("session_comment").insert({
      session_id: sessionId, block_ord: blockOrd, body, author_name: userName,
    });
    if (error) { setErr(error.message); setDraft(body); }
  }
  async function remove(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("session_comment").delete().eq("id", id);
    if (error) { setErr(error.message); load(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {comments.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{
              width: 24, height: 24, borderRadius: "50%", background: WA.kpiBg, flex: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: WA.muted,
            }}>{initials(c.authorName)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: WA.faint }}>{firstName(c.authorName) || "Member"}</div>
              <div style={{ fontSize: 13, color: WA.ink, lineHeight: 1.45 }}>{c.body}</div>
            </div>
            {c.userId === userId ? (
              <button onClick={() => remove(c.id)} title="Delete" style={{ border: "none", background: "none", color: WA.faint2, cursor: "pointer", fontSize: 12 }}>✕</button>
            ) : null}
          </div>
        ))}
        {comments.length === 0 ? <div style={{ color: WA.faint, fontSize: 12.5 }}>No comments on this block yet.</div> : null}
      </div>
      {err ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={{ ...inputStyle(), fontSize: 12.5, padding: "7px 9px" }}
          placeholder="Add to the discussion…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") post(); }}
        />
        <button style={{ ...primBtn(!draft.trim()), padding: "7px 12px" }} disabled={!draft.trim()} onClick={post}>Post</button>
      </div>
    </div>
  );
}

// ---------- exported phase helpers for the cockpit header ----------
export function phaseVisOf(type: string): { key: PhaseKey; label: string; accent: string; tint: string; border: string } {
  const key = phaseOf(type);
  const vis = PHASE_VIS[key];
  return { key, label: PHASE_LABEL[key], accent: vis.accent, tint: vis.tint, border: vis.border };
}
export { actIcon };
