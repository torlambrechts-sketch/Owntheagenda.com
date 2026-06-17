import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY, initials } from "@/lib/util";
import { SessionSynthesis } from "./Synthesis";

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function durationLabel(a: string | null, b: string | null) {
  if (!a || !b) return null;
  const mins = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default async function ReadoutPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: session } = await supabase
    .from("session")
    .select("id, workshop_id, workspace_id, status, started_at, ended_at, facilitator_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!session || session.workspace_id !== ctx.workspace.id) notFound();

  const { data: workshop } = await supabase
    .from("workshop")
    .select("id, title, team_id")
    .eq("id", session.workshop_id)
    .maybeSingle();
  const { data: team } = workshop
    ? await supabase.from("team").select("name").eq("id", workshop.team_id).maybeSingle()
    : { data: null };

  const [{ data: blocks }, { data: ideas }, { data: votes }, { data: notes }, { data: actions }, { data: parts }, { data: decisions }] =
    await Promise.all([
      supabase.from("block").select("ord, title, activity_type, prompt, config").eq("workshop_id", session.workshop_id).order("ord", { ascending: true }),
      supabase.from("idea").select("id, block_ord, lane, text, author_name").eq("session_id", session.id),
      supabase.from("idea_vote").select("idea_id, block_ord").eq("session_id", session.id),
      supabase.from("canvas_object").select("block_ord, text").eq("session_id", session.id),
      supabase.from("action_item").select("text, owner_name, status, due_at, decision_id").eq("session_id", session.id).order("created_at", { ascending: true }),
      supabase.from("participant").select("user_id, is_facilitator").eq("session_id", session.id),
      supabase.from("decision").select("id, title, rationale, status, decider_user_id, resource_note, override_note").eq("session_id", session.id).order("created_at", { ascending: true }),
    ]);
  const decisionList = decisions ?? [];
  const decIds = decisionList.map((d) => d.id);
  const { data: decContribs } = decIds.length
    ? await supabase.from("decision_contributor").select("decision_id, agreement").in("decision_id", decIds)
    : { data: [] as { decision_id: string; agreement: number | null }[] };

  const { data: summary } = await supabase
    .from("session_summary")
    .select("content, ai, approved_at")
    .eq("session_id", session.id)
    .maybeSingle();
  const initialSummary = summary
    ? { ai: !!summary.ai, approved: !!summary.approved_at, ...((summary.content as any) ?? {}) }
    : null;

  const blockList = blocks ?? [];
  const ideaList = ideas ?? [];
  const voteByIdea = new Map<string, number>();
  for (const v of votes ?? []) voteByIdea.set(v.idea_id, (voteByIdea.get(v.idea_id) ?? 0) + 1);

  // participant names
  const pids = (parts ?? []).map((p) => p.user_id);
  const { data: profs } = pids.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", pids)
    : { data: [] as any[] };
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Member"]));
  const participants = (parts ?? []).map((p) => ({ name: nameById.get(p.user_id) || "Member", facilitator: p.is_facilitator }));

  // agreement (fist of five) per block — via the aggregate RPC (author-private otherwise)
  const agg = await Promise.all(
    blockList.map(async (b) => {
      const { data } = await supabase.rpc("agreement_summary", { p_session: session.id, p_block_ord: b.ord });
      const rows = (data ?? []) as { value: number; count: number }[];
      const total = rows.reduce((n, r) => n + r.count, 0);
      const avg = total ? rows.reduce((n, r) => n + r.value * r.count, 0) / total : 0;
      return { ord: b.ord, total, avg };
    }),
  );
  const aggByOrd = new Map(agg.map((a) => [a.ord, a]));

  const notesByOrd = new Map<number, string[]>();
  for (const n of notes ?? []) {
    const arr = notesByOrd.get(n.block_ord) ?? [];
    if (n.text) arr.push(n.text);
    notesByOrd.set(n.block_ord, arr);
  }

  const totalVotes = (votes ?? []).length;
  const liveBanner = session.status === "live";

  return (
    <div>
      <Link href="/sessions" className="linkbtn" style={{ fontSize: 12 }}>‹ Sessions</Link>

      <div className="readout-head">
        <div>
          <div className="eyebrow">Session readout</div>
          <h1 className="page-title" style={{ marginTop: 2 }}>{workshop?.title ?? "Workshop"}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            {team?.name ? `${team.name} · ` : ""}{fmtDateTime(session.started_at)}
            {durationLabel(session.started_at, session.ended_at) ? ` · ${durationLabel(session.started_at, session.ended_at)}` : ""}
          </p>
        </div>
        {liveBanner ? (
          <Link className="btn-prim" href={`/run/${session.workshop_id}`}>Rejoin live ▸</Link>
        ) : null}
      </div>

      <div className="summary" style={{ marginTop: 14 }}>
        <div className="stat"><div className="num">{blockList.length}</div><div className="lab">Steps</div></div>
        <div className="vr" />
        <div className="stat"><div className="num">{ideaList.length}</div><div className="lab">Ideas</div></div>
        <div className="vr" />
        <div className="stat"><div className="num">{totalVotes}</div><div className="lab">Votes</div></div>
        <div className="vr" />
        <div className="stat"><div className="num">{(notes ?? []).length}</div><div className="lab">Canvas notes</div></div>
        <div className="vr" />
        <div className="stat"><div className="num">{(actions ?? []).length}</div><div className="lab">Actions</div></div>
      </div>

      {participants.length ? (
        <div className="presence" style={{ margin: "2px 0 22px" }}>
          {participants.map((p, i) => (
            <span className="pp" key={i} title={p.name}>
              <span className="av sm">{initials(p.name)}</span>
              {p.name.split(" ")[0]}{p.facilitator ? " · host" : ""}
            </span>
          ))}
        </div>
      ) : null}

      {blockList.map((b) => {
        const act = ACTIVITY[b.activity_type] ?? { label: b.activity_type, cls: "" };
        const ag = aggByOrd.get(b.ord);
        const isFeedback = b.activity_type === "feedback";
        const isIdeaVote = b.activity_type === "brainstorm" || b.activity_type === "vote";
        const blockIdeas = ideaList.filter((i) => i.block_ord === b.ord);
        const lanes: string[] = (b.config as any)?.lanes ?? [];
        const canvasNotes = notesByOrd.get(b.ord) ?? [];

        return (
          <div className="ro-block" key={b.ord}>
            <div className="ro-block-h">
              <span className="ro-ord">{b.ord}</span>
              <h3>{b.title}</h3>
              <span className={`pill sm ${act.cls}`}>{act.label}</span>
              {ag && ag.total > 0 ? (
                <span className="ro-agree" title={`${ag.total} responses`}>
                  Agreement {ag.avg.toFixed(1)}<span className="o">/5</span>
                </span>
              ) : null}
            </div>
            {b.prompt ? <div className="ro-prompt">{b.prompt}</div> : null}

            {isIdeaVote ? (
              blockIdeas.length ? (
                <ol className="ro-ranked">
                  {[...blockIdeas]
                    .sort((a, c) => (voteByIdea.get(c.id) ?? 0) - (voteByIdea.get(a.id) ?? 0))
                    .map((i) => (
                      <li key={i.id}>
                        <span className="ro-votes">{voteByIdea.get(i.id) ?? 0}</span>
                        <span className="ro-text">{i.text}</span>
                        {i.author_name && i.lane !== "option" ? <span className="ro-by">{i.author_name.split(" ")[0]}</span> : null}
                      </li>
                    ))}
                </ol>
              ) : (
                <div className="ro-empty">No cards captured.</div>
              )
            ) : null}

            {isFeedback ? (
              <div className="ro-lanes" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(lanes.length, 1), 4)}, minmax(0,1fr))` }}>
                {(lanes.length ? lanes : ["Notes"]).map((lane) => {
                  const items = blockIdeas.filter((i) => (i.lane ?? "Notes") === lane);
                  return (
                    <div className="ro-lane" key={lane}>
                      <div className="ro-lane-h">{lane} <span className="n">{items.length}</span></div>
                      {items.map((i) => (
                        <div className="ro-card" key={i.id}>
                          {i.text}
                          {i.author_name ? <span className="ro-by">{i.author_name.split(" ")[0]}</span> : null}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {b.activity_type === "canvas" ? (
              canvasNotes.length ? (
                <div className="ro-chips">
                  {canvasNotes.map((t, i) => <span className="ro-chip" key={i}>{t || "—"}</span>)}
                </div>
              ) : (
                <div className="ro-empty">No notes captured.</div>
              )
            ) : null}
          </div>
        );
      })}

      {decisionList.length > 0 ? (
        <div className="ro-block">
          <div className="ro-block-h">
            <h3>Decisions</h3>
            <span className="pill sm t-vote">{decisionList.filter((d) => d.status === "committed").length} committed</span>
          </div>
          {decisionList.map((d) => {
            const ags = (decContribs ?? [])
              .filter((c) => c.decision_id === d.id && c.agreement != null)
              .map((c) => c.agreement as number);
            const avg = ags.length ? (ags.reduce((a, b) => a + b, 0) / ags.length).toFixed(1) : null;
            const opposed = ags.filter((a) => a === 1).length;
            const dActions = (actions ?? []).filter((a) => a.decision_id === d.id);
            return (
              <div className="ro-decision" key={d.id}>
                <div className="ro-dh">
                  <span className={`pill sm ${d.status === "committed" ? "open" : d.status === "superseded" ? "reject" : "draft"}`}>
                    {d.status}
                  </span>
                  <span className="ro-text" style={{ fontWeight: 600 }}>{d.title}</span>
                  {avg ? <span className="ro-agree">agree {avg}<span className="o">/5</span></span> : null}
                </div>
                {d.rationale ? <div className="ro-prompt" style={{ margin: "6px 0" }}>{d.rationale}</div> : null}
                <div className="ro-dmeta">
                  {d.decider_user_id ? <span>Decider · {nameById.get(d.decider_user_id) ?? "—"}</span> : null}
                  {opposed > 0 ? <span className="opp">{opposed} opposed</span> : null}
                </div>
                {d.resource_note ? <div className="ro-dmeta">Resourcing · {d.resource_note}</div> : null}
                {d.override_note ? <div className="ro-dmeta">Override · {d.override_note}</div> : null}
                {dActions.length ? (
                  <ul className="ro-actions" style={{ marginTop: 8 }}>
                    {dActions.map((a, i) => (
                      <li key={i} className={a.status === "done" ? "done" : ""}>
                        <span className={`ro-dot${a.status === "done" ? " on" : ""}`} />
                        <span className="ro-text">{a.text}</span>
                        {a.owner_name ? <span className="ro-by">{a.owner_name}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {ideaList.length > 0 || decisionList.length > 0 ? (
        <SessionSynthesis
          sessionId={session.id}
          isFacilitator={session.facilitator_id === ctx.userId}
          initial={initialSummary}
        />
      ) : null}

      <div className="ro-block">
        <div className="ro-block-h">
          <h3>Actions from this session</h3>
          <span className="pill sm t-outcome">{(actions ?? []).length}</span>
          <span style={{ flex: 1 }} />
          <Link className="linkbtn" href="/actions">Open Actions ›</Link>
        </div>
        {(actions ?? []).length ? (
          <ul className="ro-actions">
            {(actions ?? []).map((a, i) => (
              <li key={i} className={a.status === "done" ? "done" : ""}>
                <span className={`ro-dot${a.status === "done" ? " on" : ""}`} />
                <span className="ro-text">{a.text}</span>
                {a.owner_name ? <span className="ro-by">{a.owner_name}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="ro-empty">No commitments were captured. You can still add them in Actions.</div>
        )}
      </div>
    </div>
  );
}
