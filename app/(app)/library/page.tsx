import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { listTemplates, instrumentsFrom } from "@/lib/assessments";
import { LibraryClient, type LibTemplate } from "./LibraryClient";

// The assessment library: a browsable catalog of research-grounded instruments.
// Team instruments launch as an anonymous survey to a team; individual
// instruments are self-assessments you take yourself (private to you).
export default async function LibraryPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const rows = await listTemplates();
  const instruments = instrumentsFrom(rows);
  const templates: LibTemplate[] = rows.map((t) => ({
    key: t.key,
    name: t.name,
    category: t.category,
    scope: t.scope,
    source: t.source,
    description: t.description,
    custom: t.workspace_id != null,
  }));

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const { data: myTm } = await supabase
    .from("team_member")
    .select("team_id, is_lead")
    .eq("user_id", ctx.userId);
  const leadTeamIds = new Set((myTm ?? []).filter((t) => t.is_lead).map((t) => t.team_id));
  const manageableTeams = (teams ?? [])
    .filter((t) => isAdmin(ctx.role) || t.lead_user_id === ctx.userId || leadTeamIds.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }));

  const { data: mine } = await supabase
    .from("individual_response")
    .select("template_key")
    .eq("user_id", ctx.userId)
    .eq("workspace_id", ctx.workspace.id);
  const completed = (mine ?? []).map((r) => r.template_key);

  return (
    <div>
      <h1 className="page-title">Assessment library</h1>
      <p className="page-sub">
        Research-grounded instruments for teams and individuals. Launch a team
        read as an anonymous survey, or take an individual one yourself.
      </p>
      <LibraryClient
        templates={templates}
        instruments={instruments}
        manageableTeams={manageableTeams}
        completed={completed}
      />
    </div>
  );
}
