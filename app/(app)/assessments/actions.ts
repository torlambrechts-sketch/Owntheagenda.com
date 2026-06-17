"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { INSTRUMENTS } from "@/lib/survey";

// Send a multi-item assessment to the team, optionally with a deadline.
export async function sendSurvey(
  teamId: string,
  kind: string,
  dueAt: string | null,
): Promise<{ error?: string }> {
  const inst = INSTRUMENTS[kind];
  if (!inst) return { error: "Unknown instrument." };
  const due = dueAt ? new Date(dueAt + "T23:59:00") : null;
  const supabase = createClient();
  const { error } = await supabase.rpc("create_survey", {
    p_team: teamId,
    p_kind: kind,
    p_name: inst.name,
    ...(due && !isNaN(due.getTime()) ? { p_due: due.toISOString() } : {}),
  });
  if (error) return { error: error.message };
  revalidatePath("/assessments");
  return {};
}

export async function remindSurvey(surveyId: string): Promise<{ error?: string; pending?: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("remind_survey", { p_survey: surveyId });
  if (error) return { error: error.message };
  return { pending: (data as unknown as number) ?? 0 };
}

export async function closeSurvey(surveyId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("close_survey", { p_survey: surveyId });
  if (error) return { error: error.message };
  revalidatePath("/assessments");
  return {};
}

export async function runPulse(
  teamId: string,
  name: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("create_pulse", {
    p_team: teamId,
    p_name: name,
  });
  if (error) return { error: error.message };
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
