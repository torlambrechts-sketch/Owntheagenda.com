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

// Create an empty draft workshop (no blocks, no session) and land in the builder.
// Backs the "Blank" mode of the New-workshop slide-over.
export async function createBlankWorkshop(
  teamId: string,
  title: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_blank_workshop", {
    p_team: teamId,
    p_title: title,
  });
  if (error) return { error: error.message };
  revalidatePath("/workshops");
  return { id: data as string };
}

// Run an on-demand session: create an ad-hoc workshop with one starting module
// and start it. Returns the workshop id to navigate straight into the run.
export async function quickStart(
  teamId: string,
  title: string,
  kind: string,
  instrument?: string,
): Promise<{ workshopId?: string; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("quick_start_workshop", {
    p_team: teamId,
    p_title: title,
    p_kind: kind,
    ...(instrument ? { p_instrument: instrument } : {}),
  });
  if (error) return { error: error.message };
  return { workshopId: data as string };
}

// Launch a live (or dry-run) session from the "Run a workshop" launcher.
// A dry run rehearses without recording to the workshop record.
export async function launchRun(
  workshopId: string,
  dry: boolean,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("start_session", { p_workshop: workshopId, p_dry: dry });
  if (error) return { error: error.message };
  revalidatePath(`/run/${workshopId}`);
  return {};
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

// Structured, ordered objectives list. `objective` (legacy single column) is
// kept in sync with the first entry so existing readers stay correct.
export async function setWorkshopObjectives(
  id: string,
  objectives: string[],
): Promise<{ error?: string }> {
  const clean = objectives.map((o) => o.trim()).filter(Boolean);
  const supabase = createClient();
  const { error } = await supabase
    .from("workshop")
    .update({ objectives: clean, objective: clean[0] ?? null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${id}`);
  revalidatePath(`/workshops/${id}/overview`);
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
  ownerName?: string | null;
  phase?: string | null;
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
    owner_name: input.ownerName?.trim() || null,
    phase: input.phase ?? null,
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
  ownerName?: string | null;
  phase?: string | null;
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
      owner_name: input.ownerName?.trim() || null,
      phase: input.phase ?? null,
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

// Persist a full kanban layout: each item carries its new phase column, and the
// array order is the new linear agenda order (ord). One round-trip via an RPC
// that is gated by can_manage_workshop and scoped to the workshop server-side.
export async function setAgendaLayout(
  workshopId: string,
  items: { id: string; phase: string | null }[],
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_agenda_layout", {
    p_workshop: workshopId,
    p_items: items.map((it) => ({ id: it.id, phase: it.phase ?? "" })),
  });
  if (error) return { error: error.message };
  revalidatePath(`/workshops/${workshopId}`);
  return {};
}
