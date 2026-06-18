"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";
import type { Json } from "@/types/database.types";

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

// Create or update a workspace-custom assessment template (admin-only; the RPC
// enforces it). The workspace is taken from the session, not the client.
export async function saveTemplate(input: {
  id: string | null;
  name: string;
  category: string;
  scope: string;
  description: string;
  source: string;
  definition: unknown;
}): Promise<{ error?: string; id?: string }> {
  const ctx = await requireSession();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("save_assessment_template", {
    p_workspace: ctx.workspace.id,
    p_id: input.id,
    p_name: input.name,
    p_category: input.category,
    p_scope: input.scope,
    p_description: input.description || null,
    p_source: input.source || null,
    p_definition: input.definition as Json,
  });
  if (error) return { error: error.message };
  revalidatePath("/library");
  return { id: (data as { id?: string } | null)?.id };
}

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_assessment_template", { p_id: id });
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
