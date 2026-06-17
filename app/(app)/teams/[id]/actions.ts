"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addTeamMember(input: {
  teamId: string;
  userId: string;
  roleTitle?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("team_member").insert({
    team_id: input.teamId,
    user_id: input.userId,
    role_title: input.roleTitle || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/teams/${input.teamId}`);
  return {};
}

export async function removeTeamMember(
  teamId: string,
  teamMemberId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("team_member")
    .delete()
    .eq("id", teamMemberId);
  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return {};
}

export async function setTeamLead(
  teamId: string,
  userId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("team")
    .update({ lead_user_id: userId })
    .eq("id", teamId);
  if (error) return { error: error.message };
  // Sync the is_lead flag across the team's members.
  await supabase.from("team_member").update({ is_lead: false }).eq("team_id", teamId);
  await supabase
    .from("team_member")
    .update({ is_lead: true })
    .eq("team_id", teamId)
    .eq("user_id", userId);
  revalidatePath(`/teams/${teamId}`);
  return {};
}

export async function updateTeam(input: {
  teamId: string;
  name: string;
  description?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("team")
    .update({ name: input.name.trim(), description: input.description || null })
    .eq("id", input.teamId);
  if (error) return { error: error.message };
  revalidatePath(`/teams/${input.teamId}`);
  return {};
}

export async function deleteTeam(teamId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("team").delete().eq("id", teamId);
  if (error) return { error: error.message };
  revalidatePath("/teams");
  redirect("/teams");
}

// A member toggles consent on their OWN team_member row (scoped RPC).
export async function setConsent(
  teamId: string,
  teamMemberId: string,
  consent: boolean,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_team_consent", {
    p_team_member: teamMemberId,
    p_consent: consent,
  });
  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return {};
}
