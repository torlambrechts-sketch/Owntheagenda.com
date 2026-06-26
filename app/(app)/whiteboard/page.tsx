import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { type GalleryItem } from "../workshops/CanvasGallery";
import type { CanvasObj } from "@/components/CanvasStatic";
import { WhiteboardClient } from "./WhiteboardClient";

export default async function WhiteboardPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  // First team — used to spin up a fresh whiteboard session on demand.
  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const team = teams?.[0] ?? null;
  const canManage = isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  // Workspace-wide saved canvases (boards).
  const { data: snaps } = await supabase
    .from("canvas_snapshot")
    .select("id, title, workshop_id, block_ord, object_count, created_at, data")
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false })
    .limit(200);
  const cList = snaps ?? [];
  const cWkIds = Array.from(new Set(cList.map((s) => s.workshop_id)));
  const { data: cWks } = cWkIds.length
    ? await supabase.from("workshop").select("id, title, team_id").in("id", cWkIds)
    : { data: [] as { id: string; title: string; team_id: string }[] };
  const cWkById = new Map((cWks ?? []).map((w) => [w.id, w]));
  const cTeamIds = Array.from(new Set((cWks ?? []).map((w) => w.team_id)));
  const { data: cTeams } = cTeamIds.length
    ? await supabase.from("team").select("id, name, lead_user_id").in("id", cTeamIds)
    : { data: [] as { id: string; name: string; lead_user_id: string | null }[] };
  const cTeamById = new Map((cTeams ?? []).map((t) => [t.id, t]));
  const admin = isAdmin(ctx.role);
  const canvasItems: GalleryItem[] = cList.map((s) => {
    const wk = cWkById.get(s.workshop_id);
    const tm = wk ? cTeamById.get(wk.team_id) : null;
    return {
      id: s.id,
      title: s.title,
      workshopId: s.workshop_id,
      workshopTitle: wk?.title ?? "Whiteboard",
      team: tm?.name ?? null,
      blockOrd: s.block_ord,
      objectCount: s.object_count,
      createdAt: s.created_at,
      manageable: admin || tm?.lead_user_id === ctx.userId,
      data: (s.data ?? []) as unknown as CanvasObj[],
    };
  });

  return (
    <div>
      <h1 className="page-title">Whiteboard</h1>
      <p className="page-sub">
        A freeform board for notes, shapes, and connectors — start one live, or reopen a saved board.
      </p>
      <WhiteboardClient
        teamId={team?.id ?? null}
        canStart={canManage}
        canvasItems={canvasItems}
      />
    </div>
  );
}
