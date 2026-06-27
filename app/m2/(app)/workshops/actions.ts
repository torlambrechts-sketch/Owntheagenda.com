"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";
import { isManagerOrAbove } from "@/lib/util";

// Plans a draft workshop for a team, optionally from a template. Real write;
// the workshop then appears under "Your workshops" and can be run via /run.
export async function planWorkshop(formData: FormData) {
  const ctx = await requireSession();
  if (!isManagerOrAbove(ctx.role)) return;
  const supabase = createClient();
  const teamId = String(formData.get("team_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const templateId = (formData.get("template_id") as string) || null;
  if (!teamId || !title) return;

  await supabase.from("workshop").insert({
    workspace_id: ctx.workspace.id,
    team_id: teamId,
    title,
    template_id: templateId,
    status: "draft",
    created_by: ctx.userId,
  });

  revalidatePath("/m2/workshops");
}
