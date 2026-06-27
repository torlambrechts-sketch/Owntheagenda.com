import Link from "next/link";
import { ArrowLeft, Share2, Trophy, Play, CheckCircle2, Circle } from "lucide-react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isManagerOrAbove } from "@/lib/util";
import { toggleWorkshopAction } from "./actions";

export default async function M2WorkshopOutcomes({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();
  const canManage = isManagerOrAbove(ctx.role);

  const { data: ws } = await supabase
    .from("workshop")
    .select("id, title, status, scheduled_at, team_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!ws) {
    return (
      <div>
        <Back />
        <div className="m2-empty">
          <Trophy />
          <b>Workshop not found</b>
          <Link className="m2-btn" href="/m2/workshops">Back to workshops</Link>
        </div>
      </div>
    );
  }

  const { data: actions } = await supabase
    .from("action_item")
    .select("id, text, owner_name, due_at, status, created_at")
    .eq("workshop_id", ws.id)
    .order("created_at", { ascending: true });

  const list = actions ?? [];
  const done = list.filter((a) => a.status === "done").length;
  const total = list.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const dueSoon = list.filter(
    (a) => a.status !== "done" && a.due_at && new Date(a.due_at) < new Date(Date.now() + 7 * 864e5),
  ).length;
  const runnable = ws.status === "scheduled" || ws.status === "live" || ws.status === "draft";

  return (
    <div>
      <Back />
      <div className="m2-page-head">
        <div>
          <div className="m2-eyebrow">
            Workshop
            {ws.scheduled_at ? ` · ${new Date(ws.scheduled_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}` : ""}
          </div>
          <h1 className="m2-title">{ws.title}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {runnable ? (
            <Link className="m2-btn sec" href={`/run/${ws.id}`}>
              <Play size={15} /> {ws.status === "live" ? "Resume" : "Open in run"}
            </Link>
          ) : null}
          <button className="m2-btn" type="button" disabled>
            <Share2 size={15} /> Share recap
          </button>
        </div>
      </div>

      {/* outcomes summary */}
      <div className="m2-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <div style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
            <svg width="84" height="84" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r="36" fill="none" stroke="var(--canvas-2)" strokeWidth="7" />
              <circle cx="42" cy="42" r="36" fill="none" stroke="var(--green)" strokeWidth="7" strokeDasharray={2 * Math.PI * 36} strokeDashoffset={2 * Math.PI * 36 * (1 - pct / 100)} strokeLinecap="round" transform="rotate(-90 42 42)" />
            </svg>
            <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, lineHeight: 1 }}>{pct}%</span>
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>
              We agreed on {total} action{total === 1 ? "" : "s"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
              {done} of {total} closed{dueSoon ? ` · ${dueSoon} due soon` : ""}
            </div>
          </div>
          {total > 0 && done < total ? (
            <div className="m2-card tight" style={{ background: "var(--internal-bg)", borderColor: "#e6d6a8", maxWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "var(--internal-fg)" }}>
                <Trophy size={15} /> Close all {total} to earn &ldquo;All actions closed&rdquo;
              </div>
            </div>
          ) : total > 0 && done === total ? (
            <span className="m2-pill open"><Trophy size={12} /> Loop closed</span>
          ) : null}
        </div>
      </div>

      {/* actions table */}
      <div className="m2-sec-head"><h2>Outcomes &amp; actions</h2></div>
      {total === 0 ? (
        <div className="m2-empty">
          <Circle />
          <b>No actions captured yet</b>
          <p>Actions committed during the live session will appear here to track through to done.</p>
        </div>
      ) : (
        <div className="m2-list">
          {list.map((a) => (
            <div className="m2-row" key={a.id}>
              <span
                className="m2-row-ic"
                style={{
                  background: a.status === "done" ? "var(--open-bg)" : "var(--canvas-2)",
                  color: a.status === "done" ? "var(--open-fg)" : "var(--faint)",
                }}
              >
                {a.status === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </span>
              <div className="m2-row-main">
                <div className="m2-row-title" style={{ textDecoration: a.status === "done" ? "line-through" : "none", color: a.status === "done" ? "var(--muted)" : "var(--ink)" }}>
                  {a.text}
                </div>
                <div className="m2-row-sub">
                  {a.owner_name ? `${a.owner_name}` : "Unassigned"}
                  {a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </div>
              </div>
              <div className="m2-row-end">
                {canManage ? (
                  <form action={toggleWorkshopAction}>
                    <input type="hidden" name="action_id" value={a.id} />
                    <input type="hidden" name="workshop_id" value={ws.id} />
                    <button className={`m2-btn sm ${a.status === "done" ? "ghost" : "sec"}`} type="submit">
                      {a.status === "done" ? "Reopen" : "Close"}
                    </button>
                  </form>
                ) : (
                  <span className={`m2-pill ${a.status === "done" ? "open" : "draft"}`}>{a.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Back() {
  return (
    <Link href="/m2/workshops" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", textDecoration: "none", marginBottom: 14 }}>
      <ArrowLeft size={14} /> Back to workshops
    </Link>
  );
}
