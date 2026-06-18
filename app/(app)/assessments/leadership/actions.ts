"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Score a response without saving (standalone mode, for users not on a team).
export async function scoreLeadership(
  scores: Record<string, number>,
): Promise<{ error?: string; result?: unknown }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("score_leadership", { p_scores: scores });
  if (error) return { error: error.message };
  return { result: data };
}

// Save a member's response for a team (upsert, one per member) and return the
// scored result. Reverse-scoring is applied inside score_leadership.
export async function saveLeadershipResponse(
  teamId: string,
  scores: Record<string, number>,
): Promise<{ error?: string; result?: unknown }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { data: team } = await supabase.from("team").select("workspace_id").eq("id", teamId).maybeSingle();
  if (!team) return { error: "Team not found." };

  const { error } = await supabase.from("leadership_response").upsert(
    {
      workspace_id: team.workspace_id,
      team_id: teamId,
      user_id: user.id,
      scores,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "team_id,user_id" },
  );
  if (error) return { error: error.message };

  const { data, error: scoreErr } = await supabase.rpc("score_leadership", { p_scores: scores });
  if (scoreErr) return { error: scoreErr.message };
  revalidatePath("/assessments/leadership");
  return { result: data };
}
