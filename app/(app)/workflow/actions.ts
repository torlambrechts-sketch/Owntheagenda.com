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

// Create a Flow — the focused assessment → collect → workshop pattern.
export async function createFlow(
  workspaceId: string,
  title: string,
  teamId: string | null,
  minResponses: number,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_flow", {
    p_workspace: workspaceId,
    p_title: title,
    p_team: teamId,
    p_min_responses: minResponses,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return { id: data as string };
}

// Create a Flow from a composed list of step boxes (the builder).
export async function createFlowSteps(
  workspaceId: string,
  title: string,
  teamId: string | null,
  minResponses: number,
  steps: { kind: string; title: string; template?: string }[],
  assessmentKind: string | null,
  collectDays: number,
  anonymity: string,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_flow_steps", {
    p_workspace: workspaceId,
    p_title: title,
    p_team: teamId,
    p_min_responses: minResponses,
    p_steps: steps,
    p_assessment_kind: assessmentKind,
    p_collect_days: collectDays,
    p_anonymity: anonymity,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return { id: data as string };
}

// Toggle a flow task between open and done.
export async function setFlowTask(taskId: string, status: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_flow_task", { p_task: taskId, p_status: status });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Toggle a committed action item (the workshop's commitments) open/done.
export async function toggleActionItem(actionId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("toggle_action", { p_action: actionId });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Reassign the owner of a flow driver task.
export async function assignFlowTask(taskId: string, ownerId: string | null, ownerName: string | null) {
  const supabase = createClient();
  const { error } = await supabase.rpc("update_flow_task", {
    p_task: taskId,
    p_owner: ownerId,
    p_owner_name: ownerName,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Start the flow's assessment — an instrument survey if one was chosen,
// otherwise the generic team pulse.
export async function startAssessment(programId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_start_assessment", { p_program: programId });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Launch a Play — a one-click Flow with the workshop pre-selected.
export async function startPlay(
  workspaceId: string,
  teamId: string,
  playKey: string,
  title: string,
  workshopTemplateKey: string,
  minResponses: number,
  assessmentKind: string | null,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_play", {
    p_workspace: workspaceId,
    p_team: teamId,
    p_play_key: playKey,
    p_title: title,
    p_workshop_template_key: workshopTemplateKey,
    p_min_responses: minResponses,
    p_assessment_kind: assessmentKind,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return { id: data as string };
}

// Nudge team members who have not yet responded to a Flow's open pulse.
export async function remindNonResponders(programId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("flow_remind", { p_program: programId });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return { count: (data as number) ?? 0 };
}

// --- Flow Builder (node editor) -------------------------------------------
export async function addStep(programId: string, afterOrd: number, kind: string, title: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_add_step", {
    p_program: programId,
    p_after_ord: afterOrd,
    p_kind: kind,
    p_title: title,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

export async function removeStep(stepId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_remove_step", { p_step: stepId });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

export async function moveStep(stepId: string, dir: number) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_move_step", { p_step: stepId, p_dir: dir });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Reorder a flow's steps in one call (drag-and-drop on the flow canvas).
export async function reorderSteps(programId: string, ids: string[]) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_reorder_steps", { p_program: programId, p_ids: ids });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

export async function setBranch(
  stepId: string,
  dynamic: string,
  op: string,
  value: number,
  thenTemplate: string,
  elseTemplate: string,
) {
  const supabase = createClient();
  const { error } = await supabase.rpc("program_set_branch", {
    p_step: stepId,
    p_dynamic: dynamic,
    p_op: op,
    p_value: value,
    p_then_template: thenTemplate,
    p_else_template: elseTemplate,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Rename a flow/program. Direct update — the program_update RLS policy already
// restricts this to workspace admins.
export async function renameFlow(programId: string, title: string) {
  const t = title.trim();
  if (!t) return { error: "Give the flow a name." };
  const supabase = createClient();
  const { error } = await supabase.from("program").update({ title: t }).eq("id", programId);
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}

// Update a single step's title and/or config jsonb (the builder uses this to
// rename a node and to persist its canvas position in config.pos). Direct
// update — gated by the program_step_update RLS policy (workspace admins).
export async function updateStep(
  stepId: string,
  patch: { title?: string; config?: Record<string, unknown> },
) {
  const supabase = createClient();
  const fields: Record<string, unknown> = {};
  if (typeof patch.title === "string") fields.title = patch.title.trim();
  if (patch.config) fields.config = patch.config;
  if (Object.keys(fields).length === 0) return {};
  const { error } = await supabase.from("program_step").update(fields).eq("id", stepId);
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
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
