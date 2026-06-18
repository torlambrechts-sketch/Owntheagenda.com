import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { OrgShell } from "@/components/OrgShell";
import { TeamsClient, type TeamCard } from "./TeamsClient";

export default async function TeamsPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, description, parent_team_id, lead_user_id")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const teamList = teams ?? [];
  const teamIds = teamList.map((t) => t.id);
  const leadIds = teamList
    .map((t) => t.lead_user_id)
    .filter((x): x is string => Boolean(x));

  const { data: memberRows } = teamIds.length
    ? await supabase.from("team_member").select("team_id").in("team_id", teamIds)
    : { data: [] as { team_id: string }[] };
  const counts = new Map<string, number>();
  for (const r of memberRows ?? [])
    counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);

  const { data: leads } = leadIds.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", leadIds)
    : { data: [] as any[] };
  const leadById = new Map((leads ?? []).map((p) => [p.id, p]));
  const nameById = new Map(teamList.map((t) => [t.id, t.name]));

  const cards: TeamCard[] = teamList.map((t) => {
    const lead = t.lead_user_id ? leadById.get(t.lead_user_id) : null;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      leadName: lead?.full_name || lead?.display_name || lead?.email || null,
      memberCount: counts.get(t.id) ?? 0,
      parentName: t.parent_team_id ? nameById.get(t.parent_team_id) ?? null : null,
    };
  });

  return (
    <OrgShell
      active="teams"
      isAdmin={isAdmin(ctx.role)}
      subtitle={`Leadership teams in ${ctx.workspace.name}, and the org hierarchy.`}
    >
      <TeamsClient
        workspaceId={wsId}
        canManage={isAdmin(ctx.role)}
        teams={cards}
        parents={teamList.map((t) => ({ id: t.id, name: t.name }))}
      />
    </OrgShell>
  );
}
