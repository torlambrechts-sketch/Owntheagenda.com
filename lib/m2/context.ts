import type { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/workspace";

export type ActiveTeam = { id: string; name: string };

// The team the MAIN2 surface should focus on for a given user: the team they
// lead if any, otherwise the first non-deleted team they belong to, otherwise
// the first team in the workspace. Returns null when the workspace has no team.
export async function getActiveTeam(
  supabase: ReturnType<typeof createClient>,
  ctx: SessionContext,
): Promise<ActiveTeam | null> {
  const wsId = ctx.workspace.id;

  // 1) A team this user leads.
  const { data: led } = await supabase
    .from("team")
    .select("id, name")
    .eq("workspace_id", wsId)
    .eq("lead_user_id", ctx.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (led) return led;

  // 2) A team the user is a member of.
  const { data: mine } = await supabase
    .from("team_member")
    .select("team:team!inner(id, name, workspace_id, deleted_at)")
    .eq("user_id", ctx.userId)
    .eq("team.workspace_id", wsId)
    .is("team.deleted_at", null)
    .limit(1)
    .maybeSingle();
  const mineTeam = mine?.team as { id: string; name: string } | null | undefined;
  if (mineTeam) return { id: mineTeam.id, name: mineTeam.name };

  // 3) Any team in the workspace (admin viewing a workspace they don't sit on).
  const { data: any } = await supabase
    .from("team")
    .select("id, name")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return any ?? null;
}
