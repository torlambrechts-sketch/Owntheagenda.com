import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { resolveInstruments } from "@/lib/assessments";
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

  // Per-survey metrics in one set-based call: response count + invited (team
  // size), masking, overall band position, sections below band, and whether a
  // workshop was triggered. Powers the row Score marker + response-rate bar and
  // the KPIs/alert exactly, in a single round-trip. Not in the committed
  // generated types (kept un-regenerated to avoid drift), so it's cast and
  // guarded — a missing migration or any error degrades to no metrics.
  type OverviewMetric = { survey_id: string; respondents: number; invited: number; masked: boolean; overall_mean: number | null; overall_pct: number | null; below_count: number; has_workshop: boolean };
  const overviewRpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: OverviewMetric[] | null; error: unknown }>;
  const { data: metricRows, error: metricErr } = await overviewRpc("assessment_suite_overview", { p_workspace: ctx.workspace.id });
  const metrics = new Map<string, OverviewMetric>();
  if (!metricErr) for (const m of metricRows ?? []) metrics.set(m.survey_id, m);

  const rows: SuiteRow[] = (surveyRows ?? []).map((s) => {
    const m = metrics.get(s.id);
    return {
      id: s.id,
      name: instNameByKind.get(s.kind) ?? s.name ?? s.kind,
      kind: s.kind,
      category: "Survey",
      status: s.status,
      team: teamNameById.get(s.team_id) ?? null,
      teamId: s.team_id,
      respondents: m?.respondents ?? 0,
      invited: m?.invited ?? null,
      score: m && !m.masked ? m.overall_mean : null,
      pct: m && !m.masked ? m.overall_pct : null,
      masked: m ? m.masked : true,
      date: s.created_at,
    };
  });

  // KPIs + alert from the full metric set (every readable survey, not just the
  // listed page), so the headline numbers stay accurate.
  const all = Array.from(metrics.values());
  const withInvited = all.filter((m) => m.invited > 0);
  const avgRate = withInvited.length
    ? Math.round((withInvited.reduce((a, m) => a + Math.min(1, m.respondents / m.invited), 0) / withInvited.length) * 100)
    : null;
  const sectionsBelow = all.reduce((a, m) => a + m.below_count, 0);
  const assessmentsBelow = all.filter((m) => m.below_count > 0).length;
  const workshopsTriggered = all.filter((m) => m.has_workshop).length;
  const alert = sectionsBelow > 0 ? { sections: sectionsBelow, assessments: assessmentsBelow } : null;

  const openCount = rows.filter((r) => r.status === "open").length;
  const kpis = [
    { big: String(openCount), title: "Active assessments", sub: `${rows.length} total across ${teamList.length} ${teamList.length === 1 ? "team" : "teams"}` },
    { big: avgRate == null ? "—" : `${avgRate}%`, title: "Avg response rate", sub: withInvited.length ? `${withInvited.length} with a target team` : "no responses yet" },
    { big: String(sectionsBelow), title: "Sections below band", sub: assessmentsBelow ? `${assessmentsBelow} ${assessmentsBelow === 1 ? "assessment" : "assessments"}` : "all within band" },
    { big: String(workshopsTriggered), title: "Workshops triggered", sub: "from an assessment" },
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
