import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { HealthClient, type Entity } from "./HealthClient";

// Workspace-level Health board: every team and leadership group, rolled up across
// dynamics, strategy and performance, with a manual status overlay.
export default async function HealthPage() {
  const { userId, workspace, role } = await requireSession();
  // Org-wide Health rolls up every team via a definer RPC (bypasses RLS), so
  // scoped facilitators don't get it.
  if (role === "facilitator") redirect("/dashboard");
  const supabase = createClient();

  const { data } = await supabase.rpc("workspace_health", { p_workspace: workspace.id });
  const entities = ((data as unknown as Entity[]) ?? []).filter(Boolean);

  // Which teams may this person manage (show the inline status editor)?
  const admin = isAdmin(role);
  let manageable: string[];
  if (admin) {
    manageable = entities.map((e) => e.team_id);
  } else {
    const { data: led } = await supabase
      .from("team")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("lead_user_id", userId)
      .is("deleted_at", null);
    manageable = (led ?? []).map((t) => t.id);
  }

  // Momentum: soonest planned follow-up + open commitments per team. A team with
  // open commitments and no scheduled next step is flagged.
  const [{ data: fuPlanned }, { data: openActs }] = await Promise.all([
    supabase.from("follow_up").select("team_id, scheduled_at").eq("workspace_id", workspace.id).eq("status", "planned"),
    supabase.from("action_item").select("team_id").eq("workspace_id", workspace.id).eq("status", "open"),
  ]);
  const nextByTeam = new Map<string, string>();
  for (const f of fuPlanned ?? []) {
    if (f.team_id && f.scheduled_at) {
      const cur = nextByTeam.get(f.team_id);
      if (!cur || f.scheduled_at < cur) nextByTeam.set(f.team_id, f.scheduled_at);
    }
  }
  const openByTeam = new Map<string, number>();
  for (const a of openActs ?? []) if (a.team_id) openByTeam.set(a.team_id, (openByTeam.get(a.team_id) ?? 0) + 1);
  const momentum: Record<string, { nextAt: string | null; open: number }> = {};
  for (const e of entities) momentum[e.team_id] = { nextAt: nextByTeam.get(e.team_id) ?? null, open: openByTeam.get(e.team_id) ?? 0 };

  return (
    <div>
      <h1 className="page-title">Health</h1>
      <p className="page-sub">Status of every team and leadership group — dynamics, strategy and performance.</p>
      <HealthClient entities={entities} manageable={manageable} momentum={momentum} />
    </div>
  );
}
