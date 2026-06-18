"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Workspace updates are gated by RLS (is_workspace_admin); these are thin,
// friendly-error wrappers. The page also redirects non-admins.
export async function saveOrgSettings(input: {
  workspaceId: string;
  name: string;
  logoUrl: string | null;
  dataRegion: string;
  retentionMonths: number | null;
}): Promise<{ error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Company name can’t be empty." };

  const supabase = createClient();
  const { error } = await supabase
    .from("workspace")
    .update({
      name,
      logo_url: input.logoUrl,
      data_region: input.dataRegion,
      retention_months: input.retentionMonths,
    })
    .eq("id", input.workspaceId);
  if (error) return { error: error.message };
  revalidatePath("/organization");
  revalidatePath("/", "layout");
  return {};
}

export async function regenerateJoinCode(
  workspaceId: string,
): Promise<{ error?: string; code?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("regenerate_join_code", {
    p_workspace: workspaceId,
  });
  if (error) return { error: error.message };
  revalidatePath("/organization");
  revalidatePath("/members");
  return { code: data as string };
}
