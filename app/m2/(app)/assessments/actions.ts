"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";
import { isManagerOrAbove } from "@/lib/util";

// Starts an assessment (pulse) for a team from a library template and opens it
// immediately so team members can respond. Real, DB-backed.
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
    status: "open",
    opened_at: new Date().toISOString(),
    created_by: ctx.userId,
  });

  revalidatePath("/m2/assessments");
}

// Submit a respondent's scores for the five team dynamics via the existing
// SECURITY DEFINER RPC (it enforces open-pulse + team-membership and upserts).
export async function submitAssessment(
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const pulseId = String(formData.get("pulse_id") ?? "");
  if (!pulseId) return { ok: false, error: "Missing assessment." };

  const scores: Record<string, number> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("score:")) {
      const dynamic = k.slice("score:".length);
      const n = Number(v);
      if (dynamic && Number.isFinite(n)) scores[dynamic] = n;
    }
  }
  if (Object.keys(scores).length === 0) return { ok: false, error: "Answer at least one question." };

  const { error } = await supabase.rpc("submit_pulse_response", {
    p_pulse: pulseId,
    p_scores: scores,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/m2/assessments");
  redirect("/m2/assessments?done=1");
}
