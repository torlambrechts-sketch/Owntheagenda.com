import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { DashboardOverview } from "../dashboard/DashboardOverview";
import { DYNAMIC_LABEL } from "@/lib/grounding";
import { resolveInstrument } from "@/lib/assessments";
import {
  InsightDashboard,
  type DashboardProps,
  type SectionVM,
  type TeamVM,
  type TrendPoint,
  type BarPoint,
  type WorkshopVM,
  type AssessmentRow,
  type WorkshopOutcomeRow,
  type WorkshopKpis,
} from "./InsightDashboard";
import { assessmentDetail, listReports, type AssessmentDetailVM } from "./actions";

// Insights dashboard (overview). Like Trends/Leadership Teams this rolls up
// every team via definer RPCs, so scoped facilitators don't get it. Admins and
// team leads can view; scoped facilitators are redirected to /dashboard.
//
// All numbers are REAL workspace data; anything masked/missing renders as "—".

// Shape returned by workspace_health (one object per team). Only the fields
// used here are typed.
type HealthEntity = {
  team_id: string;
  name: string;
  lead: string | null;
  dynamics: { score: number; in_band: number; total: number; history: number[] | null } | null;
};

type DynRow = {
  dynamic: string;
  label: string;
  pct: number | null;
  responses: number;
  target_low: number;
  target_high: number;
};

