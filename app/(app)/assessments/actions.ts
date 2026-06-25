"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

// Best-effort audit logging. Records an assessment/pulse lifecycle event via
// the guarded public.log_event writer; never throws into the caller (a logging
// failure must not break the action it accompanies).
async function logEvent(
  supabase: ReturnType<typeof createClient>,
  action: string,
  entityType: "survey" | "pulse",
  entityId: string,
  meta: Json = {},
): Promise<void> {
  try {
    await supabase.rpc("log_event", { p_action: action, p_entity_type: entityType, p_entity_id: entityId, p_meta: meta });
  } catch {
    /* logging is non-fatal */
  }
}

// Send a multi-item assessment to the team, optionally with a deadline.
// The instrument name is resolved from the template library by key.
export async function sendSurvey(
  teamId: string,
  kind: string,
  dueAt: string | null,
  anonymity: string = "anonymous",
): Promise<{ error?: string; id?: string }> {
  const supabase = createClient();
  const { data: tpl } = await supabase
    .from("assessment_template")
    .select("name")
    .eq("key", kind)
    .order("workspace_id", { ascending: true, nullsFirst: false });
  const name = (tpl ?? [])[0]?.name as string | undefined;
  if (!name) return { error: "Unknown instrument." };
  const due = dueAt ? new Date(dueAt + "T23:59:00") : null;
  const { data, error } = await supabase.rpc("create_survey", {
    p_team: teamId,
    p_kind: kind,
    p_name: name,
    p_anonymity: anonymity === "attributed" ? "attributed" : "anonymous",
    ...(due && !isNaN(due.getTime()) ? { p_due: due.toISOString() } : {}),
  });
  if (error) return { error: error.message };
  const id = (data as { id?: string } | null)?.id;
  if (id) await logEvent(supabase, "assessment.opened", "survey", id, { kind });
  revalidatePath("/assessments");
  return { id };
}

// Send one assessment to several teams at once — the wizard's multi-team
// recipients step. Creates one survey instance per selected team (the suite
// already lists surveys per team). Returns the created ids; the first id is
// used to jump to the live-status screen. Partial failures are reported but
// don't roll back the surveys already opened.
export async function sendSurveyMulti(
  teamIds: string[],
  kind: string,
  dueAt: string | null,
  anonymity: string = "anonymous",
): Promise<{ error?: string; ids?: string[] }> {
  const ids: string[] = [];
  const errors: string[] = [];
  for (const teamId of teamIds) {
    const res = await sendSurvey(teamId, kind, dueAt, anonymity);
    if (res.error) errors.push(res.error);
    else if (res.id) ids.push(res.id);
  }
  if (!ids.length) return { error: errors[0] ?? "Could not open the assessment for any team." };
  return { ids };
}

// Send-wizard action: one assessment that targets several teams plus
// individual/external email invites, launched now / scheduled / saved as a
// draft, over the chosen channels. Backed by the create_assessment RPC (which
// enforces lead/admin on every targeted team). The instrument name falls back
// to the template's name when the user leaves the title blank.
export async function sendAssessment(input: {
  title: string;
  kind: string | null;
  teamIds: string[]; // first entry is the primary team
  emails: string[];
  anonymity: "anonymous" | "attributed";
  minParticipants: number;
  channels: string[]; // subset of email | url (sms/slack/teams are UI-only for now)
  launch: "now" | "scheduled" | "draft";
  startAt: string | null; // yyyy-mm-dd
  dueAt: string | null; // yyyy-mm-dd
  reminders: boolean;
}): Promise<{ error?: string; id?: string }> {
  const supabase = createClient();
  const [primary, ...extra] = input.teamIds;
  if (!primary) return { error: "Select at least one team." };

  let name = input.title.trim();
  if (!name && input.kind) {
    const { data: tpl } = await supabase
      .from("assessment_template")
      .select("name")
      .eq("key", input.kind)
      .order("workspace_id", { ascending: true, nullsFirst: false });
    name = ((tpl ?? [])[0]?.name as string | undefined) ?? "Untitled assessment";
  }
  if (!name) name = "Untitled assessment";

  const toIso = (d: string | null, end: boolean) =>
    d ? (() => { const dt = new Date(`${d}T${end ? "23:59" : "09:00"}:00`); return isNaN(dt.getTime()) ? null : dt.toISOString(); })() : null;

  const channels = input.channels.length ? input.channels : ["email"];
  const { data, error } = await supabase.rpc("create_assessment", {
    p_team: primary,
    p_name: name,
    p_extra_teams: extra,
    p_emails: input.emails,
    p_kind: input.kind ?? undefined,
    p_anonymity: input.anonymity === "attributed" ? "attributed" : "anonymous",
    p_min_participants: input.minParticipants,
    p_channels: channels,
    p_launch: input.launch,
    p_start: toIso(input.startAt, false) ?? undefined,
    p_due: toIso(input.dueAt, true) ?? undefined,
    p_reminders: input.reminders,
  });
  if (error) return { error: error.message };
  const id = (data as { id?: string } | null)?.id;
  if (id) await logEvent(supabase, "assessment.opened", "survey", id, { kind: input.kind, launch: input.launch, teams: input.teamIds.length });
  revalidatePath("/assessments");
  return { id };
}

