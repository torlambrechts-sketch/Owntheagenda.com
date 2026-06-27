"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/util";
import { SideWindow } from "@/components/SideWindow";

export type ModuleMode = "brainstorm" | "poll" | "feedback";
export type ModuleConfig = { budget?: number; lanes?: string[]; options?: string[]; silent?: boolean; prework?: boolean };

type Idea = {
  id: string;
  lane: string | null;
  text: string;
  detail: string | null;
  impact: number | null;
  effort: number | null;
  authorId: string | null;
  authorName: string | null;
  anon: boolean;
};
type Vote = { ideaId: string; voterId: string };
type Reaction = { ideaId: string; userId: string; emoji: string };
type Comment = { id: string; ideaId: string; userId: string | null; authorName: string | null; body: string; createdAt: string };

// Fixed reaction palette — mirrors the server-side whitelist in idea_react_toggle.
const REACTIONS = ["👍", "🙌", "🎯", "💡", "🔥", "❓"] as const;

const IDEA_COLS = "id, lane, text, detail, impact, effort, author_id, author_name, is_anonymous";

function mapIdea(r: any): Idea {
  return {
    id: r.id, lane: r.lane ?? null, text: r.text ?? "", detail: r.detail ?? null,
    impact: r.impact ?? null, effort: r.effort ?? null,
    authorId: r.author_id ?? null, authorName: r.author_name ?? null, anon: !!r.is_anonymous,
  };
}

const QUADS = [
  { key: "quickwin", label: "Quick wins", sub: "High impact · low effort", i: 2, e: 1 },
  { key: "bigbet", label: "Big bets", sub: "High impact · high effort", i: 2, e: 2 },
  { key: "fillin", label: "Fill-ins", sub: "Low impact · low effort", i: 1, e: 1 },
  { key: "thankless", label: "Thankless", sub: "Low impact · high effort", i: 1, e: 2 },
] as const;
function quadKey(i: Idea): string | null {
  if (i.impact == null || i.effort == null) return null;
  return i.impact === 2 ? (i.effort === 1 ? "quickwin" : "bigbet") : i.effort === 1 ? "fillin" : "thankless";
}

