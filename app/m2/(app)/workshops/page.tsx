import Link from "next/link";
import { Presentation, Plus, Calendar, Play } from "lucide-react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeam } from "@/lib/m2/context";
import { isManagerOrAbove } from "@/lib/util";
import { planWorkshop } from "./actions";

const STATUS_TINT: Record<string, string> = { draft: "draft", scheduled: "interview", live: "open", done: "open" };
const STATUS_ORDER: Record<string, number> = { live: 0, scheduled: 1, draft: 2, done: 3 };

export default async function M2Workshops() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;
  const canManage = isManagerOrAbove(ctx.role);
  const team = await getActiveTeam(supabase, ctx);

  const [{ data: templates }, ws] = await Promise.all([
    supabase
      .from("template")
      .select("id, name, category, source, default_duration")
      .or(`workspace_id.eq.${wsId},workspace_id.is.null`)
      .order("name", { ascending: true })
      .limit(12),
    team
      ? supabase
          .from("workshop")
          .select("id, title, status, scheduled_at")
          .eq("team_id", team.id)
          .order("scheduled_at", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as { id: string; title: string; status: string; scheduled_at: string | null }[] }),
  ]);

  const workshops = [...(ws.data ?? [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  return (
    <div>
      <div className="m2-page-head">
        <div>
          <div className="m2-eyebrow">Run</div>
          <h1 className="m2-title">Workshops</h1>
          <p className="m2-sub">
            {team ? `Plan and run guided sessions for ${team.name}.` : "Create a team to plan a workshop."}
          </p>
        </div>
      </div>

      <div className="m2-sec-head" style={{ marginTop: 4 }}>
        <h2>Your workshops</h2>
      </div>
      {workshops.length === 0 ? (
        <div className="m2-empty">
          <Presentation />
          <b>No workshops planned</b>
          <p>Plan one from a template below — each turns an assessment result into a guided agenda.</p>
        </div>
      ) : (
        <div className="m2-list">
          {workshops.map((w) => {
            const runnable = w.status === "scheduled" || w.status === "live" || w.status === "draft";
            return (
              <div className="m2-row" key={w.id}>
                <span className="m2-row-ic" style={{ background: "var(--interview-bg)", color: "var(--interview-fg)" }}>
                  <Presentation size={18} />
                </span>
                <Link className="m2-row-main" href={`/m2/workshops/${w.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="m2-row-title">{w.title}</div>
                  <div className="m2-row-sub">
                    {w.scheduled_at
                      ? new Date(w.scheduled_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : "Not scheduled"}
                  </div>
                </Link>
                <div className="m2-row-end">
                  <span className={`m2-pill ${STATUS_TINT[w.status] ?? "draft"}`}>{w.status}</span>
                  {runnable ? (
                    <Link className="m2-btn sm" href={`/run/${w.id}`}>
                      <Play size={13} /> {w.status === "live" ? "Resume" : "Start"}
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="m2-sec-head">
        <h2>Plan from a template</h2>
      </div>
      <div className="m2-catalog">
        {(templates ?? []).map((t) => (
          <div className="m2-cat-card" key={t.id}>
            <span className="m2-row-ic" style={{ background: "var(--open-bg)", color: "var(--open-fg)" }}>
              <Calendar size={18} />
            </span>
            <h3>{t.name}</h3>
            <p>{t.source ?? t.category ?? "Guided team session"}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {t.default_duration ? `~${t.default_duration} min` : "Flexible"}
              </span>
              {canManage && team ? (
                <form action={planWorkshop}>
                  <input type="hidden" name="team_id" value={team.id} />
                  <input type="hidden" name="title" value={t.name} />
                  <input type="hidden" name="template_id" value={t.id} />
                  <button className="m2-btn sm" type="submit">
                    <Plus size={14} /> Plan
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
