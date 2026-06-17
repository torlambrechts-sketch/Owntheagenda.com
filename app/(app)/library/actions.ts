"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";

// Record my answers to an individual instrument (working style, strengths, …).
// The workspace is taken from the session, not the client.
export async function submitIndividual(
  templateKey: string,
  scores: Record<string, number>,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  const supabase = createClient();
  const { error } = await supabase.rpc("submit_individual_response", {
    p_workspace: ctx.workspace.id,
    p_template_key: templateKey,
    p_scores: scores,
  });
  if (error) return { error: error.message };
  revalidatePath("/library");
  return {};
}

// Opt in / out of sharing one of my individual results with teammates.
export async function setShared(
  templateKey: string,
  shared: boolean,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  const supabase = createClient();
  const { error } = await supabase.rpc("set_individual_shared", {
    p_workspace: ctx.workspace.id,
    p_template_key: templateKey,
    p_shared: shared,
  });
  if (error) return { error: error.message };
  revalidatePath("/library");
  return {};
}
