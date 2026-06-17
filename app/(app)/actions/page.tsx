import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { ActionsClient, type ActionRow, type TeamOpt } from "./ActionsClient";

export default async function ActionsPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const { data: teams } = await supabase
    .from("team")
    .select("id, name")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamList = (teams ?? []) as { id: string; name: string }[];
  const teamName = new Map(teamList.map((t) => [t.id, t.name]));

  const { data: acts } = await supabase
    .from("action_item")
    .select("id, text, owner_name, owner_id, status, due_at, team_id, workshop_id, created_at")
    .eq("workspace_id", wsId);
  const actsList = acts ?? [];

  // Workspace members — owners we can attach a real account to (so reminders reach them).
  const { data: mem } = await supabase
    .from("membership")
    .select("user_id")
    .eq("workspace_id", wsId)
    .eq("status", "active");
  const memberIds = (mem ?? []).map((m) => m.user_id);
  const { data: profs } = memberIds.length
    ? await supabase
        .from("profile")
        .select("id, full_name, display_name, email")
        .in("id", memberIds)
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const members = (profs ?? []).map((p) => ({
    id: p.id,
    name: p.full_name || p.display_name || p.email || "Member",
  }));

  // Resolve source-workshop titles for the actions that came out of a session.
  const wsIds = Array.from(
    new Set(actsList.map((a) => a.workshop_id).filter((x): x is string => Boolean(x))),
  );
  const { data: wsRows } = wsIds.length
    ? await supabase.from("workshop").select("id, title").in("id", wsIds)
    : { data: [] as { id: string; title: string }[] };
  const wsTitle = new Map((wsRows ?? []).map((w) => [w.id, w.title]));

  const rows: ActionRow[] = actsList.map((a) => ({
    id: a.id,
    text: a.text,
    owner: a.owner_name,
    ownerId: a.owner_id,
    status: a.status,
    dueAt: a.due_at,
    teamId: a.team_id,
    teamName: a.team_id ? teamName.get(a.team_id) ?? "—" : "Unassigned",
    workshopId: a.workshop_id,
    workshopTitle: a.workshop_id ? wsTitle.get(a.workshop_id) ?? null : null,
  }));

  const teamOpts: TeamOpt[] = teamList.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div>
      <h1 className="page-title">Actions</h1>
      <p className="page-sub">
        Commitments your teams made in session — tracked through to done.
      </p>
      {teamOpts.length === 0 ? (
        <div className="card empty">Create a team first to track actions.</div>
      ) : (
        <ActionsClient rows={rows} teams={teamOpts} members={members} />
      )}
    </div>
  );
}