export function IdeaModule({
  sessionId,
  blockOrd,
  mode,
  title,
  prompt,
  stepLabel,
  config,
  userId,
  userName,
  isFacilitator,
  showReady,
  ready,
  onToggleReady,
  addPlaceholder,
  collecting,
}: {
  sessionId: string;
  blockOrd: number;
  mode: ModuleMode;
  title: string;
  prompt: string | null;
  stepLabel: string;
  config: ModuleConfig;
  userId: string;
  userName: string;
  isFacilitator: boolean;
  showReady: boolean;
  ready: boolean;
  onToggleReady: () => void;
  addPlaceholder?: string;
  collecting?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  // Silent (private-until-reveal) covers both explicit silent ideation and
  // pre-work blocks; `collecting` is the async pre-work surface, which hides
  // the run-only controls (reveal / vote / promote).
  const silent = mode === "brainstorm" && (!!config.silent || !!config.prework);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [reactBar, setReactBar] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [anon, setAnon] = useState(false);
  const [revealed, setRevealed] = useState(!silent);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [editText, setEditText] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [promoted, setPromoted] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState(false);
  const [priorView, setPriorView] = useState(false);
  const ideaInputRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);

  const budget = Math.max(0, config.budget ?? (mode === "feedback" ? 0 : 3));
  const voting = mode === "brainstorm" || mode === "poll";
  const lanes = mode === "feedback" ? (config.lanes && config.lanes.length ? config.lanes : ["Notes"]) : [];

  const load = useCallback(async () => {
    const [{ data: ir }, { data: vr }, { data: rr }, { data: cr }, rev] = await Promise.all([
      supabase.from("idea").select(IDEA_COLS).eq("session_id", sessionId).eq("block_ord", blockOrd).order("created_at", { ascending: true }),
      supabase.from("idea_vote").select("idea_id, voter_id").eq("session_id", sessionId).eq("block_ord", blockOrd),
      supabase.from("idea_reaction").select("idea_id, user_id, emoji").eq("session_id", sessionId).eq("block_ord", blockOrd),
      supabase.from("idea_comment").select("id, idea_id, user_id, author_name, body, created_at").eq("session_id", sessionId).eq("block_ord", blockOrd).order("created_at", { ascending: true }),
      silent
        ? supabase.from("session_reveal").select("block_ord").eq("session_id", sessionId).eq("block_ord", blockOrd).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setIdeas((ir ?? []).map(mapIdea));
    setVotes((vr ?? []).map((v: any) => ({ ideaId: v.idea_id, voterId: v.voter_id })));
    setReactions((rr ?? []).map((r: any) => ({ ideaId: r.idea_id, userId: r.user_id, emoji: r.emoji })));
    setComments((cr ?? []).map((c: any) => ({ id: c.id, ideaId: c.idea_id, userId: c.user_id, authorName: c.author_name, body: c.body, createdAt: c.created_at })));
    if (silent) setRevealed(!!(rev as any)?.data);
  }, [supabase, sessionId, blockOrd, silent]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`ideas:${sessionId}:${blockOrd}`)
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
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_vote", filter: `session_id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "INSERT") {
          const r = p.new as any;
          if (r.block_ord !== blockOrd) return;
          setVotes((prev) =>
            prev.some((v) => v.ideaId === r.idea_id && v.voterId === r.voter_id) ? prev : [...prev, { ideaId: r.idea_id, voterId: r.voter_id }],
          );
        } else if (p.eventType === "DELETE") {
          const r = p.old as any;
          setVotes((prev) => prev.filter((v) => !(v.ideaId === r.idea_id && v.voterId === r.voter_id)));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_reaction", filter: `session_id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "INSERT") {
          const r = p.new as any;
          if (r.block_ord !== blockOrd) return;
          setReactions((prev) =>
            prev.some((x) => x.ideaId === r.idea_id && x.userId === r.user_id && x.emoji === r.emoji)
              ? prev : [...prev, { ideaId: r.idea_id, userId: r.user_id, emoji: r.emoji }],
          );
        } else if (p.eventType === "DELETE") {
          const r = p.old as any;
          setReactions((prev) => prev.filter((x) => !(x.ideaId === r.idea_id && x.userId === r.user_id && x.emoji === r.emoji)));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_comment", filter: `session_id=eq.${sessionId}` }, (p) => {
        if (p.eventType === "INSERT") {
          const r = p.new as any;
          if (r.block_ord !== blockOrd) return;
          setComments((prev) =>
            prev.some((c) => c.id === r.id)
              ? prev : [...prev, { id: r.id, ideaId: r.idea_id, userId: r.user_id, authorName: r.author_name, body: r.body, createdAt: r.created_at }],
          );
        } else if (p.eventType === "DELETE") {
          const r = p.old as any;
          setComments((prev) => prev.filter((c) => c.id !== r.id));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "session_reveal", filter: `session_id=eq.${sessionId}` }, (p) => {
        if ((p.new as any)?.block_ord === blockOrd) {
          setRevealed(true);
          load();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, blockOrd]);

  // Poll: facilitator seeds the options once.
  useEffect(() => {
    if (mode !== "poll" || !isFacilitator || seededRef.current) return;
    const opts = config.options ?? [];
    if (!opts.length) return;
    seededRef.current = true;
    supabase.rpc("idea_seed", { p_session: sessionId, p_block_ord: blockOrd, p_texts: opts }).then(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isFacilitator, blockOrd]);

  const myVotes = votes.filter((v) => v.voterId === userId).length;
  const remaining = Math.max(0, budget - myVotes);
  const countFor = (id: string) => votes.filter((v) => v.ideaId === id).length;
  const iVoted = (id: string) => votes.some((v) => v.ideaId === id && v.voterId === userId);

  // Reactions + comments on a card.
  const reactCount = (id: string, e: string) => reactions.filter((r) => r.ideaId === id && r.emoji === e).length;
  const iReacted = (id: string, e: string) => reactions.some((r) => r.ideaId === id && r.emoji === e && r.userId === userId);
  const usedEmojis = (id: string) => REACTIONS.filter((e) => reactCount(id, e) > 0);
  const commentsFor = (id: string) => comments.filter((c) => c.ideaId === id);

  async function toggleReaction(id: string, emoji: string) {
    const had = iReacted(id, emoji);
    setReactions((prev) =>
      had ? prev.filter((r) => !(r.ideaId === id && r.emoji === emoji && r.userId === userId))
          : [...prev, { ideaId: id, userId, emoji }],
    );
    const { error } = await supabase.rpc("idea_react_toggle", { p_idea: id, p_emoji: emoji });
    if (error) { setErr(error.message); load(); }
  }
  async function addComment(id: string) {
    const body = commentDraft.trim();
    if (!body) return;
    setCommentDraft("");
    const { data, error } = await supabase.rpc("idea_comment_add", { p_idea: id, p_body: body });
    if (error) { setErr(error.message); setCommentDraft(body); return; }
    // Show it straight away; the realtime INSERT dedupes by id.
    const c = data as { id: string; idea_id: string; user_id: string | null; author_name: string | null; body: string; created_at: string } | null;
    if (c) setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, { id: c.id, ideaId: c.idea_id, userId: c.user_id, authorName: c.author_name, body: c.body, createdAt: c.created_at }]));
  }
  async function deleteComment(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    const { error } = await supabase.from("idea_comment").delete().eq("id", commentId);
    if (error) { setErr(error.message); load(); }
  }

  function flashAdded() {
    setAdded(true);
    setTimeout(() => setAdded(false), 1300);
  }
  async function insertIdea(lane: string | null, text: string) {
    const { error } = await supabase.from("idea").insert({
      session_id: sessionId, block_ord: blockOrd, lane, text,
      author_name: anon ? null : userName, is_anonymous: anon,
    });
    if (error) setErr(error.message);
  }
  // U3: a single line adds one card; multiple lines (typed or pasted) add many.
  async function addIdea(lane: string | null) {
    const key = lane ?? "_";
    const lines = (drafts[key] ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    setDrafts((d) => ({ ...d, [key]: "" }));
    for (const t of lines) await insertIdea(lane, t);
    flashAdded();
    if (lane === null) ideaInputRef.current?.focus();
  }
  function onPasteIdea(e: ClipboardEvent<HTMLInputElement>, lane: string | null) {
    const lines = e.clipboardData.getData("text").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      setDrafts((d) => ({ ...d, [lane ?? "_"]: "" }));
      (async () => { for (const t of lines) await insertIdea(lane, t); flashAdded(); })();
    }
  }

  async function reveal() {
    const { error } = await supabase.rpc("reveal_block", { p_session: sessionId, p_block_ord: blockOrd });
    if (error) setErr(error.message);
    else { setRevealed(true); load(); }
  }

  async function removeIdea(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase.from("idea").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      load();
    }
  }

  // F3: place a card in the impact/effort grid. Optimistic; the realtime idea
  // subscription keeps everyone in sync. Same RLS as edit (author or facilitator).
  async function setQuad(id: string, impact: number | null, effort: number | null) {
    setIdeas((prev) => prev.map((x) => (x.id === id ? { ...x, impact, effort } : x)));
    const { error } = await supabase.from("idea").update({ impact, effort }).eq("id", id);
    if (error) { setErr(error.message); load(); }
  }

  function openCard(i: Idea) {
    setEditing(i);
    setEditText(i.text);
    setEditDetail(i.detail ?? "");
    setCommentDraft("");
  }
  async function saveCard() {
    if (!editing) return;
    const text = editText.trim();
    if (!text) return;
    const detail = editDetail.trim() || null;
    const id = editing.id;
    setIdeas((prev) => prev.map((x) => (x.id === id ? { ...x, text, detail } : x)));
    setEditing(null);
    const { error } = await supabase.from("idea").update({ text, detail }).eq("id", id);
    if (error) { setErr(error.message); load(); }
  }

  // Turn a card into a session commitment (task). Appears in the run's right
  // rail via its action_item subscription. Facilitator-curated from the votes.
  async function promote(i: Idea) {
    setPromoted((s) => new Set(s).add(i.id));
    // Carry the card's author onto the task — prefer the real member id (gives
    // them reminders), fall back to the display name for older/anon-named cards.
    const ownerId = i.anon ? null : i.authorId;
    const ownerName = i.anon ? null : i.authorName;
    const { error } = await supabase.rpc("add_action", {
      p_session: sessionId,
      p_text: i.text,
      p_block_ord: blockOrd,
      ...(ownerId ? { p_owner_id: ownerId } : ownerName ? { p_owner: ownerName } : {}),
    });
    if (error) {
      setErr(error.message);
      setPromoted((s) => { const n = new Set(s); n.delete(i.id); return n; });
    }
  }

  // Bulk: take the three highest-voted, not-yet-promoted cards forward as tasks.
  async function promoteTop() {
    const top = [...ideas]
      .sort((a, b) => countFor(b.id) - countFor(a.id))
      .filter((i) => countFor(i.id) > 0 && !promoted.has(i.id))
      .slice(0, 3);
    for (const i of top) await promote(i);
  }

  async function toggleVote(id: string) {
    const had = iVoted(id);
    if (!had && remaining <= 0) {
      setErr(`No dots left — you have ${budget}.`);
      setTimeout(() => setErr(null), 1800);
      return;
    }
    // optimistic
    setVotes((prev) => (had ? prev.filter((v) => !(v.ideaId === id && v.voterId === userId)) : [...prev, { ideaId: id, voterId: userId }]));
    const { error } = await supabase.rpc("idea_vote_toggle", { p_idea: id });
    if (error) {
      setErr(error.message);
      load();
    }
  }

  const canRemove = (i: Idea) => i.authorId === userId || isFacilitator;
  const authorLabel = (i: Idea) => (i.anon ? "Anonymous" : i.authorName ? i.authorName.split(" ")[0] : "");

  const dots = voting && revealed ? (
    <span className="dotsleft" title="Your remaining votes">
      {remaining} {remaining === 1 ? "dot" : "dots"} left
    </span>
  ) : null;

  const sortedIdeas = [...ideas].sort((a, b) => countFor(b.id) - countFor(a.id));

  // Reactions + comment affordance, shown on shared (revealed) cards.
  function cardEngage(i: Idea) {
    if (!revealed || collecting) return null;
    const used = usedEmojis(i.id);
    const cc = commentsFor(i.id).length;
    const open = reactBar === i.id;
    return (
      <div className="cardengage">
        {used.map((e) => (
          <button key={e} className={`react${iReacted(i.id, e) ? " on" : ""}`} onClick={() => toggleReaction(i.id, e)} title="Toggle reaction">
            <span className="e">{e}</span> {reactCount(i.id, e)}
          </button>
        ))}
        <div className="react-add-wrap">
          <button className="react-add" title="Add a reaction" onClick={() => setReactBar(open ? null : i.id)}>☺<sup>+</sup></button>
          {open ? (
            <div className="react-pop" onMouseLeave={() => setReactBar(null)}>
              {REACTIONS.map((e) => (
                <button key={e} className={iReacted(i.id, e) ? "on" : ""} onClick={() => { toggleReaction(i.id, e); setReactBar(null); }}>{e}</button>
              ))}
            </div>
          ) : null}
        </div>
        <button className="cmtbtn" title="Comments" onClick={() => openCard(i)}>💬{cc > 0 ? ` ${cc}` : ""}</button>
      </div>
    );
  }

  // One card, shared by the list view and the impact/effort grid (F3).
  function renderCard(i: Idea) {
    const c = countFor(i.id);
    const mine = iVoted(i.id);
    return (
      <div className={`ideacard big${mine ? " voted" : ""}`} key={i.id}>
        <div className="t" onClick={() => openCard(i)} style={{ cursor: "pointer" }} title="Open card">{i.text}</div>
        <div className="m">
          <span className="by">{authorLabel(i)}</span>
          {i.detail ? <span className="hasdetail" title="Has a detail note" onClick={() => openCard(i)}>≡</span> : null}
          <span className="sp" />
          {canRemove(i) ? <button className="x" title="Remove" onClick={() => removeIdea(i.id)}>✕</button> : null}
          {revealed ? (
            <button className={`votebtn${mine ? " on" : ""}`} onClick={() => toggleVote(i.id)} title={mine ? "Remove your dot" : "Add a dot"}>
              <span className="dot" /> {c}
            </button>
          ) : null}
          {isFacilitator && !collecting ? (
            <button className={`taskbtn${promoted.has(i.id) ? " on" : ""}`} disabled={promoted.has(i.id)} onClick={() => promote(i)} title="Make this a task">
              {promoted.has(i.id) ? "✓ Task" : "→ Task"}
            </button>
          ) : null}
        </div>
        {cardEngage(i)}
      </div>
    );
  }

  return (
    <div className="canvaswrap">
      <div className="canvashead">
        <div>
          <div className="pact">{stepLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="cright">
          {mode === "brainstorm" || mode === "feedback" ? (
            <label className="anontoggle" title="Hide your name on cards you add">
              <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Anonymous
            </label>
          ) : null}
          {dots}
          {showReady ? (
            <button className={`ready${ready ? " on" : ""}`} onClick={onToggleReady}>
              {ready ? "✓ You're ready" : "I'm ready"}
            </button>
          ) : null}
        </div>
      </div>
      {prompt ? <div className="canvasprompt">{prompt}</div> : null}
      {err ? <div className="form-err" style={{ marginTop: 4 }}>{err}</div> : null}

      {mode === "feedback" ? (
        <div className="ideacols" style={{ gridTemplateColumns: `repeat(${Math.min(lanes.length, 4)}, minmax(0,1fr))` }}>
          {lanes.map((lane) => {
            const items = ideas.filter((i) => (i.lane ?? "Notes") === lane);
            return (
              <div className="ideacol" key={lane}>
                <div className="ideacol-h">
                  {lane} <span className="n">{items.length}</span>
                </div>
                <div className="ideacol-add">
                  <input
                    className="inp"
                    placeholder="Add a card…"
                    value={drafts[lane] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [lane]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addIdea(lane); }}
                    onPaste={(e) => onPasteIdea(e, lane)}
                  />
                </div>
                <div className="ideacol-list">
                  {items.map((i) => (
                    <div className="ideacard" key={i.id}>
                      <div className="t" onClick={() => openCard(i)} style={{ cursor: "pointer" }} title="Open card">{i.text}</div>
                      <div className="m">
                        <span className="by">{authorLabel(i)}</span>
                        {i.detail ? <span className="hasdetail" title="Has a detail note" onClick={() => openCard(i)}>≡</span> : null}
                        {canRemove(i) ? (
                          <button className="x" title="Remove" onClick={() => removeIdea(i.id)}>✕</button>
                        ) : null}
                        {isFacilitator && !collecting ? (
                          <button className={`taskbtn${promoted.has(i.id) ? " on" : ""}`} disabled={promoted.has(i.id)} onClick={() => promote(i)} title="Make this a task">
                            {promoted.has(i.id) ? "✓ Task" : "→ Task"}
                          </button>
                        ) : null}
                      </div>
                      {cardEngage(i)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {mode === "brainstorm" ? (
        <>
          <div className="idea-add">
            <input
              ref={ideaInputRef}
              className="inp"
              placeholder={addPlaceholder ?? "Add an idea — one per card…  (paste a list to add many)"}
              value={drafts["_"] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, _: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") addIdea(null); }}
              onPaste={(e) => onPasteIdea(e, null)}
            />
            <button className="btn-prim" disabled={!(drafts["_"] ?? "").trim()} onClick={() => addIdea(null)}>Add</button>
            {added ? <span className="addedflag">✓ Added</span> : null}
          </div>
          {silent && !revealed ? (
            <div className="silentbar">
              <span>✍️ Writing privately — only you can see your cards until the facilitator reveals them{collecting ? " in the live session" : ""}.</span>
              {isFacilitator && !collecting ? <button className="btn-prim sm" onClick={reveal}>Reveal cards ▸</button> : null}
            </div>
          ) : null}
          {!collecting && isFacilitator && revealed && ideas.some((i) => countFor(i.id) > 0) ? (
            <div className="promotebar">
              <span>Take the top-voted cards forward as commitments.</span>
              <button className="btn-sec sm" onClick={promoteTop}>Promote top 3 →</button>
            </div>
          ) : null}
          {!collecting && revealed && ideas.length > 0 ? (
            <div className="ideaviews">
              <div className="seg">
                <button className={`segbtn${!priorView ? " on" : ""}`} onClick={() => setPriorView(false)}>List</button>
                <button className={`segbtn${priorView ? " on" : ""}`} onClick={() => setPriorView(true)}>Prioritize ▦</button>
              </div>
              {priorView ? <span className="viewhint">Place each card by impact &amp; effort to see what to do first.</span> : null}
            </div>
          ) : null}
          {priorView && revealed ? (
            (() => {
              const unsorted = sortedIdeas.filter((i) => quadKey(i) === null);
              return (
                <div className="prior">
                  <div className="prior-grid">
                    {QUADS.map((q) => {
                      const items = sortedIdeas.filter((i) => quadKey(i) === q.key);
                      return (
                        <div className={`pq pq-${q.key}`} key={q.key}>
                          <div className="pq-h"><b>{q.label}</b><span>{q.sub}</span></div>
                          <div className="pq-list">
                            {items.map((i) => (
                              <div className="pq-card" key={i.id}>
                                {renderCard(i)}
                                {canRemove(i) ? (
                                  <button className="unplace" title="Send back to unsorted" onClick={() => setQuad(i.id, null, null)}>↩</button>
                                ) : null}
                              </div>
                            ))}
                            {items.length === 0 ? <div className="pq-empty">—</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="prior-un">
                    <div className="prior-un-h">Unsorted <span className="n">{unsorted.length}</span></div>
                    {unsorted.length === 0 ? (
                      <div className="idea-empty sm">Everything&apos;s placed — nice work. 🎉</div>
                    ) : (
                      <div className="un-list">
                        {unsorted.map((i) => (
                          <div className="ucard" key={i.id}>
                            <div className="t" onClick={() => openCard(i)} style={{ cursor: "pointer" }} title="Open card">{i.text}</div>
                            {canRemove(i) ? (
                              <div className="placebtns">
                                {QUADS.map((q) => (
                                  <button key={q.key} className="placebtn" title={q.sub} onClick={() => setQuad(i.id, q.i, q.e)}>{q.label}</button>
                                ))}
                              </div>
                            ) : (
                              <span className="waiting">waiting to be placed…</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="ideagrid">
              {sortedIdeas.map((i) => renderCard(i))}
              {ideas.length === 0 ? (
                <div className="idea-empty">{silent && !revealed ? "Add your ideas privately above." : "No ideas yet — add the first one above."}</div>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {mode === "poll" ? (
        <div className="polllist">
          {(() => {
            const opts = ideas.filter((i) => i.lane === "option");
            const max = Math.max(1, ...opts.map((o) => countFor(o.id)));
            const ranked = [...opts].sort((a, b) => countFor(b.id) - countFor(a.id));
            if (opts.length === 0)
              return isFacilitator ? (
                <div className="pollseed">
                  <p className="idea-empty" style={{ margin: "0 0 8px", textAlign: "left" }}>Add the options to vote on — one per line, then open voting.</p>
                  <textarea
                    className="inp"
                    rows={4}
                    placeholder={"Option A\nOption B\nOption C"}
                    value={drafts["option"] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, option: e.target.value }))}
                  />
                  <button className="btn-prim" style={{ marginTop: 8 }} disabled={!(drafts["option"] ?? "").trim()} onClick={() => addIdea("option")}>Open voting ▸</button>
                </div>
              ) : (
                <div className="idea-empty">Waiting for the facilitator to open voting…</div>
              );
            return ranked.map((o) => {
              const c = countFor(o.id);
              const mine = iVoted(o.id);
              return (
                <div className="pollrow" key={o.id}>
                  <button className={`votebtn${mine ? " on" : ""}`} onClick={() => toggleVote(o.id)} title={mine ? "Remove your dot" : "Add a dot"}>
                    <span className="dot" />
                  </button>
                  <div className="pl">
                    <div className="pl-top">
                      <span className="lab">{o.text}</span>
                      <span className="cnt">{c}</span>
                    </div>
                    <div className="bar"><span style={{ width: `${(c / max) * 100}%` }} /></div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : null}

      <SideWindow
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing && canRemove(editing) ? "Edit card" : "Card detail"}
        size="compact"
        footer={
          editing && canRemove(editing) ? (
            <>
              <button className="btn-sec" onClick={() => setEditing(null)}>Cancel</button>
              <div className="right">
                <button className="btn-prim" disabled={!editText.trim()} onClick={saveCard}>Save</button>
              </div>
            </>
          ) : (
            <div className="right"><button className="btn-prim" onClick={() => setEditing(null)}>Close</button></div>
          )
        }
      >
        {editing ? (
          <>
          {canRemove(editing) ? (
            <>
              <div className="field">
                <label htmlFor="card-text">Card</label>
                <input className="inp" id="card-text" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="card-detail">Detail <span className="opt">(optional)</span></label>
                <textarea className="inp" id="card-detail" rows={6} value={editDetail} onChange={(e) => setEditDetail(e.target.value)} placeholder="Add context, examples or notes…" />
              </div>
              <button className="linkbtn xs danger" onClick={() => { removeIdea(editing.id); setEditing(null); }}>Delete card</button>
            </>
          ) : (
            <>
              <div className="field"><label>Card</label><div className="card-ro">{editing.text}</div></div>
              {editing.detail ? (
                <div className="field"><label>Detail</label><div className="card-ro">{editing.detail}</div></div>
              ) : (
                <div className="form-note">No detail added.</div>
              )}
            </>
          )}
          {isFacilitator && !collecting ? (
            <button className="btn-sec sm" disabled={promoted.has(editing.id)} onClick={() => promote(editing)} style={{ marginTop: 14 }}>
              {promoted.has(editing.id) ? "✓ Added as a task" : "Make this a task →"}
            </button>
          ) : null}

          {!collecting && revealed ? (
            <div className="cmt-sec">
              <div className="cmt-react">
                {REACTIONS.map((e) => (
                  <button key={e} className={`react${iReacted(editing.id, e) ? " on" : ""}`} onClick={() => toggleReaction(editing.id, e)} title="Toggle reaction">
                    <span className="e">{e}</span>{reactCount(editing.id, e) > 0 ? ` ${reactCount(editing.id, e)}` : ""}
                  </button>
                ))}
              </div>
              <div className="cmt-h">Comments <span className="n">{commentsFor(editing.id).length}</span></div>
              <div className="cmt-list">
                {commentsFor(editing.id).map((c) => (
                  <div className="cmt" key={c.id}>
                    <div className="cmt-top">
                      <span className="cmt-by">{c.authorName ? c.authorName.split(" ")[0] : "Member"}</span>
                      {c.userId === userId || isFacilitator ? <button className="cmt-x" title="Delete comment" onClick={() => deleteComment(c.id)}>✕</button> : null}
                    </div>
                    <div className="cmt-body">{c.body}</div>
                  </div>
                ))}
                {commentsFor(editing.id).length === 0 ? <div className="form-note">No comments yet — start the thread.</div> : null}
              </div>
              <div className="cmt-add">
                <input
                  className="inp"
                  placeholder="Add a comment…"
                  value={commentDraft}
                  maxLength={1000}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addComment(editing.id); }}
                />
                <button className="btn-prim sm" disabled={!commentDraft.trim()} onClick={() => addComment(editing.id)}>Post</button>
              </div>
            </div>
          ) : null}
          </>
        ) : null}
      </SideWindow>
    </div>
  );
}