export default async function InsightPage() {
  const ctx = await requireSession();
  // Dashboard + Insights are one surface now. Scoped facilitators only get the
  // Dashboard tab (no workspace-wide analytics) — render it without loading any
  // of the admin rollups below.
  if (ctx.role === "facilitator") {
    const empty: DashboardProps = {
      kpis: { activeAssessments: 0, avgScore: null, responses: 0, belowThreshold: 0, workshopsScheduled: 0, participation: null },
      trend: [], participationByTeam: [], sections: [], workshops: [], teams: [],
      assessmentRows: [], defaultAssessmentId: null, defaultDetail: null,
      workshopOutcomes: [], workshopKpis: { workshopsRun: 0, avgLift: null, actionsDone: 0, actionsTotal: 0, attendance: null },
      reports: { schedules: [], runs: [], canManage: false },
    };
    return <InsightDashboard {...empty} facilitator dashboardSlot={<DashboardOverview />} />;
  }
  const supabase = createClient();

  // ---- workspace Health rollup (one row per team) ----
  const { data: healthData } = await supabase.rpc("workspace_health", { p_workspace: ctx.workspace.id });
  const entities = ((healthData as unknown as HealthEntity[]) ?? []).filter(Boolean);

  // ---- teams ----
  const { data: teamRows } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamList = teamRows ?? [];

  // ---- per-team dynamics detail (5 dynamics each) ----
  const dynResults = await Promise.all(
    teamList.map((t) => supabase.rpc("team_dynamics", { p_team: t.id }))
  );
  const dynByTeam = new Map<string, DynRow[]>();
  teamList.forEach((t, i) => {
    dynByTeam.set(t.id, (dynResults[i].data ?? []) as DynRow[]);
  });

  // ---- below-band rollup: assessment_suite_overview supersedes the old
  // assessment_below_band_rollup. We sum its per-survey below_count for the
  // "Below threshold" KPI (sections below band across the suite). The RPC may be
  // absent from the generated types (migration newer than the typegen), so we
  // call it untyped, mirroring app/(app)/assessments/page.tsx. ----
  type SuiteRow = { survey_id: string; below_count: number | null };
  const callRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: SuiteRow[] | null; error: unknown }>;
  let sectionsBelow = 0;
  try {
    const { data: suiteRows } = await callRpc("assessment_suite_overview", { p_workspace: ctx.workspace.id });
    sectionsBelow = (suiteRows ?? []).reduce((n, r) => n + (r.below_count ?? 0), 0);
  } catch {
    sectionsBelow = 0;
  }

  // ---- KPI: active assessments (open surveys + open pulses) ----
  const [openSurveysRes, openPulsesRes] = await Promise.all([
    supabase.from("survey").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("status", "open"),
    supabase.from("pulse").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("status", "open"),
  ]);
  const activeAssessments = (openSurveysRes.count ?? 0) + (openPulsesRes.count ?? 0);

  // ---- KPI: responses (survey_response for this workspace's surveys +
  // pulse_response for this workspace's pulses). Fetch the workspace's
  // survey/pulse ids, then count responses scoped to them. ----
  const [{ data: wsSurveys }, { data: wsPulses }] = await Promise.all([
    supabase.from("survey").select("id").eq("workspace_id", ctx.workspace.id),
    supabase.from("pulse").select("id").eq("workspace_id", ctx.workspace.id),
  ]);
  const surveyIds = (wsSurveys ?? []).map((s) => s.id);
  const pulseIds = (wsPulses ?? []).map((p) => p.id);
  const [sRespRes, pRespRes] = await Promise.all([
    surveyIds.length
      ? supabase.from("survey_response").select("id", { count: "exact", head: true }).in("survey_id", surveyIds)
      : Promise.resolve({ count: 0 }),
    pulseIds.length
      ? supabase.from("pulse_response").select("id", { count: "exact", head: true }).in("pulse_id", pulseIds)
      : Promise.resolve({ count: 0 }),
  ]);
  const responses = (sRespRes.count ?? 0) + (pRespRes.count ?? 0);

  // ---- KPI: workshops scheduled ----
  const { count: workshopsScheduled } = await supabase
    .from("workshop")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", "scheduled");

  // ---- KPI: avg score (workspace mean of teams' dynamics.score, 0-100) ----
  const teamScores = entities.map((e) => e.dynamics?.score).filter((v): v is number => v != null);
  const avgScore = teamScores.length ? teamScores.reduce((a, b) => a + b, 0) / teamScores.length : null;

  // ---- Participation: per team, the latest CLOSED pulse's response rate
  // (responded / total) via pulse_participation. The overall KPI is the mean of
  // those team rates. Defensible: it reflects how many invited members actually
  // answered the most recent pulse cycle per team. ----
  const { data: closedPulses } = await supabase
    .from("pulse")
    .select("id, team_id, closed_at")
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", "closed")
    .order("closed_at", { ascending: false });
  const latestClosedByTeam = new Map<string, string>();
  for (const p of closedPulses ?? []) {
    if (p.team_id && !latestClosedByTeam.has(p.team_id)) latestClosedByTeam.set(p.team_id, p.id);
  }
  const partResults = await Promise.all(
    teamList.map((t) => {
      const pid = latestClosedByTeam.get(t.id);
      return pid ? supabase.rpc("pulse_participation", { p_pulse: pid }) : Promise.resolve({ data: null });
    })
  );
  const partByTeam = new Map<string, number | null>();
  teamList.forEach((t, i) => {
    const rows = (partResults[i].data ?? null) as { completed: boolean }[] | null;
    if (rows && rows.length) {
      const completed = rows.filter((r) => r.completed).length;
      partByTeam.set(t.id, Math.round((completed / rows.length) * 100));
    } else {
      partByTeam.set(t.id, null);
    }
  });
  const partVals = teamList.map((t) => partByTeam.get(t.id)).filter((v): v is number => v != null);
  const participation = partVals.length ? partVals.reduce((a, b) => a + b, 0) / partVals.length : null;

  // ---- Overview: average score trend = workspace mean of teams' dynamics
  // history per index. Histories are oldest -> newest; align on the shortest. ----
  const histories = entities.map((e) => e.dynamics?.history).filter((h): h is number[] => Array.isArray(h) && h.length > 0);
  const minLen = histories.length ? Math.min(...histories.map((h) => h.length)) : 0;
  const trend: TrendPoint[] = [];
  for (let i = 0; i < minLen; i++) {
    const idxFromEnd = minLen - i; // P-(n-1) .. P0
    const vals = histories.map((h) => h[h.length - minLen + i]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    trend.push({ l: idxFromEnd === 1 ? "P0" : `P-${idxFromEnd - 1}`, v: Math.round(mean * 10) / 10 });
  }

  // ---- Overview: participation by team bar chart ----
  const participationByTeam: BarPoint[] = teamList
    .map((t): BarPoint | null => {
      const v = partByTeam.get(t.id);
      return v == null ? null : { l: shortLabel(t.name), v, flagged: v < 60 };
    })
    .filter((b): b is BarPoint => b != null);

  // ---- Overview: score distribution by section = workspace mean pct per
  // dynamic across teams, with the dynamic's target band. ----
  const sectionAgg = new Map<string, { label: string; sum: number; n: number; target_low: number; target_high: number }>();
  for (const t of teamList) {
    for (const d of dynByTeam.get(t.id) ?? []) {
      const cur = sectionAgg.get(d.dynamic) ?? {
        label: d.label ?? DYNAMIC_LABEL[d.dynamic] ?? d.dynamic,
        sum: 0,
        n: 0,
        target_low: d.target_low,
        target_high: d.target_high,
      };
      if (d.pct != null) {
        cur.sum += Number(d.pct);
        cur.n += 1;
      }
      cur.target_low = d.target_low;
      cur.target_high = d.target_high;
      sectionAgg.set(d.dynamic, cur);
    }
  }
  const sections: SectionVM[] = Array.from(sectionAgg.values()).map((s) => ({
    name: s.label,
    pct: s.n > 0 ? Math.round(s.sum / s.n) : null,
    targetLow: s.target_low,
    targetHigh: s.target_high,
  }));

  // ---- Overview: upcoming workshops (scheduled, soonest first) ----
  const { data: wkRows } = await supabase
    .from("workshop")
    .select("id, title, scheduled_at, status, team_id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true })
    .limit(5);
  // Participant count per workshop = team size of the workshop's team.
  const wkTeamIds = Array.from(new Set((wkRows ?? []).map((w) => w.team_id)));
  const { data: tmCounts } = wkTeamIds.length
    ? await supabase.from("team_member").select("team_id").in("team_id", wkTeamIds)
    : { data: [] as { team_id: string }[] };
  const sizeByTeam = new Map<string, number>();
  for (const m of tmCounts ?? []) sizeByTeam.set(m.team_id, (sizeByTeam.get(m.team_id) ?? 0) + 1);
  const workshops: WorkshopVM[] = (wkRows ?? []).map((w) => ({
    id: w.id,
    title: w.title,
    when: w.scheduled_at,
    participants: sizeByTeam.get(w.team_id) ?? 0,
    status: w.status,
  }));

  // ---- By team: one card per team with its 5 dynamics ----
  const entityById = new Map(entities.map((e) => [e.team_id, e]));
  const teams: TeamVM[] = teamList.map((t) => {
    const ent = entityById.get(t.id);
    const dyn = dynByTeam.get(t.id) ?? [];
    return {
      id: t.id,
      name: t.name,
      lead: ent?.lead ?? null,
      score: ent?.dynamics?.score ?? null,
      inBand: ent?.dynamics?.in_band ?? 0,
      total: ent?.dynamics?.total ?? dyn.length,
      dynamics: dyn.map((d) => ({
        label: d.label ?? DYNAMIC_LABEL[d.dynamic] ?? d.dynamic,
        pct: d.pct == null ? null : Number(d.pct),
        targetLow: d.target_low,
      })),
    };
  });

  void isAdmin(ctx.role);

  // ---- Overview "All assessments" table: surveys + pulses across the
  // workspace. Surveys are enriched with assessment_suite_overview (same
  // untyped-cast + guard pattern as the suite page) for score/responses/flag.
  // Pulses get their team-dynamics average as a score and pulse_participation
  // counts where cheap. No per-row trend queries (deferred — see note). ----
  const { data: surveyListRows } = await supabase
    .from("survey")
    .select("id, name, kind, status, team_id, created_at, closed_at")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false });

  type SuiteMetric = {
    survey_id: string;
    respondents: number;
    invited: number;
    masked: boolean;
    overall_pct: number | null;
    below_count: number | null;
  };
  const metricBySurvey = new Map<string, SuiteMetric>();
  try {
    const callMetrics = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: SuiteMetric[] | null; error: unknown }>;
    const { data: mRows, error: mErr } = await callMetrics("assessment_suite_overview", { p_workspace: ctx.workspace.id });
    if (!mErr) for (const m of mRows ?? []) metricBySurvey.set(m.survey_id, m);
  } catch {
    /* RPC absent → scores stay hidden, counts fall back below */
  }

  // Instrument display names for the Type label (resolved once per distinct kind).
  const surveyKinds = Array.from(new Set((surveyListRows ?? []).map((s) => s.kind)));
  const instByKind = new Map<string, { name: string } | null>();
  await Promise.all(
    surveyKinds.map(async (k) => {
      instByKind.set(k, await resolveInstrument(k));
    }),
  );
  const statusToVariant: Record<string, { variant: string; label: string }> = {
    open: { variant: "open", label: "Active" },
    draft: { variant: "draft", label: "Draft" },
    closed: { variant: "internal", label: "Review" },
  };

  const surveyAssessmentRows: AssessmentRow[] = (surveyListRows ?? []).map((s) => {
    const m = metricBySurvey.get(s.id);
    const st = statusToVariant[s.status] ?? { variant: "draft", label: s.status };
    return {
      id: s.id,
      kind: "survey",
      name: s.name ?? instByKind.get(s.kind)?.name ?? s.kind,
      type: instByKind.get(s.kind)?.name ?? s.kind,
      statusVariant: st.variant,
      statusLabel: st.label,
      respondents: m?.respondents ?? 0,
      invited: m?.invited ?? null,
      score: m && !m.masked ? m.overall_pct : null,
      flagged: (m?.below_count ?? 0) > 0,
      date: s.closed_at ?? s.created_at,
    };
  });

  // Pulses: score from the team's team_dynamics average; participation from
  // pulse_participation when a small set of pulses (cheap), else "—".
  const { data: pulseListRows } = await supabase
    .from("pulse")
    .select("id, name, status, team_id, closed_at")
    .eq("workspace_id", ctx.workspace.id)
    .order("closed_at", { ascending: false });
  const pulseRowsCapped = (pulseListRows ?? []).slice(0, 12);
  const pulseMetrics = await Promise.all(
    pulseRowsCapped.map(async (p) => {
      if (!p.team_id) return { dyn: null as { pct: number | null }[] | null, part: null as { completed: boolean }[] | null };
      const [dynRes, partRes] = await Promise.all([
        supabase.rpc("team_dynamics", { p_team: p.team_id, p_pulse: p.id }),
        supabase.rpc("pulse_participation", { p_pulse: p.id }).then((r) => r, () => ({ data: null })),
      ]);
      return {
        dyn: (dynRes.data ?? null) as { pct: number | null }[] | null,
        part: (partRes.data ?? null) as { completed: boolean }[] | null,
      };
    }),
  );
  const pulseAssessmentRows: AssessmentRow[] = pulseRowsCapped.map((p, i) => {
    const { dyn, part } = pulseMetrics[i];
    const pcts = (dyn ?? []).map((d) => d.pct).filter((v): v is number => v != null);
    const score = pcts.length ? Math.round(pcts.reduce((a, b) => a + Number(b), 0) / pcts.length) : null;
    const st = statusToVariant[p.status] ?? { variant: "draft", label: p.status };
    const responded = part ? part.filter((r) => r.completed).length : null;
    return {
      id: p.id,
      kind: "pulse",
      name: p.name ?? "Team pulse",
      type: "Pulse",
      statusVariant: st.variant,
      statusLabel: st.label,
      respondents: responded ?? 0,
      invited: part ? part.length : null,
      score,
      flagged: false,
      date: p.closed_at,
    };
  });

  const assessmentRows: AssessmentRow[] = [...surveyAssessmentRows, ...pulseAssessmentRows].sort(
    (a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0),
  );

  // Default By-assessment selection: most recent flagged survey, else the most
  // recent survey. Pulses aren't drillable (no per-section instrument), so the
  // default is always a survey id when one exists.
  const defaultAssessmentId =
    surveyAssessmentRows.find((r) => r.flagged)?.id ?? surveyAssessmentRows[0]?.id ?? null;
  let defaultDetail: AssessmentDetailVM | null = null;
  if (defaultAssessmentId) {
    const { detail } = await assessmentDetail(defaultAssessmentId);
    defaultDetail = detail ?? null;
  }

  // ---- By workshop: workshops with at least one real (non-dry-run) session,
  // newest session first. Per workshop: latest session participants, action
  // items closed/total, and the mean session_pulse_delta. ----
  const { data: realSessions } = await supabase
    .from("session")
    .select("id, workshop_id, started_at, is_dry_run")
    .eq("is_dry_run", false)
    .order("started_at", { ascending: false });
  // Latest real session per workshop.
  const latestSessionByWorkshop = new Map<string, { id: string; startedAt: string | null }>();
  for (const s of realSessions ?? []) {
    if (s.workshop_id && !latestSessionByWorkshop.has(s.workshop_id)) {
      latestSessionByWorkshop.set(s.workshop_id, { id: s.id, startedAt: s.started_at });
    }
  }
  const workshopIdsWithSession = Array.from(latestSessionByWorkshop.keys());
  const { data: wkOutcomeRows } = workshopIdsWithSession.length
    ? await supabase
        .from("workshop")
        .select("id, title, team_id, scheduled_at")
        .eq("workspace_id", ctx.workspace.id)
        .in("id", workshopIdsWithSession)
    : { data: [] as { id: string; title: string; team_id: string; scheduled_at: string | null }[] };

  // Team sizes for the attendance KPI denominator (outcome workshops' teams).
  const outcomeTeamIds = Array.from(new Set((wkOutcomeRows ?? []).map((w) => w.team_id)));
  const { data: outcomeTmRows } = outcomeTeamIds.length
    ? await supabase.from("team_member").select("team_id").in("team_id", outcomeTeamIds)
    : { data: [] as { team_id: string }[] };
  const outcomeSizeByTeam = new Map<string, number>();
  for (const m of outcomeTmRows ?? []) outcomeSizeByTeam.set(m.team_id, (outcomeSizeByTeam.get(m.team_id) ?? 0) + 1);

  const workshopOutcomes: WorkshopOutcomeRow[] = await Promise.all(
    (wkOutcomeRows ?? []).map(async (w) => {
      const sess = latestSessionByWorkshop.get(w.id)!;
      const [{ data: parts }, { count: doneCount }, { count: totalCount }, deltaRes] = await Promise.all([
        supabase.from("participant").select("user_id").eq("session_id", sess.id),
        supabase.from("action_item").select("id", { count: "exact", head: true }).eq("session_id", sess.id).eq("status", "done"),
        supabase.from("action_item").select("id", { count: "exact", head: true }).eq("session_id", sess.id),
        supabase.rpc("session_pulse_delta", { p_session: sess.id }).then((r) => r, () => ({ data: null })),
      ]);
      const deltas = ((deltaRes.data ?? []) as { delta: number | null }[])
        .map((d) => d.delta)
        .filter((v): v is number => v != null);
      const meanDelta = deltas.length ? Math.round((deltas.reduce((a, b) => a + Number(b), 0) / deltas.length) * 10) / 10 : null;
      const participants = (parts ?? []).length;
      const teamSize = outcomeSizeByTeam.get(w.team_id) ?? 0;
      let outcome: "improved" | "flat" | "pending";
      if (meanDelta == null) outcome = "pending";
      else if (meanDelta > 0.05) outcome = "improved";
      else if (meanDelta < -0.05) outcome = "flat";
      else outcome = "flat";
      return {
        id: w.id,
        title: w.title,
        when: sess.startedAt ?? w.scheduled_at,
        participants,
        teamSize,
        actionsDone: doneCount ?? 0,
        actionsTotal: totalCount ?? 0,
        delta: meanDelta,
        outcome,
      };
    }),
  );
  workshopOutcomes.sort((a, b) => (b.when ? new Date(b.when).getTime() : 0) - (a.when ? new Date(a.when).getTime() : 0));

  const allDeltas = workshopOutcomes.map((w) => w.delta).filter((v): v is number => v != null);
  const totalDone = workshopOutcomes.reduce((a, w) => a + w.actionsDone, 0);
  const totalActions = workshopOutcomes.reduce((a, w) => a + w.actionsTotal, 0);
  const attendanceVals = workshopOutcomes
    .filter((w) => w.teamSize > 0)
    .map((w) => Math.min(100, (w.participants / w.teamSize) * 100));
  const workshopKpis: WorkshopKpis = {
    workshopsRun: workshopOutcomes.length,
    avgLift: allDeltas.length ? Math.round((allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length) * 10) / 10 : null,
    actionsDone: totalDone,
    actionsTotal: totalActions,
    attendance: attendanceVals.length ? Math.round(attendanceVals.reduce((a, b) => a + b, 0) / attendanceVals.length) : null,
  };

  // ---- Reports subsystem data (schedules + recent runs) ----
  const reports = await listReports();

  const props: DashboardProps = {
    kpis: {
      activeAssessments,
      avgScore: avgScore == null ? null : Math.round(avgScore * 10) / 10,
      responses,
      belowThreshold: sectionsBelow,
      workshopsScheduled: workshopsScheduled ?? 0,
      participation,
    },
    trend,
    participationByTeam,
    sections,
    workshops,
    teams,
    assessmentRows,
    defaultAssessmentId,
    defaultDetail,
    workshopOutcomes,
    workshopKpis,
    reports,
  };

  return <InsightDashboard {...props} dashboardSlot={<DashboardOverview />} />;
}

// Short axis label for the participation bar chart (first word, capped).
function shortLabel(name: string) {
  const w = name.trim().split(/\s+/)[0] ?? name;
  return w.length > 6 ? w.slice(0, 5) + "…" : w;
}
