import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { resolveInstruments } from "@/lib/assessments";
import { instrumentFromRow } from "@/lib/survey";
import { SurveyRespond } from "../SurveyRespond";

// "Take assessment" — the handoff's runner entry point. Lists the open
// assessments the signed-in member can respond to (across their teams) and
// runs the existing consent → questions → done flow via SurveyRespond. Fully
// database-driven; results submit through submit_survey_response.
export default async function TakeAssessmentPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  // Teams the user belongs to (RLS already limits visibility); open surveys for
  // those teams are the ones they can take.
  const { data: tms } = await supabase
    .from("team_member")
    .select("team_id")
    .eq("user_id", ctx.userId);
  const teamIds = Array.from(new Set((tms ?? []).map((t) => t.team_id as string)));

  // Surveys the member can take = open surveys for any team they belong to,
  // counting both the primary team and any secondary team (survey_team) a
  // multi-team assessment targets. The survey's own definition snapshot is the
  // source of truth for the questions (so custom builds + edits render
  // correctly), falling back to the catalog instrument by kind.
  type Row = { id: string; name: string | null; kind: string; anonymity: string | null; status: string; definition: unknown };
  const cols = "id, name, kind, anonymity, status, definition";
  const { data: primaryRows } = teamIds.length
    ? await supabase.from("survey").select(cols).in("team_id", teamIds).eq("status", "open").order("created_at", { ascending: false })
    : { data: [] as Row[] };
  const { data: stRows } = teamIds.length
    ? await supabase.from("survey_team").select("survey_id").in("team_id", teamIds)
    : { data: [] as { survey_id: string }[] };
  const primaryIds = new Set((primaryRows ?? []).map((r) => r.id as string));
  const extraIds = Array.from(new Set((stRows ?? []).map((r) => r.survey_id as string))).filter((id) => !primaryIds.has(id));
  const { data: extraRows } = extraIds.length
    ? await supabase.from("survey").select(cols).in("id", extraIds).eq("status", "open")
    : { data: [] as Row[] };
  const surveyRows: Row[] = [...((primaryRows as Row[]) ?? []), ...((extraRows as Row[]) ?? [])];

  const instruments = await resolveInstruments();
  const instNameByKind = new Map(Object.values(instruments).map((i) => [i.kind, i.name]));

  const surveys = surveyRows.map((s) => {
    const snapshot = instrumentFromRow({ key: s.kind, name: (s.name ?? s.kind) as string, definition: s.definition });
    const instrument = snapshot ?? instruments[s.kind] ?? null;
    return {
      id: s.id,
      name: (instrument?.name ?? instNameByKind.get(s.kind) ?? s.name ?? s.kind) as string,
      kind: s.kind,
      anonymity: (s.anonymity ?? "anonymous") as string,
      instrument,
    };
  });

  return (
    <>
      <div className="a-phead">
        <div>
          <div className="a-pt">Take an assessment</div>
          <div className="a-ps">Open assessments for your teams. You&rsquo;ll be asked to consent before any questions — anonymous responses are stripped of identity on submit.</div>
        </div>
      </div>

      {surveys.length ? (
        <SurveyRespond surveys={surveys} userId={ctx.userId} instruments={instruments} />
      ) : (
        <div className="empty">No open assessments for you right now. When a lead opens one for your team, it appears here.</div>
      )}
    </>
  );
}
