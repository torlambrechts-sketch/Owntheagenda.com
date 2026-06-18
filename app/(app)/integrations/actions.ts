"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

// Writes are gated by RLS (is_workspace_admin); the page also redirects non-admins.
export async function connectIntegration(
  workspaceId: string,
  provider: string,
  config: Record<string, unknown>,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("integration").upsert(
    {
      workspace_id: workspaceId,
      provider,
      status: "connected",
      config: config as Json,
      connected_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider" },
  );
  if (error) return { error: error.message };
  revalidatePath("/integrations");
  return {};
}

export async function disconnectIntegration(
  workspaceId: string,
  provider: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("integration")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("provider", provider);
  if (error) return { error: error.message };
  revalidatePath("/integrations");
  return {};
}
