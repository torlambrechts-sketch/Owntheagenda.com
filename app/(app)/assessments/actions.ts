"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
