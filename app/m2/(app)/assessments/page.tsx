import Link from "next/link";
import { ClipboardList, ClipboardCheck, Plus, Library, CheckCircle2 } from "lucide-react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeam } from "@/lib/m2/context";
import { isManagerOrAbove } from "@/lib/util";
import { startAssessment } from "./actions";

const STATUS_TINT: Record<string, string> = { draft: "draft", open: "open", closed: "interview" };

export default async function M2Assessments({
  searchParams,
}: {
  searchParams: { done?: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;
  const canManage = isManagerOrAbove(ctx.role);
  const team = await getActiveTeam(supabase, ctx);

  const [{ data: templates }, sent] = await Promise.all([
    supabase
      .from("assessment_template")
      .select("id, key, name, category, scope, source, description")
      .or(`workspace_id.eq.${wsId},workspace_id.is.null`)
      .order("name", { ascending: true }),
    team
      ? supabase
          .from("pulse")
          .select("id, name, status, opened_at, closed_at, created_at")
          .eq("team_id", team.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; name: string; status: string; opened_at: string | null; closed_at: string | null; created_at: string }[] }),
  ]);

  const sentList = sent.data ?? [];

  // Response counts per pulse via the definer aggregate (anonymity-safe).
  const respCount = new Map<string, number>();
  await Promise.all(
    sentList.map(async (p) => {
      const { data } = await supabase.rpc("m2_pulse_participation", { p_pulse: p.id });
      respCount.set(p.id, (data ?? [])[0]?.responded ?? 0);
    }),
  );

  return (
    <div>
      <div className="m2-page-head">
        <div>
          <div className="m2-eyebrow">Measure</div>
          <h1 className="m2-title">Assessments</h1>
          <p className="m2-sub">
            {team ? `Run a research-backed measure for ${team.name}.` : "Create a team to run an assessment."}
          </p>
        </div>
      </div>

      {/* Your assessments */}
      {searchParams?.done ? (
        <div className="m2-banner">
          <CheckCircle2 size={18} /> Thanks — your responses are in. +10 XP banked per answer.
        </div>
      ) : null}

      <div className="m2-sec-head" style={{ marginTop: 4 }}>
        <h2>Your assessments</h2>
      </div>
      {sentList.length === 0 ? (
        <div className="m2-empty">
          <ClipboardCheck />
          <b>No assessments yet</b>
          <p>Pick a framework from the library below to capture this cycle&rsquo;s baseline.</p>
        </div>
      ) : (
        <div className="m2-list">
          {sentList.map((p) => (
            <div className="m2-row" key={p.id}>
              <span className="m2-row-ic" style={{ background: "var(--open-bg)", color: "var(--open-fg)" }}>
                <ClipboardCheck size={18} />
              </span>
              <div className="m2-row-main">
                <div className="m2-row-title">{p.name}</div>
                <div className="m2-row-sub">
                  {respCount.get(p.id) ?? 0} response{(respCount.get(p.id) ?? 0) === 1 ? "" : "s"}
                  {p.opened_at ? ` · opened ${new Date(p.opened_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </div>
              </div>
              <div className="m2-row-end">
                {p.status === "open" ? (
                  <Link className="m2-btn sm" href={`/m2/assessments/${p.id}/take`}>
                    Respond
                  </Link>
                ) : null}
                <span className={`m2-pill ${STATUS_TINT[p.status] ?? "draft"}`}>{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Library */}
      <div className="m2-sec-head">
        <h2>Assessment library</h2>
        <span style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Library size={14} /> {templates?.length ?? 0} frameworks
        </span>
      </div>
      {(templates?.length ?? 0) === 0 ? (
        <div className="m2-empty">
          <ClipboardList />
          <b>No templates available</b>
          <p>Your workspace doesn&rsquo;t have any assessment templates yet.</p>
        </div>
      ) : (
        <div className="m2-catalog">
          {(templates ?? []).map((t) => (
            <div className="m2-cat-card" key={t.id}>
              <span className="m2-row-ic" style={{ background: "var(--interview-bg)", color: "var(--interview-fg)" }}>
                <ClipboardList size={18} />
              </span>
              <h3>{t.name}</h3>
              <p>{t.description ?? "A structured measure of how your team works together."}</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.source ?? t.category ?? "Team"}</span>
                {canManage && team ? (
                  <form action={startAssessment}>
                    <input type="hidden" name="team_id" value={team.id} />
                    <input type="hidden" name="name" value={t.name} />
                    <button className="m2-btn sm" type="submit">
                      <Plus size={14} /> Start
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
