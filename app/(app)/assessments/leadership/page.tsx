import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { LeadershipTest, type Category } from "./LeadershipTest";
import { ScoreReadout, type Readout } from "./ScoreReadout";

type TeamRow = { id: string; name: string; lead_user_id: string | null; workspace_id: string; deleted_at: string | null; is_lead: boolean };
type Aggregate = Readout & { ready?: boolean; respondents?: number; min?: number };

export default async function LeadershipTestPage({ searchParams }: { searchParams: { team?: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();

  // The teams a user can rate are the ones they belong to.
  const { data: tms } = await supabase
    .from("team_member")
    .select("is_lead, team:team(id, name, lead_user_id, workspace_id, deleted_at)")
    .eq("user_id", ctx.userId);
  const myTeams: TeamRow[] = (tms ?? [])
    .map((r) => {
      const t = r.team as unknown as Omit<TeamRow, "is_lead"> | null;
      return t ? { ...t, is_lead: !!r.is_lead } : null;
    })
    .filter((t): t is TeamRow => !!t && t.workspace_id === ctx.workspace.id && !t.deleted_at);

  const selected = myTeams.find((t) => t.id === searchParams.team) ?? myTeams[0] ?? null;
  const teamId = selected?.id ?? null;

  const { data: inv } = await supabase.rpc("leadership_inventory");
  const inventory = (inv as unknown as Category[]) ?? [];

  // The user's own saved response, scored for display.
  let priorResult: Readout | null = null;
  if (teamId) {
    const { data: mine } = await supabase
      .from("leadership_response")
      .select("scores")
      .eq("team_id", teamId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (mine?.scores) {
      const { data: scored } = await supabase.rpc("score_leadership", { p_scores: mine.scores });
      priorResult = (scored as unknown as Readout) ?? null;
    }
  }

  // Anonymized team aggregate — leads and admins only.
  const canManage = selected ? isAdmin(ctx.role) || selected.lead_user_id === ctx.userId || selected.is_lead : false;
  let aggregate: Aggregate | null = null;
  if (teamId && canManage) {
    const { data: agg } = await supabase.rpc("team_leadership_scores", { p_team: teamId });
    aggregate = (agg as unknown as Aggregate) ?? null;
  }

  return (
    <div>
      <Link className="hc-back" href="/assessments">← Assessments</Link>
      <h1 className="page-title">Leadership effectiveness test</h1>
      <p className="page-sub">
        A 63-item inventory across 21 facets, grounded in the Bang/Midelfart framework for leadership teams.
      </p>

      {myTeams.length > 1 ? (
        <div className="chips" style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
          {myTeams.map((t) => (
            <Link
              key={t.id}
              href={`/assessments/leadership?team=${t.id}`}
              className={`pill sm ${t.id === teamId ? "open" : "draft"}`}
              style={{ textDecoration: "none" }}
            >
              {t.name}
            </Link>
          ))}
        </div>
      ) : null}

      {teamId && canManage ? (
        <section className="lead-teampanel">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Team results — {selected?.name}</div>
          {aggregate?.ready ? (
            <ScoreReadout data={aggregate} />
          ) : (
            <div className="card empty">
              {aggregate
                ? `${aggregate.respondents ?? 0} of ${aggregate.min ?? 3} responses — the anonymized team aggregate appears once at least ${aggregate.min ?? 3} members respond.`
                : "No responses yet."}
            </div>
          )}
          <div className="eyebrow" style={{ margin: "28px 0 10px" }}>Your assessment</div>
        </section>
      ) : null}

      <LeadershipTest inventory={inventory} teamId={teamId} priorResult={priorResult} />
    </div>
  );
}
