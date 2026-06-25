import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/util";
import { ACTIVITY } from "@/lib/util";
import { PHASE_LABEL, phaseOf } from "../../blocks";
import { Icon, WA, actIcon, PHASE_VIS } from "../../visuals";
import { ReportExport } from "./ReportExport";

// The design's OUTCOME REPORT — a read-only, exportable record of what a
// workshop produced, captured by block, from its most recent real (non-dry-run)
// session. Reuses the run cockpit's persistence: idea (by lane), idea_vote,
// decision (block_ord), action_item.
export default async function WorkshopReportPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: workshop } = await supabase
    .from("workshop")
    .select("id, title, scheduled_at, status, team_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!workshop) notFound();

  const { data: blockRows } = await supabase
    .from("block")
    .select("ord, title, activity_type, phase, config")
    .eq("workshop_id", workshop.id)
    .order("ord", { ascending: true });
  const blocks = blockRows ?? [];

  // Most recent real session for this workshop.
  const { data: sess } = await supabase
    .from("session")
    .select("id, started_at, ended_at")
    .eq("workshop_id", workshop.id)
    .eq("is_dry_run", false)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type Idea = { block_ord: number; lane: string | null; text: string; detail: string | null; author_name: string | null; id: string };
  type Dec = { block_ord: number | null; title: string; rationale: string | null; status: string };
  type Act = { id: string; text: string; owner_name: string | null; due_at: string | null; priority: string | null; detail: string | null; status: string };
  let ideas: Idea[] = [];
  let voteCount = new Map<string, number>();
  let decisions: Dec[] = [];
  let actions: Act[] = [];
  let people = 0;

  if (sess) {
    const [{ data: id }, { data: iv }, { data: dec }, { data: ai }, { data: pr }] = await Promise.all([
      supabase.from("idea").select("id, block_ord, lane, text, detail, author_name").eq("session_id", sess.id),
      supabase.from("idea_vote").select("idea_id").eq("session_id", sess.id),
      supabase.from("decision").select("block_ord, title, rationale, status").eq("session_id", sess.id),
      supabase.from("action_item").select("id, text, owner_name, due_at, priority, detail, status").eq("session_id", sess.id),
      supabase.from("participant").select("user_id").eq("session_id", sess.id),
    ]);
    ideas = (id ?? []) as Idea[];
    for (const v of (iv ?? []) as { idea_id: string }[]) voteCount.set(v.idea_id, (voteCount.get(v.idea_id) ?? 0) + 1);
    decisions = (dec ?? []) as Dec[];
    actions = (ai ?? []) as Act[];
    people = (pr ?? []).length;
  }

  const ideasByBlock = (ord: number) => ideas.filter((i) => i.block_ord === ord);
  const decidedAll = decisions.filter((d) => d.status === "committed" || d.status === "decided");
  const ranBlocks = new Set(ideas.map((i) => i.block_ord));
  decisions.forEach((d) => d.block_ord != null && ranBlocks.add(d.block_ord));

  const whenLabel = workshop.scheduled_at
    ? new Date(workshop.scheduled_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : sess?.started_at
      ? new Date(sess.started_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
      : "Not yet run";

  const card: React.CSSProperties = { background: WA.cardBg, border: `1px solid ${WA.cardBorder}`, borderRadius: 12 };
  const PRIO_COLOR: Record<string, string> = { High: "#b8584a", Medium: "#a16207", Low: "#3f7d5a" };

  return (
    <div style={{ color: WA.ink2, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <Link href={`/workshops/${workshop.id}/overview`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: `1px solid ${WA.cardBorder}`, background: "#fff", color: WA.muted, flexShrink: 0 }}>
          <Icon name="ArrowLeft" size={16} color={WA.muted} />
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: WA.serif, fontSize: 18, fontWeight: 600, color: WA.ink }}>Outcome report</div>
          <div style={{ marginTop: 1, fontSize: 11.5, color: WA.faint2 }}>{workshop.title} · {whenLabel}</div>
        </div>
        <ReportExport />
      </div>

      {!sess ? (
        <div style={{ ...card, padding: "40px 28px", textAlign: "center", color: WA.faint }}>
          This workshop hasn’t been run yet — the outcome report fills in once a live session captures decisions and actions.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 12, background: "#e7efe9", border: "1px solid #c5d3c8" }}>
              <Icon name="ChartColumnBig" size={20} color={WA.accent} />
            </span>
            <div>
              <h1 style={{ fontFamily: WA.serif, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", color: WA.ink, margin: 0 }}>{workshop.title}</h1>
              <div style={{ marginTop: 4, fontSize: 13, color: WA.faint }}>{whenLabel} · {people} participant{people === 1 ? "" : "s"} · documented for follow-up</div>
            </div>
          </div>

          {/* summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 26 }}>
            {[
              { n: decidedAll.length, label: "Decisions" },
              { n: actions.length, label: "Action items" },
              { n: `${ranBlocks.size} / ${blocks.length}`, label: "Blocks run" },
            ].map((s, i) => (
              <div key={i} style={{ background: WA.kpiBg, borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: WA.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.n}</div>
                <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: "#6b6f68" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* owned actions */}
          {actions.length ? (
            <>
              <div style={{ fontFamily: WA.serif, fontSize: 17, fontWeight: 600, color: WA.ink, margin: "0 0 12px" }}>Owned actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {actions.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", ...card }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", background: "#e7efe9", color: WA.accent, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(a.owner_name ?? "—")}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: WA.ink, textDecoration: a.status === "done" ? "line-through" : "none" }}>{a.text}</div>
                      {a.detail ? <div style={{ marginTop: 2, fontSize: 12, color: WA.faint, lineHeight: 1.45 }}>{a.detail}</div> : null}
                      <div style={{ marginTop: 3, fontSize: 11.5, color: WA.faint2 }}>
                        {a.owner_name ?? "Unassigned"}{a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                        {a.priority ? <span style={{ marginLeft: 6, color: PRIO_COLOR[a.priority] ?? WA.faint2, fontWeight: 700 }}>{a.priority}</span> : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {/* captured by block */}
          <div style={{ fontFamily: WA.serif, fontSize: 17, fontWeight: 600, color: WA.ink, margin: "0 0 4px" }}>Captured by block</div>
          <div>
            {blocks.map((b) => {
              const ph = phaseOf((b.phase as string) ?? b.activity_type);
              const pv = PHASE_VIS[ph];
              const blockIdeas = ideasByBlock(b.ord);
              const lane = (l: string) => blockIdeas.filter((i) => (i.lane ?? "") === l);
              const groups = blockIdeas.filter((i) => (i.lane ?? "").startsWith("group:"));
              const decs = decisions.filter((d) => d.block_ord === b.ord && (d.status === "committed" || d.status === "decided"));
              const body = captured(b.activity_type, { blockIdeas, lane, groups, decs, voteCount, accent: pv.accent });
              if (!body) return null;
              return (
                <div key={b.ord} style={{ padding: "16px 0", borderBottom: `1px solid ${WA.hair}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, background: pv.tint, border: `1px solid ${pv.border}`, color: pv.accent, flexShrink: 0 }}>
                      <Icon name={actIcon(b.activity_type)} size={15} color={pv.accent} />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: WA.ink }}>{b.title}</span>
                    <span style={{ fontSize: 11, color: WA.faint2 }}>{PHASE_LABEL[ph]} · {ACTIVITY[b.activity_type]?.label ?? b.activity_type}</span>
                  </div>
                  {body}
                </div>
              );
            })}
            {ranBlocks.size === 0 ? (
              <div style={{ padding: "24px 0", fontSize: 13, color: WA.faint2, fontStyle: "italic" }}>No block content was captured in this session.</div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// Render the captured content for one block, by type. Returns null when there's
// nothing to show (so empty blocks are skipped).
function captured(
  type: string,
  ctx: {
    blockIdeas: { id: string; lane: string | null; text: string; detail: string | null; author_name: string | null }[];
    lane: (l: string) => { id: string; text: string; detail: string | null; author_name: string | null }[];
    groups: { lane: string | null; text: string; author_name: string | null }[];
    decs: { title: string; rationale: string | null }[];
    voteCount: Map<string, number>;
    accent: string;
  },
): React.ReactNode | null {
  const chip = (kids: React.ReactNode, key: string | number) => (
    <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", background: "#faf9f4", border: "1px solid #ece9df", borderRadius: 999, fontSize: 12.5, color: "#404040" }}>{kids}</span>
  );

  if (type === "checkin") {
    const rs = ctx.lane("checkin");
    if (!rs.length) return null;
    return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{rs.map((r) => chip(<>{r.author_name ? <b style={{ fontWeight: 600 }}>{initials(r.author_name)}</b> : null} {r.text}</>, r.id))}</div>;
  }
  if (type === "discussion") {
    const pts = ctx.lane("point");
    if (!pts.length) return null;
    return <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>{pts.map((p) => <li key={p.id} style={{ fontSize: 13, color: "#404040", lineHeight: 1.45 }}>{p.text}{p.author_name ? <span style={{ color: "#a6a698" }}> — {p.author_name}</span> : null}</li>)}</ul>;
  }
  if (type === "breakout") {
    if (!ctx.groups.length) return null;
    const byGroup = new Map<string, string[]>();
    for (const g of ctx.groups) {
      const name = (g.lane ?? "group:").slice("group:".length) || "Group";
      if (!byGroup.has(name)) byGroup.set(name, []);
      byGroup.get(name)!.push(g.text);
    }
    return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{Array.from(byGroup.entries()).map(([name, fs]) => <div key={name} style={{ fontSize: 13, color: "#404040" }}><b style={{ fontWeight: 600 }}>{name}:</b> {fs.join("; ")}</div>)}</div>;
  }
  if (type === "vote") {
    const opts = ctx.lane("option");
    if (!opts.length) return null;
    const ranked = opts.map((o) => ({ ...o, votes: ctx.voteCount.get(o.id) ?? 0 })).sort((a, b) => b.votes - a.votes);
    const total = ranked.reduce((s, o) => s + o.votes, 0) || 1;
    return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{ranked.map((o, i) => { const pct = Math.round((o.votes / total) * 100); return (
      <div key={o.id}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}><span style={{ fontWeight: i === 0 ? 700 : 500, color: WA.ink }}>{o.text}{i === 0 ? " · winner" : ""}</span><span style={{ color: "#8a8a7e", fontWeight: 700 }}>{o.votes} · {pct}%</span></div>
        <div style={{ height: 8, background: "#e4e1d5", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: ctx.accent }} /></div>
      </div>
    ); })}</div>;
  }
  if (type === "decision") {
    if (!ctx.decs.length) return null;
    return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{ctx.decs.map((d, i) => <div key={i} style={{ padding: "10px 12px", background: "#f1f6f2", border: "1px solid #cfe3d6", borderRadius: 9 }}><div style={{ fontSize: 13, fontWeight: 600, color: WA.ink }}>{d.rationale || d.title}</div></div>)}</div>;
  }
  if (type === "reflect") {
    const rs = ctx.lane("reflect");
    if (!rs.length) return null;
    return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{rs.map((r) => <div key={r.id} style={{ fontSize: 13, color: "#404040", lineHeight: 1.45 }}>{r.author_name ? <b style={{ fontWeight: 600 }}>{r.author_name}: </b> : null}{r.text}{r.detail ? <span style={{ color: "#8a8a7e" }}> — {r.detail}</span> : null}</div>)}</div>;
  }
  return null;
}
