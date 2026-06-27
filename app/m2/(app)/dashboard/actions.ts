"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";

// Award a milestone to a team (idempotent) and credit its XP to the journey.
async function awardMilestone(
  supabase: ReturnType<typeof createClient>,
  wsId: string,
  teamId: string,
  key: string,
  cycleId: string | null,
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
  if (existing) return; // already earned — don't double-credit

  const { error } = await supabase.from("team_milestone").insert({
    workspace_id: wsId,
    team_id: teamId,
    milestone_id: ms.id,
    cycle_id: cycleId,
  });
  if (error) return;

  if (ms.xp_reward > 0) {
    const { data: j } = await supabase
      .from("team_journey")
      .select("xp")
      .eq("team_id", teamId)
      .maybeSingle();
    const nextXp = (j?.xp ?? 0) + ms.xp_reward;
    const { data: lvl } = await supabase.rpc("level_for_xp", { p_xp: nextXp });
    await supabase
      .from("team_journey")
      .update({ xp: nextXp, level: lvl ?? 1 })
      .eq("team_id", teamId);
  }
}

// Ensure a team has a journey row (level 1 / 0 XP) so the dashboard hero and
// journey screen always have something to render.
export async function ensureJourney(teamId: string) {
  const ctx = await requireSession();
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("team_journey")
    .select("id")
    .eq("team_id", teamId)
    .maybeSingle();
  if (!existing) {
    await supabase
      .from("team_journey")
      .insert({ workspace_id: ctx.workspace.id, team_id: teamId });
  }
}

// Start a new measurement cycle for a team. Creates the cadence row, makes
// sure the journey exists, and awards the "first_cycle" badge on cycle #1.
export async function startCycle(formData: FormData) {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;
  const teamId = String(formData.get("team_id") ?? "");
  const cadenceWeeks = Number(formData.get("cadence_weeks") ?? 6) || 6;
  const frameworkKey = (formData.get("framework_key") as string) || null;
  if (!teamId) return;

  // Next sequence number for this team.
  const { data: last } = await supabase
    .from("cycle")
    .select("seq")
    .eq("team_id", teamId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const seq = (last?.seq ?? 0) + 1;

  const season = seasonLabel();

  const { data: cycle, error } = await supabase
    .from("cycle")
    .insert({
      workspace_id: wsId,
      team_id: teamId,
      seq,
      label: `Cycle ${String(seq).padStart(2, "0")}`,
      season,
      framework_key: frameworkKey,
      cadence_weeks: cadenceWeeks,
      status: "active",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !cycle) return;

  // Ensure the journey exists, then award the first-cycle milestone.
  await supabase
    .from("team_journey")
    .upsert(
      { workspace_id: wsId, team_id: teamId },
      { onConflict: "team_id", ignoreDuplicates: true },
    );
  if (seq === 1) {
    await awardMilestone(supabase, wsId, teamId, "first_cycle", cycle.id);
  }

  revalidatePath("/m2/dashboard");
}

// "Spring 2026" style label from the current date (server-side, stable).
function seasonLabel(): string {
  const d = new Date();
  const m = d.getMonth();
  const season =
    m <= 1 || m === 11 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Autumn";
  return `${season} ${d.getFullYear()}`;
}
