"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function submitRequest(title: string, description: string): Promise<{ error?: string }> {
  const t = title.trim();
  if (!t) return { error: "Give your idea a title." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };
  const { error } = await supabase.from("roadmap_item").insert({
    title: t,
    description: description.trim(),
    status: "requested",
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/help/roadmap");
  return {};
}

export async function setVote(itemId: string, on: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };
  if (on) {
    const { error } = await supabase.from("roadmap_vote").insert({ roadmap_item_id: itemId, user_id: user.id });
    if (error && !/duplicate|unique/i.test(error.message)) return { error: error.message };
  } else {
    const { error } = await supabase.from("roadmap_vote").delete().eq("roadmap_item_id", itemId).eq("user_id", user.id);
    if (error) return { error: error.message };
  }
  revalidatePath("/help/roadmap");
  return {};
}

// Staff-only (enforced by RLS): move an item across the roadmap.
export async function setStatus(itemId: string, status: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "shipped") patch.shipped_at = new Date().toISOString();
  const { error } = await supabase.from("roadmap_item").update(patch).eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath("/help/roadmap");
  return {};
}
