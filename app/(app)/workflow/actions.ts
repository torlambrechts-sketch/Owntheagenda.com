"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Create a program (the standard six-stage operating loop) for a team.
export async function createProgram(workspaceId: string, title: string, teamId: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_program", {
    p_workspace: workspaceId,
    p_title: title,
    p_team: teamId,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return { id: data as string };
}

// Advance / update a single step manually.
export async function setProgramStep(stepId: string, status: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_program_step", { p_step: stepId, p_status: status });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Start the pulse for the program's team (links assessment + launch steps).
export async function startPulse(programId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_start_pulse", { p_program: programId });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Build the linked workshop from a template (carries the program's pulse).
export async function buildWorkshop(programId: string, templateId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_build_workshop", {
    p_program: programId,
    p_template: templateId,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Schedule the re-measure follow-up and open the final step.
export async function scheduleRepulse(programId: string, when: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_schedule_repulse", {
    p_program: programId,
    p_when: new Date(when).toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Advance any active step whose gate is now met (pulse threshold, workshop
// finished, re-pulse completed).
export async function syncProgram(programId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_sync", { p_program: programId });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}
