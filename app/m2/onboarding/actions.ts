"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";

export type OnboardingResult = { ok: boolean; error?: string };

// Completes the MAIN2 onboarding: creates the team, its first cycle (with the
// chosen framework + cadence), seeds the journey, awards the first-cycle badge,
// and issues any invitations. All real, DB-backed writes.
export async function completeOnboarding(
  _prev: OnboardingResult,
  formData: FormData,
): Promise<OnboardingResult> {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const frameworkKey = String(formData.get("framework_key") ?? "").trim() || null;
  const teamName = String(formData.get("team_name") ?? "").trim();
  const cadenceWeeks = Math.min(52, Math.max(1, Number(formData.get("cadence_weeks") ?? 6) || 6));
  const invitesRaw = String(formData.get("invites") ?? "");

  if (!teamName) return { ok: false, error: "Give your team a name." };
  if (!isAdmin(ctx.role)) {
    return { ok: false, error: "Only a workspace admin or owner can set up a new team." };
  }

  // 1) Team (caller becomes its lead).
  const { data: team, error: teamErr } = await supabase
    .from("team")
    .insert({
      workspace_id: wsId,
      name: teamName,
      lead_user_id: ctx.userId,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (teamErr || !team) {
    return { ok: false, error: teamErr?.message ?? "Could not create the team." };
  }

  // 2) Lead membership on the team.
  await supabase
    .from("team_member")
    .insert({ team_id: team.id, user_id: ctx.userId, is_lead: true })
    .select("id")
    .maybeSingle();

  // 3) Journey row.
  await supabase
    .from("team_journey")
    .upsert(
      { workspace_id: wsId, team_id: team.id },
      { onConflict: "team_id", ignoreDuplicates: true },
    );

  // 4) First cycle.
  const { data: cycle } = await supabase
    .from("cycle")
    .insert({
      workspace_id: wsId,
      team_id: team.id,
      seq: 1,
      label: "Cycle 01",
      season: seasonLabel(),
      framework_key: frameworkKey,
      cadence_weeks: cadenceWeeks,
      status: "active",
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  // 5) First-cycle milestone (+ its XP).
  const { data: ms } = await supabase
    .from("milestone")
    .select("id, xp_reward")
    .eq("key", "first_cycle")
    .maybeSingle();
  if (ms) {
    const { error: meErr } = await supabase.from("team_milestone").insert({
      workspace_id: wsId,
      team_id: team.id,
      milestone_id: ms.id,
      cycle_id: cycle?.id ?? null,
    });
    if (!meErr && ms.xp_reward > 0) {
      const lvl = await supabase.rpc("level_for_xp", { p_xp: ms.xp_reward });
      await supabase
        .from("team_journey")
        .update({ xp: ms.xp_reward, level: lvl.data ?? 1 })
        .eq("team_id", team.id);
    }
  }

  // 6) Invitations (best-effort; emailing is handled elsewhere).
  const emails = parseEmails(invitesRaw);
  for (const email of emails) {
    await supabase.rpc("create_invitation", {
      p_workspace: wsId,
      p_email: email,
      p_role: "member",
      p_team: team.id,
    });
  }

  revalidatePath("/m2", "layout");
  redirect("/m2/dashboard");
}

function parseEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
    ),
  ).slice(0, 50);
}

function seasonLabel(): string {
  const d = new Date();
  const m = d.getMonth();
  const season =
    m <= 1 || m === 11 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Autumn";
  return `${season} ${d.getFullYear()}`;
}
