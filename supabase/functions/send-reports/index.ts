// send-reports — delivers Insight reports by email (Resend).
//
// Two sources of work, both logged to public.report_run:
//   • Queued runs   — report_run rows with status='queued' (one-off "Send now"
//     or a 'once' schedule the app enqueued).
//   • Due schedules — active weekly/monthly report_schedule rows whose
//     next_run_at has passed; each gets a fresh report_run, then advances.
//
// Triggered by pg_cron via pg_net (see migration *_report_dispatch), and by the
// app's "Send now" through public.request_report_dispatch. Auth: a shared secret
// (x-cron-secret) verified in the DB, so the function runs verify_jwt=false while
// staying private to our scheduler.
//
// Email stays DORMANT until RESEND_API_KEY + a verified sender are set as
// function secrets — until then every run is logged as failed with a clear
// reason, so the Reports tab shows exactly why nothing was delivered.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("REPORT_FROM") ?? Deno.env.get("REMINDER_FROM") ?? "OwnTheAgenda <onboarding@resend.dev>";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

type ScheduleRow = {
  id: string;
  workspace_id: string;
  name: string;
  format: string;
  frequency: string;
  recipients: string[];
  include: Record<string, unknown> | null;
  message: string | null;
  status: string;
  next_run_at: string | null;
};
type RunRow = {
  id: string;
  schedule_id: string | null;
  workspace_id: string;
  format: string;
  recipients: string[];
  status: string;
};
type SuiteRow = {
  survey_id: string;
  name?: string | null;
  respondents: number | null;
  invited: number | null;
  masked: boolean | null;
  overall_pct: number | null;
  below_count: number | null;
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function b64(s: string) {
  return btoa(unescape(encodeURIComponent(s)));
}

// deno-lint-ignore no-explicit-any
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) as any;

