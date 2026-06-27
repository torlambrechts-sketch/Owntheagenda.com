"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import type { Enums } from "@/types/database.types";

type Category = Enums<"template_category">;
type Activity = Enums<"activity_type">;

export type PhaseInput = {
  title: string;
  type: Activity;
  minutes: number;
  prompt?: string | null;
};

// Create or update a workspace-owned workshop template. Writes go through the
// `template` table whose RLS already restricts inserts/updates to workspace
// admins, so we mirror that guard here for a clean error instead of a raw 42501.
export async function saveWorkshopTemplate(input: {
  id?: string | null;
  name: string;
  category: Category;
  description?: string | null;
  phases: PhaseInput[];
}): Promise<{ id?: string; error?: string }> {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) return { error: "Only workspace admins can manage templates." };
  const supabase = createClient();

  const phases = (input.phases ?? []).map((p) => ({
    title: (p.title ?? "").trim() || "Step",
    type: p.type,
    minutes: Math.max(0, Number(p.minutes) || 0),
    ...(p.prompt && p.prompt.trim() ? { prompt: p.prompt.trim() } : {}),
  }));
  const definition = { phases } as unknown as never;
  const defaultDuration = phases.reduce((s, p) => s + p.minutes, 0);
  const name = input.name.trim() || "Untitled template";

  if (input.id) {
    // Guard: never let an edit touch a system (workspace_id null) template.
    const { data: existing } = await supabase
      .from("template")
      .select("id, workspace_id")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing || existing.workspace_id !== ctx.workspace.id) {
      return { error: "That template can't be edited here." };
    }
    const { error } = await supabase
      .from("template")
      .update({ name, category: input.category, description: input.description?.trim() || null, default_duration: defaultDuration, definition })
      .eq("id", input.id);
    if (error) return { error: error.message };
    revalidatePath("/workshops/templates");
    revalidatePath("/workshops");
    return { id: input.id };
  }

  const { data, error } = await supabase
    .from("template")
    .insert({
      workspace_id: ctx.workspace.id,
      name,
      category: input.category,
      description: input.description?.trim() || null,
      default_duration: defaultDuration,
      definition,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/workshops/templates");
  revalidatePath("/workshops");
  return { id: data.id };
}

export async function deleteWorkshopTemplate(id: string): Promise<{ error?: string }> {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) return { error: "Only workspace admins can manage templates." };
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("template")
    .select("id, workspace_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing || existing.workspace_id !== ctx.workspace.id) {
    return { error: "That template can't be deleted." };
  }
  const { error } = await supabase.from("template").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/workshops/templates");
  revalidatePath("/workshops");
  return {};
}
