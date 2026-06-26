"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { resolveInstrument } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys, climateStrength, instrumentFromRow } from "@/lib/survey";

// Lazy per-assessment detail for the Insights "By assessment" tab. The Overview
// lists every assessment cheaply; the rich per-section scoring + trend is only
// resolved when an assessment is selected, so the page never runs the
// per-survey RPC loop across the whole workspace up front.
//
// Banding mirrors the rest of the app: a scale-relative target floor so it
// works for 1–5 and 1–7 instruments alike. All numbers are masked server-side
// under the min-responder floor and render as "—" when hidden.

const TARGET_LOW_PCT = 45;
function bandOf(pct: number): 0 | 1 | 2 {
  return pct < TARGET_LOW_PCT ? 0 : pct < 62 ? 1 : 2;
}

export type SectionScoreVM = {
  key: string;
  label: string;
  pct: number; // 0–100 position on the instrument scale
  mean: number; // raw mean on the instrument scale
  targetLow: number; // band floor as a % of the scale
  band: 0 | 1 | 2;
};

export type AssessmentTrendPoint = { l: string; v: number };

export type AssessmentDetailVM = {
  surveyId: string;
  name: string;
  instrumentName: string;
  overallPct: number | null; // 0–100 composite, null when masked
  respondents: number;
  invited: number | null;
  participationPct: number | null;
  belowCount: number;
  sectionCount: number;
  lastReviewed: string | null; // closed_at / created_at ISO
  masked: boolean;
  sections: SectionScoreVM[];
  trend: AssessmentTrendPoint[];
  // Climate-strength → the "Human note" card copy.
  note: { label: string; tone: "aligned" | "mixed" | "split"; copy: string } | null;
};

type SurveyResults = {
  respondents: number;
  masked: boolean;
  items: { item_key: string; mean: number; n: number }[];
  strength_sd: number | null;
  composite: number | null;
};

// Short cycle label for the score-over-time axis (e.g. "Mar", "Q2").
function cycleLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Human-note copy from the climate-strength read — how much the team agrees on
// how it scores. Grounded in the Fyhn/Bang climate-strength signal.
function strengthCopy(tone: "aligned" | "mixed" | "split"): string {
  if (tone === "aligned")
    return "Responses are tightly aligned — people experience this team similarly, so the section scores reflect a shared reality rather than a split of opinion.";
  if (tone === "mixed")
    return "Responses are mixed — there is some spread in how people experience this team, so read the section scores as a centre of gravity, not a consensus.";
  return "Responses are split — people experience this team very differently. The averages hide real disagreement; the spread itself is worth a conversation.";
}

export async function assessmentDetail(surveyId: string): Promise<{ error?: string; detail?: AssessmentDetailVM }> {
  const supabase = createClient();

  const { data: survey } = await supabase
    .from("survey")
    .select("id, name, kind, status, team_id, created_at, closed_at, definition")
    .eq("id", surveyId)
    .maybeSingle();
  if (!survey) return { error: "Assessment not found." };

  // Prefer the survey's frozen definition snapshot (a custom/edited instrument
  // shows its own questions), falling back to the live catalog by kind.
  const inst =
    instrumentFromRow({ key: survey.kind as string, name: (survey.name ?? survey.kind) as string, definition: survey.definition }) ??
    (await resolveInstrument(survey.kind as string));
  if (!inst) return { error: "Instrument definition is unavailable." };
  const { min, max } = inst.scale;
  const strengthItems = strengthItemKeys(inst);

  // Response-rate denominator: distinct members across the survey's targeted
  // teams + external invites (matches assessment_suite_overview / the suite
  // detail loader).
  let invited: number | null = null;
  {
    const { data: stTeams } = await supabase.from("survey_team").select("team_id").eq("survey_id", surveyId);
    const teamIds = Array.from(
      new Set([survey.team_id as string | null, ...((stTeams ?? []).map((r) => r.team_id as string))].filter((x): x is string => !!x)),
    );
    let memberCount = 0;
    if (teamIds.length) {
      const { data: tmRows } = await supabase.from("team_member").select("user_id").in("team_id", teamIds);
      memberCount = new Set((tmRows ?? []).map((r) => r.user_id as string)).size;
    }
    const { count: inviteCount } = await supabase.from("survey_invite").select("id", { count: "exact", head: true }).eq("survey_id", surveyId);
    invited = memberCount + (inviteCount ?? 0) || null;
  }

  const { data: res } = await supabase.rpc("survey_results", { p_survey: surveyId, p_strength_items: strengthItems });
  const r = res as unknown as SurveyResults | null;

  let sections: SectionScoreVM[] = [];
  let overallPct: number | null = null;
  let belowCount = 0;
  let note: AssessmentDetailVM["note"] = null;
  if (r && !r.masked) {
    sections = dimensionMeans(inst, r.items ?? [])
      .filter((d): d is { key: string; label: string; blurb: string; mean: number } => d.mean != null)
      .map((d) => {
        const pct = Math.max(0, Math.min(100, ((d.mean - min) / (max - min)) * 100));
        return { key: d.key, label: d.label, mean: d.mean, pct, targetLow: TARGET_LOW_PCT, band: bandOf(pct) };
      });
    belowCount = sections.filter((s) => s.band === 0).length;
    overallPct = r.composite != null ? Math.round(Number(r.composite) * 10) / 10 : null;
    const cs = climateStrength(r.strength_sd);
    if (cs) note = { label: cs.label, tone: cs.tone, copy: strengthCopy(cs.tone) };
  }

  // Score-over-time: prior surveys of the same kind for the same team, their
  // composite over time. Capped to the 6 most recent (incl. this one) so the
  // line stays cheap — at most ~6 survey_results calls.
  const trend: AssessmentTrendPoint[] = [];
  if (survey.team_id) {
    const { data: priors } = await supabase
      .from("survey")
      .select("id, created_at, closed_at")
      .eq("team_id", survey.team_id)
      .eq("kind", survey.kind)
      .order("created_at", { ascending: false })
      .limit(6);
    const ordered = (priors ?? []).slice().reverse(); // oldest -> newest
    const results = await Promise.all(
      ordered.map((p) =>
        p.id === surveyId
          ? Promise.resolve({ data: res })
          : supabase.rpc("survey_results", { p_survey: p.id, p_strength_items: strengthItems }),
      ),
    );
    ordered.forEach((p, i) => {
      const pr = results[i].data as unknown as SurveyResults | null;
      if (pr && !pr.masked && pr.composite != null) {
        trend.push({ l: cycleLabel(p.closed_at ?? p.created_at), v: Math.round(Number(pr.composite) * 10) / 10 });
      }
    });
  }

  const participationPct =
    r && !r.masked && invited && invited > 0 ? Math.round((r.respondents / invited) * 100) : null;

  return {
    detail: {
      surveyId,
      name: (survey.name as string) ?? inst.name,
      instrumentName: inst.name,
      overallPct,
      respondents: r?.respondents ?? 0,
      invited,
      participationPct,
      belowCount,
      sectionCount: inst.dimensions.length,
      lastReviewed: (survey.closed_at as string | null) ?? (survey.created_at as string | null),
      masked: r ? r.masked : true,
      sections,
      trend,
      note,
    },
  };
}

