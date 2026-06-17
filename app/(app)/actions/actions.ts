"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";

// Capture a new commitment at the team level (no live session required).
export async function addAction(input: {
  teamId: string;
  text: string;
  owner?: string | null;
  ownerId?: string | null;
  dueAt?: string | null;
}): Promise<{ error?: string }> {
  const text = input.text.trim();
  if (!text) return { error: "Add a short description." };
  if (!input.teamId) return { error: "Pick a team." };

  const ctx = await requireSession();
  const supabase = createClient();
  const { error } = await supabase.from("action_item").insert({
    workspace_id: ctx.workspace.id,
    team_id: input.teamId,
    text,
    owner_name: input.owner?.trim() || null,
    owner_id: input.ownerId || null,
    due_at: input.dueAt || null,
    status: "open",
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/actions");
  return {};
}

export async function editAction(input: {
  id: string;
  text: string;
  owner?: string | null;
  ownerId?: string | null;
  dueAt?: string | null;
}): Promise<{ error?: string }> {
  const text = input.text.trim();
  if (!text) return { error: "Add a short description." };

  const supabase = createClient();
  const { error } = await supabase
    .from("action_item")
    .update({
      text,
      owner_name: input.owner?.trim() || null,
      owner_id: input.ownerId || null,
      due_at: input.dueAt || null,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/actions");
  return {};
}

// Flip open <-> done via the SECURITY DEFINER RPC (workspace-member guarded).
export async function toggleAction(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("toggle_action", { p_action: id });
  if (error) return { error: error.message };
  revalidatePath("/actions");
  return {};
}

export async function removeAction(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("action_item").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/actions");
  return {};
}
