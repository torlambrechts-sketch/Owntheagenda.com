"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";
import { isManagerOrAbove } from "@/lib/util";

// Starts a draft assessment (pulse) for a team from a library template. Real,
// DB-backed; the draft then shows up under "Your assessments".
export async function startAssessment(formData: FormData) {
  const ctx = await requireSession();
  if (!isManagerOrAbove(ctx.role)) return;
  const supabase = createClient();
  const teamId = String(formData.get("team_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!teamId || !name) return;

  await supabase.from("pulse").insert({
    workspace_id: ctx.workspace.id,
    team_id: teamId,
    name,
    status: "draft",
    created_by: ctx.userId,
  });

  revalidatePath("/m2/assessments");
}
