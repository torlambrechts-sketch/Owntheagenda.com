import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { HealthClient, type Entity } from "./HealthClient";

// Workspace-level Health board: every team and leadership group, rolled up across
// dynamics, strategy and performance, with a manual status overlay.
export default async function HealthPage() {
  const { userId, workspace, role } = await requireSession();
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

  return (
    <div>
      <h1 className="page-title">Health</h1>
      <p className="page-sub">Status of every team and leadership group — dynamics, strategy and performance.</p>
      <HealthClient entities={entities} manageable={manageable} />
    </div>
  );
}
