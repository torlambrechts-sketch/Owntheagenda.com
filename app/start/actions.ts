"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PLAY_BY_KEY } from "@/lib/plays";

// Quick Start setup — runs the four wizard steps as one server action against
// the app's existing primitives (no new schema):
//   1. Team       → insert a team, return its id
//   2. Focus      → maps to a curated Play (the instrument + workshop pairing)
//   3. Cadence    → names the launched Flow's rhythm (pulse / quarter / one-off)
//   4. Invite     → create_invitation per email, scoped to the new team
// The chosen focus + cadence launch the team's first Flow via start_play, so
// the user lands on a ready assessment instead of an empty workspace.

const CADENCE_LABEL: Record<string, string> = {
  pulse: "Monthly pulse",
  quarter: "Quarterly deep-dive",
  oneoff: "One-off",
};

export async function quickStartSetup(input: {
  workspaceId: string;
  teamName: string;
  focusKey: string; // a key in PLAY_BY_KEY
  cadence: string; // pulse | quarter | oneoff
  invites: string[];
}): Promise<{ error?: string; teamId?: string; flowId?: string; invited?: number }> {
  const name = input.teamName.trim();
  if (!name) return { error: "Give your team a name first." };
  const play = PLAY_BY_KEY[input.focusKey];
  if (!play) return { error: "Pick a focus area to continue." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Team — insert and read back the id for the steps that follow.
  const { data: team, error: teamErr } = await supabase
    .from("team")
    .insert({ workspace_id: input.workspaceId, name, created_by: user?.id ?? null })
    .select("id")
    .single();
  if (teamErr || !team) return { error: teamErr?.message ?? "Could not create the team." };
  const teamId = team.id as string;

  // 4. Invite — one create_invitation per valid email, scoped to the new team.
  // Bad rows are skipped so a single typo can't sink the whole setup.
  let invited = 0;
  for (const raw of input.invites) {
    const email = raw.trim();
    if (!email || !email.includes("@")) continue;
    const { error } = await supabase.rpc("create_invitation", {
      p_workspace: input.workspaceId,
      p_email: email,
      p_role: "member",
      p_team: teamId,
    });
    if (!error) invited++;
  }

  // 2 + 3. Focus + cadence — launch the team's first Flow from the chosen Play,
  // its title carrying the cadence so the rhythm is visible on the Flows list.
  const cadenceLabel = CADENCE_LABEL[input.cadence] ?? "Team check";
  const { data: flowId, error: playErr } = await supabase.rpc("start_play", {
    p_workspace: input.workspaceId,
    p_team: teamId,
    p_play_key: play.key,
    p_title: `${name} · ${cadenceLabel}`,
    p_workshop_template_key: play.workshopTemplateKey,
    p_min_responses: play.minResponses,
    p_assessment_kind: play.assessmentKind,
  });
  if (playErr) {
    // Team + invites already landed — report the team so the user isn't blocked.
    return { teamId, invited, error: playErr.message };
  }

  revalidatePath("/teams");
  revalidatePath("/members");
  revalidatePath("/workflow");
  revalidatePath("/dashboard");
  return { teamId, flowId: (flowId as string) ?? undefined, invited };
}
