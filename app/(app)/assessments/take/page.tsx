import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { resolveInstruments } from "@/lib/assessments";
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

  const { data: surveyRows } = teamIds.length
    ? await supabase
        .from("survey")
        .select("id, name, kind, anonymity, status")
        .in("team_id", teamIds)
        .eq("status", "open")
        .order("created_at", { ascending: false })
    : { data: [] as { id: string; name: string | null; kind: string; anonymity: string | null; status: string }[] };

  const instruments = await resolveInstruments();
  const instNameByKind = new Map(Object.values(instruments).map((i) => [i.kind, i.name]));

  const surveys = (surveyRows ?? []).map((s) => ({
    id: s.id as string,
    name: (instNameByKind.get(s.kind as string) ?? s.name ?? s.kind) as string,
    kind: s.kind as string,
    anonymity: (s.anonymity as string | null) ?? "anonymous",
  }));

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
