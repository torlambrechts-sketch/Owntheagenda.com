"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

// All writes are additionally guarded by RLS in Postgres; these actions are
// thin, authenticated wrappers that surface friendly errors to the UI.

export async function inviteMember(input: {
  workspaceId: string;
  email: string;
  role: Enums<"workspace_role">;
  teamId?: string | null;
  roleTitle?: string | null;
}): Promise<{ error?: string; token?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_workspace: input.workspaceId,
    p_email: input.email.trim(),
    p_role: input.role,
    p_team: input.teamId || undefined,
    p_role_title: input.roleTitle || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/members");
  return { token: data as unknown as string };
}

export async function updateMemberRole(
  membershipId: string,
  role: Enums<"workspace_role">,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("membership")
    .update({ role })
    .eq("id", membershipId);
  if (error) return { error: error.message };
  revalidatePath("/members");
  return {};
}

export async function removeMember(
  membershipId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("membership")
    .delete()
    .eq("id", membershipId);
  if (error) return { error: error.message };
  revalidatePath("/members");
  return {};
}

export async function revokeInvite(
  invitationId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("invitation")
    .update({ status: "revoked" })
    .eq("id", invitationId);
  if (error) return { error: error.message };
  revalidatePath("/members");
  return {};
}
