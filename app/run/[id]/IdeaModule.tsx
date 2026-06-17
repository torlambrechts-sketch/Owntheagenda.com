"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/util";

export type ModuleMode = "brainstorm" | "poll" | "feedback";
export type ModuleConfig = { budget?: number; lanes?: string[]; options?: string[] };

type Idea = {
  id: string;
  lane: string | null;
  text: string;
  authorId: string | null;
  authorName: string | null;
};
type Vote = { ideaId: string; voterId: string };

const IDEA_COLS = "id, lane, text, author_id, author_name";

function mapIdea(r: any): Idea {
  return { id: r.id, lane: r.lane ?? null, text: r.text ?? "", authorId: r.author_id ?? null, authorName: r.author_name ?? null };
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
}) {
  const supabase = useMemo(() => createClient(), []);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const seededRef = useRef(false);

  const budget = Math.max(0, config.budget ?? (mode === "feedback" ? 0 : 3));
  const voting = mode === "brainstorm" || mode === "poll";
  const lanes = mode === "feedback" ? (config.lanes && config.lanes.length ? config.lanes : ["Notes"]) : [];

  const load = useCallback(async () => {
    const [{ data: ir }, { data: vr }] = await Promise.all([
      supabase.from("idea").select(IDEA_COLS).eq("session_id", sessionId).eq("block_ord", blockOrd).order("created_at", { ascending: true }),
      supabase.from("idea_vote").select("idea_id, voter_id").eq("session_id", sessionId).eq("block_ord", blockOrd),
    ]);
    setIdeas((ir ?? []).map(mapIdea));
    setVotes((vr ?? []).map((v: any) => ({ ideaId: v.idea_id, voterId: v.voter_id })));
  }, [supabase, sessionId, blockOrd]);

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

  async function addIdea(lane: string | null) {
    const key = lane ?? "_";
    const text = (drafts[key] ?? "").trim();
    if (!text) return;
    setDrafts((d) => ({ ...d, [key]: "" }));
    const { error } = await supabase.from("idea").insert({ session_id: sessionId, block_ord: blockOrd, lane, text, author_name: userName });
    if (error) {
      setErr(error.message);
      setDrafts((d) => ({ ...d, [key]: text }));
    }
  }

  async function removeIdea(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase.from("idea").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      load();
    }
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

  const dots = voting ? (
    <span className="dotsleft" title="Your remaining votes">
      {remaining} {remaining === 1 ? "dot" : "dots"} left
    </span>
  ) : null;

  return (
    <div className="canvaswrap">
      <div className="canvashead">
        <div>
          <div className="pact">{stepLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="cright">
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
                  />
                </div>
                <div className="ideacol-list">
                  {items.map((i) => (
                    <div className="ideacard" key={i.id}>
                      <div className="t">{i.text}</div>
                      <div className="m">
                        <span className="by">{i.authorName ? i.authorName.split(" ")[0] : ""}</span>
                        {canRemove(i) ? (
                          <button className="x" title="Remove" onClick={() => removeIdea(i.id)}>✕</button>
                        ) : null}
                      </div>
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
              className="inp"
              placeholder="Add an idea — one per card…"
              value={drafts["_"] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, _: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") addIdea(null); }}
            />
            <button className="btn-prim" disabled={!(drafts["_"] ?? "").trim()} onClick={() => addIdea(null)}>Add</button>
          </div>
          <div className="ideagrid">
            {[...ideas]
              .sort((a, b) => countFor(b.id) - countFor(a.id))
              .map((i) => {
                const c = countFor(i.id);
                const mine = iVoted(i.id);
                return (
                  <div className={`ideacard big${mine ? " voted" : ""}`} key={i.id}>
                    <div className="t">{i.text}</div>
                    <div className="m">
                      <span className="by">{i.authorName ? i.authorName.split(" ")[0] : ""}</span>
                      <span className="sp" />
                      {canRemove(i) ? <button className="x" title="Remove" onClick={() => removeIdea(i.id)}>✕</button> : null}
                      <button className={`votebtn${mine ? " on" : ""}`} onClick={() => toggleVote(i.id)} title={mine ? "Remove your dot" : "Add a dot"}>
                        <span className="dot" /> {c}
                      </button>
                    </div>
                  </div>
                );
              })}
            {ideas.length === 0 ? <div className="idea-empty">No ideas yet — add the first one above.</div> : null}
          </div>
        </>
      ) : null}

      {mode === "poll" ? (
        <div className="polllist">
          {(() => {
            const opts = ideas.filter((i) => i.lane === "option");
            const max = Math.max(1, ...opts.map((o) => countFor(o.id)));
            const ranked = [...opts].sort((a, b) => countFor(b.id) - countFor(a.id));
            if (opts.length === 0)
              return <div className="idea-empty">{isFacilitator ? "Seeding options…" : "Waiting for the facilitator to open voting…"}</div>;
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
    </div>
  );
}
