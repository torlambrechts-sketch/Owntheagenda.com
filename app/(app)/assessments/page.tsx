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
    .select("id, name")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamList = teams ?? [];
  const teamNameById = new Map(teamList.map((t) => [t.id, t.name as string]));
  const teamIds = teamList.map((t) => t.id);

  const instruments = await resolveInstruments();
  const instNameByKind = new Map(Object.values(instruments).map((i) => [i.kind, i.name]));

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
    respondents: respCount.get(s.id) ?? 0,
    date: s.created_at,
  }));

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

  return <AssessmentSuite rows={rows} kpis={kpis} isAdmin={isAdmin(ctx.role)} />;
}
