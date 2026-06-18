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

// Bulk-create invitations from a parsed CSV. Each row goes through the same
// create_invitation RPC (so the same privilege checks apply per row).
export async function bulkInvite(
  workspaceId: string,
  rows: { email: string; role: Enums<"workspace_role">; teamId: string | null; roleTitle: string | null }[],
): Promise<{ created: number; failed: { email: string; error: string }[] }> {
  const supabase = createClient();
  let created = 0;
  const failed: { email: string; error: string }[] = [];
  for (const r of rows) {
    const { error } = await supabase.rpc("create_invitation", {
      p_workspace: workspaceId,
      p_email: r.email.trim(),
      p_role: r.role,
      ...(r.teamId ? { p_team: r.teamId } : {}),
      ...(r.roleTitle ? { p_role_title: r.roleTitle } : {}),
    });
    if (error) failed.push({ email: r.email, error: error.message });
    else created++;
  }
  revalidatePath("/members");
  return { created, failed };
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

// Approve a pending self-join request → activates the membership at its
// requested role (RLS only lets a workspace admin do this).
export async function approveMember(
  membershipId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("membership")
    .update({ status: "active" })
    .eq("id", membershipId);
  if (error) return { error: error.message };
  revalidatePath("/members");
  return {};
}

export async function denyMember(
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

// GDPR right to access — returns the member's identifiable data as JSON.
export async function exportMemberData(
  workspaceId: string,
  userId: string,
): Promise<{ data?: unknown; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("export_member_data", {
    p_user: userId,
    p_workspace: workspaceId,
  });
  if (error) return { error: error.message };
  return { data };
}

// GDPR right to erasure — wipes the member's personal data from this workspace.
export async function eraseMember(
  workspaceId: string,
  userId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("erase_member", {
    p_user: userId,
    p_workspace: workspaceId,
  });
  if (error) return { error: error.message };
  revalidatePath("/members");
  return {};
}