/* ===================== Reports subsystem (Phase D) =====================
 *
 * Durable scheduled / one-off reports backed by report_schedule + report_run.
 * Admin-gated (RLS enforces it too; we guard here for clean errors). Delivery is
 * the send-reports edge function (Resend), kicked daily by pg_cron and on demand
 * by request_report_dispatch. Sends stay inert until RESEND_API_KEY + a verified
 * sender are set as Supabase secrets — runs then log as failed with the reason.
 */

export type ReportFormat = "pdf" | "excel" | "csv";
export type ReportFrequency = "once" | "weekly" | "monthly";

export type ReportScheduleVM = {
  id: string;
  name: string;
  format: string;
  frequency: string;
  recipients: string[];
  include: Record<string, boolean>;
  message: string | null;
  status: string; // active | paused
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
};

export type ReportRunVM = {
  id: string;
  scheduleName: string;
  format: string;
  recipientCount: number;
  status: string; // queued | sent | failed
  error: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type ReportsData = { schedules: ReportScheduleVM[]; runs: ReportRunVM[]; canManage: boolean };

type ScheduleRow = {
  id: string; name: string; format: string; frequency: string; recipients: string[] | null;
  include: unknown; message: string | null; status: string;
  next_run_at: string | null; last_run_at: string | null; created_at: string;
};
type RunRow = {
  id: string; schedule_id: string | null; format: string; recipients: string[] | null;
  status: string; error: string | null; sent_at: string | null; created_at: string;
};

function toIncludeMap(v: unknown): Record<string, boolean> {
  if (v && typeof v === "object") {
    const out: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = !!val;
    return out;
  }
  return {};
}

// Next run for a recurring cadence (matches private.report_next_run). One-off
// reports carry no next_run_at — they're enqueued immediately on create.
function computeNextRun(freq: ReportFrequency): string | null {
  const now = new Date();
  if (freq === "weekly") return new Date(now.getTime() + 7 * 86_400_000).toISOString();
  if (freq === "monthly") { const d = new Date(now); d.setMonth(d.getMonth() + 1); return d.toISOString(); }
  return null;
}

export async function listReports(): Promise<ReportsData> {
  const ctx = await requireSession();
  const supabase = createClient();
  const [{ data: schedRows }, { data: runRows }] = await Promise.all([
    supabase
      .from("report_schedule")
      .select("id, name, format, frequency, recipients, include, message, status, next_run_at, last_run_at, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("report_run")
      .select("id, schedule_id, format, recipients, status, error, sent_at, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const schedules: ReportScheduleVM[] = ((schedRows ?? []) as ScheduleRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    format: s.format,
    frequency: s.frequency,
    recipients: s.recipients ?? [],
    include: toIncludeMap(s.include),
    message: s.message,
    status: s.status,
    nextRunAt: s.next_run_at,
    lastRunAt: s.last_run_at,
    createdAt: s.created_at,
  }));
  const nameById = new Map(schedules.map((s) => [s.id, s.name]));
  const runs: ReportRunVM[] = ((runRows ?? []) as RunRow[]).map((r) => ({
    id: r.id,
    scheduleName: (r.schedule_id && nameById.get(r.schedule_id)) || "One-off report",
    format: r.format,
    recipientCount: (r.recipients ?? []).length,
    status: r.status,
    error: r.error,
    sentAt: r.sent_at,
    createdAt: r.created_at,
  }));

  return { schedules, runs, canManage: isAdmin(ctx.role) };
}

export type CreateReportInput = {
  name: string;
  format: ReportFormat;
  frequency: ReportFrequency;
  recipients: string[];
  include: Record<string, boolean>;
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createReport(input: CreateReportInput): Promise<{ error?: string; ok?: boolean }> {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) return { error: "Only admins can schedule reports." };

  const name = input.name.trim();
  if (!name) return { error: "Give the report a name." };
  const recipients = Array.from(new Set(input.recipients.map((r) => r.trim()).filter(Boolean)));
  if (recipients.length === 0) return { error: "Add at least one recipient." };
  const bad = recipients.find((r) => !EMAIL_RE.test(r));
  if (bad) return { error: `“${bad}” isn’t a valid email.` };
  if (!["pdf", "excel", "csv"].includes(input.format)) return { error: "Unknown format." };
  if (!["once", "weekly", "monthly"].includes(input.frequency)) return { error: "Unknown frequency." };

  const supabase = createClient();
  const { data: ins, error } = await supabase
    .from("report_schedule")
    .insert({
      workspace_id: ctx.workspace.id,
      name,
      format: input.format,
      frequency: input.frequency,
      recipients,
      include: input.include,
      message: input.message.trim() || null,
      status: "active",
      next_run_at: computeNextRun(input.frequency),
      created_by: ctx.userId,
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };

  // A one-off report fires straight away: queue a run + kick the dispatcher.
  if (input.frequency === "once" && ins?.id) {
    await enqueueAndDispatch(ctx.workspace.id, ins.id, input.format, recipients);
  }

  revalidatePath("/insight");
  return { ok: true };
}

export async function setReportStatus(id: string, status: "active" | "paused"): Promise<{ error?: string; ok?: boolean }> {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) return { error: "Only admins can change reports." };
  const supabase = createClient();
  const { error } = await supabase
    .from("report_schedule")
    .update({ status })
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id);
  if (error) return { error: error.message };
  revalidatePath("/insight");
  return { ok: true };
}

export async function deleteReport(id: string): Promise<{ error?: string; ok?: boolean }> {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) return { error: "Only admins can delete reports." };
  const supabase = createClient();
  const { error } = await supabase
    .from("report_schedule")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id);
  if (error) return { error: error.message };
  revalidatePath("/insight");
  return { ok: true };
}