// Build the report content (HTML body + CSV attachment) for a workspace.
async function buildReport(workspaceId: string, scheduleName: string, message: string | null) {
  const { data: ws } = await admin.from("workspace").select("name").eq("id", workspaceId).maybeSingle();
  const wsName = (ws?.name as string) ?? "Workspace";

  let suite: SuiteRow[] = [];
  try {
    const { data } = await admin.rpc("assessment_suite_overview", { p_workspace: workspaceId });
    suite = (data ?? []) as SuiteRow[];
  } catch {
    suite = [];
  }

  const scored = suite.filter((s) => !s.masked && s.overall_pct != null);
  const avg = scored.length ? Math.round((scored.reduce((a, s) => a + (s.overall_pct ?? 0), 0) / scored.length) * 10) / 10 : null;
  const below = suite.reduce((n, s) => n + (s.below_count ?? 0), 0);
  const generated = new Date().toISOString().slice(0, 10);

  const rowsHtml = suite.length
    ? suite
        .map((s) => {
          const score = s.masked || s.overall_pct == null ? "—" : Math.round(s.overall_pct);
          const resp = s.invited != null ? `${s.respondents ?? 0} / ${s.invited}` : `${s.respondents ?? 0}`;
          const flag = (s.below_count ?? 0) > 0 ? " ⚑" : "";
          return `<tr><td style="padding:7px 10px;border-bottom:1px solid #eee">${esc(s.name ?? s.survey_id.slice(0, 8))}${flag}</td><td style="padding:7px 10px;border-bottom:1px solid #eee">${resp}</td><td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">${score}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="3" style="padding:10px;color:#888">No assessments yet.</td></tr>`;

  const html = `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;color:#2a2a26;background:#f3f1e8;padding:24px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e4e1d5;border-radius:10px;overflow:hidden">
    <div style="background:#2f4035;color:#fff;padding:20px 24px">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.8">OwnTheAgenda · Insights</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${esc(scheduleName)}</div>
      <div style="font-size:13px;opacity:.85;margin-top:2px">${esc(wsName)} · ${generated}</div>
    </div>
    <div style="padding:22px 24px">
      ${message ? `<p style="font-size:14px;line-height:1.6;color:#4a4a44">${esc(message)}</p>` : ""}
      <div style="display:flex;gap:24px;margin:8px 0 18px">
        <div><div style="font-size:26px;font-weight:700">${avg == null ? "—" : avg}</div><div style="font-size:12px;color:#8a8a7e;text-transform:uppercase;letter-spacing:.05em">Avg score</div></div>
        <div><div style="font-size:26px;font-weight:700;color:#b8584a">${below}</div><div style="font-size:12px;color:#8a8a7e;text-transform:uppercase;letter-spacing:.05em">Below threshold</div></div>
        <div><div style="font-size:26px;font-weight:700">${suite.length}</div><div style="font-size:12px;color:#8a8a7e;text-transform:uppercase;letter-spacing:.05em">Assessments</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="text-align:left;color:#8a8a7e;font-size:11px;text-transform:uppercase;letter-spacing:.05em">
          <th style="padding:7px 10px">Assessment</th><th style="padding:7px 10px">Responses</th><th style="padding:7px 10px;text-align:right">Score</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${APP_URL ? `<p style="margin-top:20px"><a href="${APP_URL}/insight" style="background:#2f4035;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px">Open Insights</a></p>` : ""}
    </div>
    <div style="padding:14px 24px;background:#f7f5ee;color:#8a8a7e;font-size:11px">Generated automatically. Figures honour the min-respondent anonymity floor — masked values show as “—”.</div>
  </div></body></html>`;

  const csvLines = [
    "Assessment,Responses,Invited,Score,Below threshold",
    ...suite.map((s) => {
      const score = s.masked || s.overall_pct == null ? "" : Math.round(s.overall_pct);
      const name = (s.name ?? s.survey_id).replace(/"/g, '""');
      return `"${name}",${s.respondents ?? 0},${s.invited ?? ""},${score},${s.below_count ?? 0}`;
    }),
  ];
  const csv = csvLines.join("\r\n");

  return { html, csv, wsName, generated };
}

async function sendEmail(to: string[], subject: string, html: string, csv: string, csvName: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject,
      html,
      attachments: [{ filename: csvName, content: b64(csv) }],
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function processRun(run: RunRow, schedule: ScheduleRow | null) {
  const recipients = (schedule?.recipients?.length ? schedule.recipients : run.recipients) ?? [];
  const name = schedule?.name ?? "Insights report";
  const message = schedule?.message ?? null;

  if (!recipients.length) {
    await admin.from("report_run").update({ status: "failed", error: "No recipients" }).eq("id", run.id);
    return { id: run.id, status: "failed", reason: "no recipients" };
  }
  if (!RESEND_API_KEY) {
    await admin
      .from("report_run")
      .update({ status: "failed", error: "Email delivery not configured (set RESEND_API_KEY + a verified sender)" })
      .eq("id", run.id);
    return { id: run.id, status: "failed", reason: "no RESEND_API_KEY" };
  }
  try {
    const { html, csv, wsName, generated } = await buildReport(run.workspace_id, name, message);
    await sendEmail(recipients, `${name} — ${wsName} (${generated})`, html, csv, `insights-${generated}.csv`);
    await admin.from("report_run").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", run.id);
    return { id: run.id, status: "sent", recipients: recipients.length };
  } catch (e) {
    await admin.from("report_run").update({ status: "failed", error: String(e).slice(0, 500) }).eq("id", run.id);
    return { id: run.id, status: "failed", reason: String(e).slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok, error: vErr } = await admin.rpc("verify_cron_secret", { p_name: "report_cron", p_secret: secret });
  if (vErr) return json({ error: "auth check failed" }, 500);
  if (!ok) return json({ error: "unauthorized" }, 401);

  const nowIso = new Date().toISOString();
  const results: unknown[] = [];

  // 1) Due recurring schedules → enqueue a run + advance next_run_at.
  const { data: dueSchedules } = await admin
    .from("report_schedule")
    .select("id, workspace_id, name, format, frequency, recipients, include, message, status, next_run_at")
    .eq("status", "active")
    .in("frequency", ["weekly", "monthly"])
    .lte("next_run_at", nowIso);
  for (const sch of (dueSchedules ?? []) as ScheduleRow[]) {
    const { data: runIns } = await admin
      .from("report_run")
      .insert({ schedule_id: sch.id, workspace_id: sch.workspace_id, format: sch.format, recipients: sch.recipients, status: "queued" })
      .select("id, schedule_id, workspace_id, format, recipients, status")
      .maybeSingle();
    if (runIns) results.push(await processRun(runIns as RunRow, sch));
    const { data: nextRun } = await admin.rpc("report_next_run", { p_freq: sch.frequency, p_from: nowIso });
    await admin.from("report_schedule").update({ last_run_at: nowIso, next_run_at: nextRun }).eq("id", sch.id);
  }

  // 2) Any queued runs (one-off "Send now" / 'once' schedules).
  const { data: queued } = await admin
    .from("report_run")
    .select("id, schedule_id, workspace_id, format, recipients, status")
    .eq("status", "queued")
    .limit(200);
  for (const run of (queued ?? []) as RunRow[]) {
    let sch: ScheduleRow | null = null;
    if (run.schedule_id) {
      const { data } = await admin
        .from("report_schedule")
        .select("id, workspace_id, name, format, frequency, recipients, include, message, status, next_run_at")
        .eq("id", run.schedule_id)
        .maybeSingle();
      sch = (data as ScheduleRow) ?? null;
      // Mark a one-off schedule done after its run is processed.
      if (sch && sch.frequency === "once") {
        await admin.from("report_schedule").update({ last_run_at: nowIso, status: "paused" }).eq("id", sch.id);
      }
    }
    results.push(await processRun(run, sch));
  }

  return json({ ok: true, processed: results.length, results });
});
