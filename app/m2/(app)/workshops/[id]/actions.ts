"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";

// Toggle an action open<->done, then — if every action for the workshop is now
// done — award the team's "all_actions_closed" milestone (idempotent).
export async function toggleWorkshopAction(formData: FormData) {
  const ctx = await requireSession();
  const supabase = createClient();
  const actionId = String(formData.get("action_id") ?? "");
  const workshopId = String(formData.get("workshop_id") ?? "");
  if (!actionId || !workshopId) return;

  const { error } = await supabase.rpc("toggle_action", { p_action: actionId });
  if (error) {
    revalidatePath(`/m2/workshops/${workshopId}`);
    return;
  }

  // Re-check completion for this workshop's actions.
  const { data: ws } = await supabase
    .from("workshop")
    .select("team_id, workspace_id")
    .eq("id", workshopId)
    .maybeSingle();
  if (ws?.team_id) {
    const { data: items } = await supabase
      .from("action_item")
      .select("status")
      .eq("workshop_id", workshopId);
    const list = items ?? [];
    if (list.length > 0 && list.every((a) => a.status === "done")) {
      await awardMilestone(supabase, ws.workspace_id, ws.team_id, "all_actions_closed");
    }
  }

  revalidatePath(`/m2/workshops/${workshopId}`);
  revalidatePath("/m2/dashboard");
}

async function awardMilestone(
  supabase: ReturnType<typeof createClient>,
  wsId: string,
  teamId: string,
  key: string,
) {
  const { data: ms } = await supabase
    .from("milestone")
    .select("id, xp_reward")
    .eq("key", key)
    .maybeSingle();
  if (!ms) return;
  const { data: existing } = await supabase
    .from("team_milestone")
    .select("id")
    .eq("team_id", teamId)
    .eq("milestone_id", ms.id)
    .maybeSingle();
  if (existing) return;
  const { error } = await supabase
    .from("team_milestone")
    .insert({ workspace_id: wsId, team_id: teamId, milestone_id: ms.id });
  if (error) return;
  if (ms.xp_reward > 0) {
    const { data: j } = await supabase.from("team_journey").select("xp").eq("team_id", teamId).maybeSingle();
    const nextXp = (j?.xp ?? 0) + ms.xp_reward;
    const lvl = await supabase.rpc("level_for_xp", { p_xp: nextXp });
    await supabase.from("team_journey").update({ xp: nextXp, level: lvl.data ?? 1 }).eq("team_id", teamId);
  }
}
