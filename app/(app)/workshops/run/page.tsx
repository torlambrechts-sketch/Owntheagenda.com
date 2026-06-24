import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { RunSetupClient, type RunnableWorkshop } from "./RunSetupClient";

// "Run a workshop" launcher (comp: isRunSetup) — pick a workshop, choose the role
// you'll take, optionally rehearse as a dry run, then start the live session.
export default async function RunSetupPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: teams } = await supabase
    .from("team")
    .select("id, name")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const team = teams?.[0] ?? null;

  let workshops: RunnableWorkshop[] = [];
  if (team) {
    const { data: ws } = await supabase
      .from("workshop")
      .select("id, title, status, template_id, updated_at")
      .eq("team_id", team.id)
      .neq("status", "done")
      .order("updated_at", { ascending: false });
    const rows = ws ?? [];
    const ids = rows.map((w) => w.id);
    // block counts + total minutes per workshop, in one pass
    const { data: blocks } = ids.length
      ? await supabase.from("block").select("workshop_id, duration").in("workshop_id", ids)
      : { data: [] as { workshop_id: string; duration: number }[] };
    const steps = new Map<string, number>();
    const mins = new Map<string, number>();
    for (const b of blocks ?? []) {
      steps.set(b.workshop_id, (steps.get(b.workshop_id) ?? 0) + 1);
      mins.set(b.workshop_id, (mins.get(b.workshop_id) ?? 0) + (b.duration ?? 0));
    }
    const tplIds = Array.from(new Set(rows.map((w) => w.template_id).filter(Boolean))) as string[];
    const { data: tpls } = tplIds.length
      ? await supabase.from("template").select("id, name").in("id", tplIds)
      : { data: [] as { id: string; name: string }[] };
    const tplName = new Map((tpls ?? []).map((t) => [t.id, t.name]));
    workshops = rows.map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
      templateName: w.template_id ? tplName.get(w.template_id) ?? null : null,
      steps: steps.get(w.id) ?? 0,
      minutes: mins.get(w.id) ?? 0,
    }));
  }

  return (
    <div>
      <h1 className="page-title">Run a workshop</h1>
      <p className="page-sub">
        Pick a workshop, choose the role you’ll take in the room, and start the live session. Use a <b>dry run</b> to rehearse without recording anything to the workshop.
      </p>
      {team ? (
        <RunSetupClient workshops={workshops} />
      ) : (
        <div className="card empty">Create a team and build a workshop first.</div>
      )}
    </div>
  );
}
