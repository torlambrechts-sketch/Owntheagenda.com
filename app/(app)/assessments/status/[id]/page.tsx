import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { loadAssessmentDetail } from "../../suite/actions";
import { AssessmentStatus, type StatusData } from "./AssessmentStatus";

// Live run-status view for one assessment instance (a team survey) — KPIs,
// response-rate ring, responses-over-time, section scores, a live activity feed
// and a "trigger watch" that flags sections below the template threshold and
// offers a mitigation workshop. Lead/admin only. Adapts the design's by-unit
// table to our single-team model (section scores).
export default async function AssessmentStatusPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: survey } = await supabase
    .from("survey")
    .select("id, name, status, team_id, workspace_id, kind, definition, opened_at, due_at, anonymity")
    .eq("id", params.id)
    .maybeSingle();
  if (!survey || survey.workspace_id !== ctx.workspace.id) notFound();

  // Lead/admin gate: workspace admins, or a manager of the survey's team.
  let canManage = isAdmin(ctx.role);
  if (!canManage && survey.team_id) {
    const { data: mem } = await supabase
      .from("team_member")
      .select("is_lead")
      .eq("team_id", survey.team_id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    canManage = !!mem?.is_lead;
  }
  if (!canManage) redirect("/assessments");

  const { data: team } = survey.team_id
    ? await supabase.from("team").select("name").eq("id", survey.team_id).maybeSingle()
    : { data: null as { name: string } | null };

  const [{ detail }, partRes] = await Promise.all([
    loadAssessmentDetail(survey.id as string),
    supabase.rpc("survey_participation", { p_survey: survey.id }),
  ]);

  const participation = (partRes.data ?? []) as { user_id: string; completed: boolean }[];
  const invited = participation.length;
  const responded = participation.filter((p) => p.completed).length;
  const def = (survey.definition ?? {}) as { threshold?: number };
  const threshold = typeof def.threshold === "number" ? def.threshold : null;

  // Trigger watch: sections below the template threshold (when set) or, failing
  // that, below the healthy band (band 0). Only meaningful once results unmask.
  const scores = detail?.scores ?? [];
  const triggered = scores
    .filter((s) => (threshold != null ? s.mean < threshold : s.band === 0))
    .map((s) => ({ label: s.label, mean: s.mean }));

  const data: StatusData = {
    surveyId: survey.id as string,
    name: (survey.name as string) || detail?.instrumentName || "Assessment",
    status: survey.status as string,
    teamId: survey.team_id as string | null,
    teamName: team?.name ?? null,
    openedAt: survey.opened_at as string | null,
    dueAt: survey.due_at as string | null,
    invited,
    responded,
    masked: detail?.masked ?? true,
    respondents: detail?.respondents ?? responded,
    submissions: detail?.submissions ?? [],
    scale: detail?.scale ?? { min: 1, max: 5, minLabel: "", maxLabel: "" },
    sections: scores.map((s) => ({ label: s.label, mean: s.mean, pct: s.pct, band: s.band })),
    overall: detail?.overall ?? null,
    threshold,
    triggered,
    linkedWorkshop: detail?.linkedWorkshop ?? null,
    activity: detail?.activity ?? [],
  };

  return <AssessmentStatus data={data} />;
}
