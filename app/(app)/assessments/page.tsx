import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { resolveInstruments } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys } from "@/lib/survey";
import { AssessmentSuite, type SuiteRow } from "./suite/AssessmentSuite";

// Assessment Suite — an organisation-wide hub over the assessment *instances*
// (team surveys), adapted from the imported "Assessment Suite" design into the
// app's own design language. The instrument library (taking / reports) still
// lives at /assessments; this is the operational overview across teams.
export default async function AssessmentSuitePage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamList = teams ?? [];
  const teamNameById = new Map(teamList.map((t) => [t.id, t.name as string]));
  const teamIds = teamList.map((t) => t.id);

  // Teams the caller can start an assessment for: admins manage all; leads manage
  // teams they lead (team.lead_user_id or a team_member is_lead flag).
  const admin = isAdmin(ctx.role);
  const { data: leadMem } = !admin && teamIds.length
    ? await supabase.from("team_member").select("team_id").eq("user_id", ctx.userId).eq("is_lead", true).in("team_id", teamIds)
    : { data: [] as { team_id: string }[] };
  const leadTeamIds = new Set<string>([
    ...teamList.filter((t) => t.lead_user_id === ctx.userId).map((t) => t.id),
    ...(leadMem ?? []).map((m) => m.team_id),
  ]);
  const manageableTeams = (admin ? teamList : teamList.filter((t) => leadTeamIds.has(t.id)))
    .map((t) => ({ id: t.id as string, name: t.name as string }));

  const instruments = await resolveInstruments();
  const instNameByKind = new Map(Object.values(instruments).map((i) => [i.kind, i.name]));

  // Team-scoped instruments that can be started for a team (the "New assessment" picker).
  const { data: tmplRows } = await supabase
    .from("assessment_template")
    .select("key, name")
    .eq("scope", "team")
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspace.id}`)
    .order("name");
  const templates = (tmplRows ?? []).map((t) => ({ key: t.key as string, name: t.name as string }));

  // One cheap pass over every survey across the caller's teams. No per-survey
  // scoring here — that is resolved lazily when a row is opened.
  const { data: surveyRows } = teamIds.length
    ? await supabase
        .from("survey")
        .select("id, name, kind, status, team_id, created_at")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as { id: string; name: string | null; kind: string; status: string; team_id: string; created_at: string }[] };

  const sIds = (surveyRows ?? []).map((s) => s.id);
  const { data: respRows } = sIds.length
    ? await supabase.from("survey_response").select("survey_id").in("survey_id", sIds)
    : { data: [] as { survey_id: string }[] };
  const respCount = new Map<string, number>();
  for (const r of respRows ?? []) respCount.set(r.survey_id, (respCount.get(r.survey_id) ?? 0) + 1);

  const rows: SuiteRow[] = (surveyRows ?? []).map((s) => ({
    id: s.id,
    name: instNameByKind.get(s.kind) ?? s.name ?? s.kind,
    kind: s.kind,
    category: "Survey",
    status: s.status,
    team: teamNameById.get(s.team_id) ?? null,
    teamId: s.team_id,
    respondents: respCount.get(s.id) ?? 0,
    date: s.created_at,
  }));

  // Below-band signal for the suite alert. We only score assessments that
  // actually have responses, cap the set, and run the RPCs in parallel so the
  // overview stays a fast page. Banding mirrors the detail loader (a section is
  // "below band" under 45% of its scale); masked results contribute nothing, so
  // a small response set is never inferable. Errors degrade to "no alert".
  const instByKind = new Map(Object.values(instruments).map((i) => [i.kind, i]));
  const toScore = rows.filter((r) => r.respondents > 0).slice(0, 40);
  let belowSections = 0;
  const belowAssessments = new Set<string>();
  await Promise.all(
    toScore.map(async (r) => {
      const inst = instByKind.get(r.kind);
      if (!inst) return;
      const { data: res } = await supabase.rpc("survey_results", { p_survey: r.id, p_strength_items: strengthItemKeys(inst) });
      const rr = res as { masked: boolean; items: { item_key: string; mean: number; n: number }[] } | null;
      if (!rr || rr.masked) return;
      const below = dimensionMeans(inst, rr.items ?? [])
        .filter((d): d is { key: string; label: string; blurb: string; mean: number } => d.mean != null)
        .filter((d) => ((d.mean - inst.scale.min) / (inst.scale.max - inst.scale.min)) * 100 < 45).length;
      if (below) { belowSections += below; belowAssessments.add(r.id); }
    }),
  );
  const alert = belowSections ? { sections: belowSections, assessments: belowAssessments.size } : null;

  const openCount = rows.filter((r) => r.status === "open").length;
  const closedCount = rows.filter((r) => r.status === "closed").length;
  const totalResponses = rows.reduce((a, r) => a + r.respondents, 0);
  const instrumentsUsed = new Set(rows.map((r) => r.kind)).size;
  const kpis = [
    { big: String(openCount), title: "Open assessments", sub: `${rows.length} total across ${teamList.length} ${teamList.length === 1 ? "team" : "teams"}` },
    { big: String(totalResponses), title: "Responses gathered", sub: "all assessments" },
    { big: String(closedCount), title: "Closed", sub: "results finalised" },
    { big: String(instrumentsUsed), title: "Instruments in use", sub: "distinct frameworks" },
  ];

  if (!teamList.length) {
    return (
      <>
        <div className="a-phead">
          <div>
            <div className="a-pt">Assessment suite</div>
            <div className="a-ps">An organisation-wide overview of every assessment across your teams.</div>
          </div>
        </div>
        <div className="empty">
          Create a team first — assessments run for a team. <Link className="linkbtn" href="/teams">Go to teams ›</Link>
        </div>
      </>
    );
  }

  return <AssessmentSuite rows={rows} kpis={kpis} alert={alert} isAdmin={admin} canStart={admin || manageableTeams.length > 0} manageableTeamIds={manageableTeams.map((t) => t.id)} teams={manageableTeams} templates={templates} />;
}