export async function remindSurvey(surveyId: string): Promise<{ error?: string; pending?: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("remind_survey", { p_survey: surveyId });
  if (error) return { error: error.message };
  const pending = (data as unknown as number) ?? 0;
  await logEvent(supabase, "assessment.reminded", "survey", surveyId, { pending });
  return { pending };
}

export async function closeSurvey(surveyId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("close_survey", { p_survey: surveyId });
  if (error) return { error: error.message };
  await logEvent(supabase, "assessment.closed", "survey", surveyId);
  revalidatePath("/assessments");
  return {};
}

// Pause / resume a collecting assessment (blocks submission without closing).
export async function setSurveyPaused(surveyId: string, paused: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_survey_paused", { p_survey: surveyId, p_paused: paused });
  if (error) return { error: error.message };
  await logEvent(supabase, paused ? "assessment.paused" : "assessment.resumed", "survey", surveyId);
  revalidatePath("/assessments");
  return {};
}

// Mint or revoke a public link for an anonymous survey. Returns the token
// (null when turned off). Only anonymous surveys can be shared.
export async function setSurveyShare(surveyId: string, on: boolean): Promise<{ error?: string; token?: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("survey_share_set", { p_survey: surveyId, p_on: on });
  if (error) return { error: error.message };
  revalidatePath("/insight/leadership-teams");
  return { token: (data as string | null) ?? null };
}

// Designate (or clear) whose view to contrast against the team — the perception gap.
export async function setSurveySubject(surveyId: string, subjectId: string | null): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_survey_subject", { p_survey: surveyId, p_subject: subjectId });
  if (error) return { error: error.message };
  revalidatePath("/assessments");
  return {};
}

export async function runPulse(
  teamId: string,
  name: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_pulse", {
    p_team: teamId,
    p_name: name,
  });
  if (error) return { error: error.message };
  const pid = (data as { id?: string } | null)?.id;
  if (pid) await logEvent(supabase, "pulse.opened", "pulse", pid, { team: teamId });
  revalidatePath("/assessments");
  return {};
}

export async function respondPulse(
  pulseId: string,
  scores: Record<string, number>,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("submit_pulse_response", {
    p_pulse: pulseId,
    p_scores: scores,
  });
  if (error) return { error: error.message };
  revalidatePath("/assessments");
  return {};
}

export async function closePulse(
  pulseId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("close_pulse", { p_pulse: pulseId });
  if (error) return { error: error.message };
  await logEvent(supabase, "pulse.closed", "pulse", pulseId);
  revalidatePath("/assessments");
  return {};
}

export async function remindPulse(
  pulseId: string,
): Promise<{ error?: string; pending?: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("remind_pulse", {
    p_pulse: pulseId,
  });
  if (error) return { error: error.message };
  return { pending: (data as unknown as number) ?? 0 };
}
