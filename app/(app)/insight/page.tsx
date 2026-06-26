import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { DYNAMIC_LABEL } from "@/lib/grounding";
import {
  InsightDashboard,
  type DashboardProps,
  type SectionVM,
  type TeamVM,
  type TrendPoint,
  type BarPoint,
  type WorkshopVM,
} from "./InsightDashboard";

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
  if (ctx.role === "facilitator") redirect("/dashboard");
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

  // isAdmin retained for the upcoming per-role scoping pass (assessment list).
  void isAdmin(ctx.role);

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
  };

  return <InsightDashboard {...props} />;
}

// Short axis label for the participation bar chart (first word, capped).
function shortLabel(name: string) {
  const w = name.trim().split(/\s+/)[0] ?? name;
  return w.length > 6 ? w.slice(0, 5) + "…" : w;
}
