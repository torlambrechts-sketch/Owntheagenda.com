import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { createClient } from "@/lib/supabase/server";
import { IntegrationsClient, type Conn } from "./IntegrationsClient";

export default async function IntegrationsPage() {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/dashboard");

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("integration")
    .select("provider, status, config")
    .eq("workspace_id", ctx.workspace.id);

  const connected: Record<string, Conn> = {};
  for (const r of rows ?? []) {
    connected[r.provider] = {
      status: r.status,
      config: (r.config ?? {}) as Record<string, unknown>,
    };
  }

  return (
    <div>
      <h1 className="page-title">Integrations</h1>
      <p className="page-sub">Connect {ctx.workspace.name} to the tools your teams already use.</p>
      <IntegrationsClient workspaceId={ctx.workspace.id} connected={connected} />
    </div>
  );
}
