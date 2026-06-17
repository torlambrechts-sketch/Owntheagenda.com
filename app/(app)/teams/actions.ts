"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createTeam(input: {
  workspaceId: string;
  name: string;
  description?: string | null;
  parentTeamId?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("team").insert({
    workspace_id: input.workspaceId,
    name: input.name.trim(),
    description: input.description || null,
    parent_team_id: input.parentTeamId || null,
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/teams");
  return {};
}
