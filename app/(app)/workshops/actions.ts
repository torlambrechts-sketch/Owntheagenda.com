"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

export async function buildFromTemplate(
  teamId: string,
  templateId: string,
  pulseId?: string,
): Promise<{ error?: string; id?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_workshop_from_template", {
    p_team: teamId,
    p_template: templateId,
    p_title: "",
    ...(pulseId ? { p_pulse: pulseId } : {}),
  });
  if (error) return { error: error.message };
  revalidatePath("/workshops");
  return { id: (data as any)?.id as string };
}

// Attach a specific open assessment to a survey step (or null to detach → auto-match).
export async function setBlockSurvey(
  workshopId: string,
  blockId: string,
  surveyId: string | null,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_block_survey", {
    p_block: blockId,
    p_survey: surveyId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${workshopId}`);
  return {};
}

export async function deleteWorkshop(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("workshop").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/workshops");
  return {};
}

export async function scheduleWorkshop(
  id: string,
  at: string,
): Promise<{ error?: string }> {
  const when = new Date(at);
  if (isNaN(when.getTime())) return { error: "Pick a valid date and time." };
  const supabase = createClient();
  const { error } = await supabase.rpc("schedule_workshop", {
    p_workshop: id,
    p_at: when.toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${id}`);
  revalidatePath("/workshops");
  return {};
}

export async function setWorkshopObjective(
  id: string,
  objective: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("workshop")
    .update({ objective: objective.trim() || null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${id}`);
  return {};
}

export async function updateWorkshopTitle(
  id: string,
  title: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("workshop")
    .update({ title: title.trim() || "Untitled workshop" })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${id}`);
  return {};
}

export async function addBlock(input: {
  workshopId: string;
  title: string;
  activityType: Enums<"activity_type">;
  duration: number;
  prompt?: string | null;
  linkedDynamic?: Enums<"team_dynamic"> | null;
  config?: Record<string, unknown>;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: maxRow } = await supabase
    .from("block")
    .select("ord")
    .eq("workshop_id", input.workshopId)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrd = (maxRow?.ord ?? 0) + 1;

  const { error } = await supabase.from("block").insert({
    workshop_id: input.workshopId,
    ord: nextOrd,
    title: input.title.trim() || "New step",
    activity_type: input.activityType,
    duration: input.duration,
    prompt: input.prompt || null,
    linked_dynamic: input.linkedDynamic || null,
    config: (input.config ?? {}) as never,
  });
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${input.workshopId}`);
  return {};
}

export async function updateBlock(input: {
  workshopId: string;
  blockId: string;
  title: string;
  activityType: Enums<"activity_type">;
  duration: number;
  prompt?: string | null;
  linkedDynamic?: Enums<"team_dynamic"> | null;
  config?: Record<string, unknown>;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("block")
    .update({
      title: input.title.trim() || "Step",
      activity_type: input.activityType,
      duration: input.duration,
      prompt: input.prompt || null,
      linked_dynamic: input.linkedDynamic || null,
      config: (input.config ?? {}) as never,
    })
    .eq("id", input.blockId);
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${input.workshopId}`);
  return {};
}

export async function deleteBlock(
  workshopId: string,
  blockId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("block").delete().eq("id", blockId);
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${workshopId}`);
  return {};
}

export async function reorderBlocks(
  workshopId: string,
  ids: string[],
): Promise<{ error?: string }> {
  const supabase = createClient();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("block")
      .update({ ord: i + 1 })
      .eq("id", ids[i]);
    if (error) return { error: error.message };
  }
  revalidatePath(`/workshops/${workshopId}`);
  return {};
}