// Send an existing schedule now: queue a run + dispatch. Idempotent enough —
// each press logs a fresh run.
export async function sendReportNow(id: string): Promise<{ error?: string; ok?: boolean }> {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) return { error: "Only admins can send reports." };
  const supabase = createClient();
  const { data: sched } = await supabase
    .from("report_schedule")
    .select("id, format, recipients")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!sched) return { error: "Report not found." };
  const r = sched as { id: string; format: string; recipients: string[] | null };
  await enqueueAndDispatch(ctx.workspace.id, r.id, r.format, r.recipients ?? []);
  revalidatePath("/insight");
  return { ok: true };
}

// Insert a queued run and kick the dispatcher (an async POST to the edge
// function). Sending is inert until RESEND_API_KEY is configured — the run then
// logs as failed with the reason, which the Reports tab surfaces.
async function enqueueAndDispatch(workspaceId: string, scheduleId: string | null, format: string, recipients: string[]) {
  const supabase = createClient();
  await supabase.from("report_run").insert({
    schedule_id: scheduleId,
    workspace_id: workspaceId,
    format,
    recipients,
    status: "queued",
  });
  // Best-effort kick; the daily cron also drains the queue.
  const dispatch = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>;
  try {
    await dispatch("request_report_dispatch", { p_workspace: workspaceId });
  } catch {
    /* dispatcher unreachable → the cron run still drains the queue */
  }
}

// Anonymized CSV import of survey responses. `rows` are pre-parsed client-side
// into { scores: {item_key: number} } objects; the admin-gated RPC writes them
// as respondent_id-NULL responses (min-3 masking still applies on read).
export async function importResponses(
  surveyId: string,
  rows: { scores: Record<string, number>; hash?: string }[],
): Promise<{ error?: string; imported?: number }> {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) return { error: "Only admins can import responses." };
  if (!surveyId) return { error: "Pick an assessment to import into." };
  const clean = rows.filter((r) => r.scores && Object.keys(r.scores).length > 0);
  if (clean.length === 0) return { error: "No valid rows found in the file." };

  const supabase = createClient();
  const importRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: number | null; error: { message: string } | null }>;
  const { data, error } = await importRpc("import_survey_responses", { p_survey: surveyId, p_rows: clean });
  if (error) return { error: error.message };
  revalidatePath("/insight");
  return { imported: data ?? 0 };
}
