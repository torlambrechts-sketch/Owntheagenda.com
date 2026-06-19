import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "@/components/Logo";
import { ACTIVITY } from "@/lib/util";
import { ShareActions } from "./ShareActions";

type Idea = { text: string; lane: string | null; votes: number; by: string | null };
type Block = {
  ord: number; title: string; type: string; prompt: string | null;
  lanes: string[]; agree: { avg: number; total: number } | null; ideas: Idea[];
};
type DecAction = { text: string; owner: string | null; done: boolean };
type Decision = {
  title: string; status: string; rationale: string | null;
  agree: number | null; opposed: number; actions: DecAction[];
};
type Action = { text: string; owner: string | null; done: boolean; due: string | null };
type Summary = { themes?: { title: string; points: string[] }[]; actions?: string[]; divergent?: string[] };
type Doc = {
  workshop: string; team: string | null; startedAt: string | null; endedAt: string | null; status: string;
  stats: { steps: number; ideas: number; votes: number; actions: number };
  participants: string[];
  blocks: Block[]; decisions: Decision[]; actions: Action[];
  summary: Summary | null;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("public_session_readout", { p_token: params.token });
  const doc = data as Doc | null;
  return { title: doc ? `${doc.workshop} · Readout` : "Shared readout", robots: { index: false } };
}

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function fmtDue(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// A plain-markdown rendering, generated server-side and handed to the
// client toolbar for copy/download — the "forward to your boss" artifact.
function toMarkdown(doc: Doc): string {
  const L: string[] = [];
  L.push(`# ${doc.workshop}`);
  L.push(`${doc.team ? doc.team + " · " : ""}${fmtDate(doc.startedAt)}`.trim());
  L.push("");
  L.push(`**${doc.stats.steps}** steps · **${doc.stats.ideas}** ideas · **${doc.stats.votes}** votes · **${doc.stats.actions}** actions`);
  if (doc.participants.length) L.push(`Participants: ${doc.participants.join(", ")}`);
  if (doc.summary?.themes?.length || doc.summary?.actions?.length) {
    L.push("\n## Summary");
    for (const t of doc.summary.themes ?? []) {
      L.push(`\n**${t.title}**`);
      for (const p of t.points) L.push(`- ${p}`);
    }
    if (doc.summary.actions?.length) {
      L.push("\n**Agreed next steps**");
      for (const a of doc.summary.actions) L.push(`- ${a}`);
    }
  }
  for (const b of doc.blocks) {
    const ranked = b.ideas.filter((i) => i.lane !== "option" || true);
    if (!ranked.length && !b.agree) continue;
    L.push(`\n## ${b.ord}. ${b.title}`);
    if (b.agree) L.push(`_Agreement ${b.agree.avg}/5 (${b.agree.total} responses)_`);
    if (b.type === "feedback" && b.lanes.length) {
      for (const lane of b.lanes) {
        const items = b.ideas.filter((i) => (i.lane ?? "Notes") === lane);
        if (!items.length) continue;
        L.push(`\n**${lane}**`);
        for (const i of items) L.push(`- ${i.text}${i.by ? ` _(${i.by})_` : ""}`);
      }
    } else {
      for (const i of ranked) L.push(`- ${i.votes ? `(${i.votes}) ` : ""}${i.text}${i.by ? ` _(${i.by})_` : ""}`);
    }
  }
  if (doc.decisions.length) {
    L.push("\n## Decisions");
    for (const d of doc.decisions) {
      L.push(`\n**${d.title}** — ${d.status}${d.agree != null ? ` · agree ${d.agree}/5` : ""}`);
      if (d.rationale) L.push(d.rationale);
      for (const a of d.actions) L.push(`- ${a.done ? "[x]" : "[ ]"} ${a.text}${a.owner ? ` — ${a.owner}` : ""}`);
    }
  }
  if (doc.actions.length) {
    L.push("\n## Commitments");
    for (const a of doc.actions) L.push(`- ${a.done ? "[x]" : "[ ]"} ${a.text}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (due ${fmtDue(a.due)})` : ""}`);
  }
  L.push("\n—\nShared from OwnTheAgenda");
  return L.join("\n");
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("public_session_readout", { p_token: params.token });
  const doc = data as Doc | null;

  if (!doc) {
    return (
      <div className="sharepage">
        <div className="sharewrap">
          <div className="share-brand"><LogoMark size={30} /><span className="wm">Own<span className="t">the</span>Agenda</span></div>
          <div className="narrow-card" style={{ textAlign: "center", marginTop: 48 }}>
            <h1 style={{ marginTop: 0 }}>Link unavailable</h1>
            <p className="lede" style={{ marginBottom: 0 }}>This shared readout has been revoked, or the link is incorrect.</p>
          </div>
        </div>
      </div>
    );
  }

  const md = toMarkdown(doc);
  const fileBase = (doc.workshop || "readout").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "readout";

  return (
    <div className="sharepage">
      <div className="sharewrap">
        <div className="share-top no-print">
          <a className="share-brand" href="https://owntheagenda.com" target="_blank" rel="noreferrer">
            <LogoMark size={28} /><span className="wm">Own<span className="t">the</span>Agenda</span>
          </a>
          <ShareActions markdown={md} fileBase={fileBase} />
        </div>

        <div className="share-doc">
          <div className="readout-head" style={{ marginTop: 4 }}>
            <div>
              <div className="eyebrow">Shared readout</div>
              <h1 className="page-title" style={{ marginTop: 2 }}>{doc.workshop}</h1>
              <p className="page-sub" style={{ marginBottom: 0 }}>
                {doc.team ? `${doc.team} · ` : ""}{fmtDate(doc.startedAt)}
              </p>
            </div>
          </div>

          <div className="summary" style={{ marginTop: 14 }}>
            <div className="stat"><div className="num">{doc.stats.steps}</div><div className="lab">Steps</div></div>
            <div className="vr" />
            <div className="stat"><div className="num">{doc.stats.ideas}</div><div className="lab">Ideas</div></div>
            <div className="vr" />
            <div className="stat"><div className="num">{doc.stats.votes}</div><div className="lab">Votes</div></div>
            <div className="vr" />
            <div className="stat"><div className="num">{doc.stats.actions}</div><div className="lab">Actions</div></div>
          </div>

          {doc.participants.length ? (
            <div className="presence" style={{ margin: "2px 0 22px" }}>
              {doc.participants.map((p, i) => (
                <span className="pp" key={i}><span className="av sm">{p.slice(0, 1).toUpperCase()}</span>{p}</span>
              ))}
            </div>
          ) : null}

          {doc.summary && (doc.summary.themes?.length || doc.summary.actions?.length) ? (
            <div className="ro-block">
              <div className="ro-block-h"><h3>Summary</h3></div>
              {(doc.summary.themes ?? []).map((t, i) => (
                <div key={i} className="syn-theme">
                  <div className="syn-t">{t.title}</div>
                  <ul>{t.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
                </div>
              ))}
              {doc.summary.actions?.length ? (
                <div className="syn-theme">
                  <div className="syn-t">Agreed next steps</div>
                  <ul>{doc.summary.actions.map((a, j) => <li key={j}>{a}</li>)}</ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {doc.blocks.map((b) => {
            const act = ACTIVITY[b.type] ?? { label: b.type, cls: "" };
            const isFeedback = b.type === "feedback";
            const isIdeaVote = b.type === "brainstorm" || b.type === "vote";
            if (!isFeedback && !isIdeaVote) return null;
            if (!b.ideas.length && !b.agree) return null;
            return (
              <div className="ro-block" key={b.ord}>
                <div className="ro-block-h">
                  <span className="ro-ord">{b.ord}</span>
                  <h3>{b.title}</h3>
                  <span className={`pill sm ${act.cls}`}>{act.label}</span>
                  {b.agree ? <span className="ro-agree">Agreement {b.agree.avg}<span className="o">/5</span></span> : null}
                </div>
                {b.prompt ? <div className="ro-prompt">{b.prompt}</div> : null}
                {isIdeaVote ? (
                  b.ideas.length ? (
                    <ol className="ro-ranked">
                      {b.ideas.map((i, j) => (
                        <li key={j}>
                          <span className="ro-votes">{i.votes}</span>
                          <span className="ro-text">{i.text}</span>
                          {i.by && i.lane !== "option" ? <span className="ro-by">{i.by}</span> : null}
                        </li>
                      ))}
                    </ol>
                  ) : <div className="ro-empty">No cards captured.</div>
                ) : null}
                {isFeedback ? (
                  <div className="ro-lanes" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(b.lanes.length, 1), 4)}, minmax(0,1fr))` }}>
                    {(b.lanes.length ? b.lanes : ["Notes"]).map((lane) => {
                      const items = b.ideas.filter((i) => (i.lane ?? "Notes") === lane);
                      return (
                        <div className="ro-lane" key={lane}>
                          <div className="ro-lane-h">{lane} <span className="n">{items.length}</span></div>
                          {items.map((i, j) => (
                            <div className="ro-card" key={j}>{i.text}{i.by ? <span className="ro-by">{i.by}</span> : null}</div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}

          {doc.decisions.length ? (
            <div className="ro-block">
              <div className="ro-block-h">
                <h3>Decisions</h3>
                <span className="pill sm t-vote">{doc.decisions.filter((d) => d.status === "committed").length} committed</span>
              </div>
              {doc.decisions.map((d, i) => (
                <div className="ro-decision" key={i}>
                  <div className="ro-dh">
                    <span className={`pill sm ${d.status === "committed" ? "open" : d.status === "superseded" ? "reject" : "draft"}`}>{d.status}</span>
                    <span className="ro-text" style={{ fontWeight: 600 }}>{d.title}</span>
                    {d.agree != null ? <span className="ro-agree">agree {d.agree}<span className="o">/5</span></span> : null}
                  </div>
                  {d.rationale ? <div className="ro-prompt" style={{ margin: "6px 0" }}>{d.rationale}</div> : null}
                  {d.opposed > 0 ? <div className="ro-dmeta"><span className="opp">{d.opposed} opposed</span></div> : null}
                  {d.actions.length ? (
                    <ul className="ro-actions" style={{ marginTop: 8 }}>
                      {d.actions.map((a, j) => (
                        <li key={j} className={a.done ? "done" : ""}>
                          <span className={`ro-dot${a.done ? " on" : ""}`} />
                          <span className="ro-text">{a.text}</span>
                          {a.owner ? <span className="ro-by">{a.owner}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="ro-block">
            <div className="ro-block-h">
              <h3>Commitments</h3>
              <span className="pill sm t-outcome">{doc.actions.length}</span>
            </div>
            {doc.actions.length ? (
              <ul className="ro-actions">
                {doc.actions.map((a, i) => (
                  <li key={i} className={a.done ? "done" : ""}>
                    <span className={`ro-dot${a.done ? " on" : ""}`} />
                    <span className="ro-text">{a.text}</span>
                    {a.owner ? <span className="ro-by">{a.owner}</span> : null}
                    {a.due ? <span className="ro-due">Due {fmtDue(a.due)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : <div className="ro-empty">No commitments were captured.</div>}
          </div>

          <div className="share-foot">
            Captured live with <a href="https://owntheagenda.com" target="_blank" rel="noreferrer">OwnTheAgenda</a> — the session-running OS for leadership teams.
          </div>
        </div>
      </div>
    </div>
  );
}
