import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { WorkshopsClient, type TemplateCard, type WorkshopRow } from "./WorkshopsClient";

export default async function WorkshopsPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const team = teams?.[0] ?? null;

  const { data: templates } = await supabase
    .from("template")
    .select("id, name, category, source, description, default_duration, definition")
    .order("category", { ascending: true });

  const tplCards: TemplateCard[] = (templates ?? []).map((t) => {
    const phases = (((t.definition as any)?.phases ?? []) as any[]) || [];
    const minutes = phases.reduce((s, p) => s + (p?.minutes ?? 0), 0);
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      source: t.source,
      description: t.description,
      steps: phases.length,
      minutes: minutes || t.default_duration,
      types: phases.map((p) => p?.type ?? "canvas"),
    };
  });

  let workshops: WorkshopRow[] = [];
  if (team) {
    const { data: ws } = await supabase
      .from("workshop")
      .select("id, title, status, created_at")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false });
    workshops = (ws ?? []).map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
    }));
  }

  const canManage =
    isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  return (
    <div>
      <h1 className="page-title">Workshops</h1>
      <p className="page-sub">
        Proven frameworks, ready to run. Pick one — we build the agenda for you.
      </p>
      {team ? (
        <WorkshopsClient
          teamId={team.id}
          canManage={canManage}
          templates={tplCards}
          workshops={workshops}
        />
      ) : (
        <div className="card empty">Create a team first to build a workshop.</div>
      )}
    </div>
  );
}
