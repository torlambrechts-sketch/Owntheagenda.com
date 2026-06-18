import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { CanvasGallery, type GalleryItem } from "./CanvasGallery";
import type { CanvasObj } from "@/components/CanvasStatic";

// Workspace-level gallery of saved canvases: browse, download a PNG, or start a
// fresh session pre-seeded from one.
export default async function CanvasPage() {
  const { userId, workspace, role } = await requireSession();
  const supabase = createClient();

  const { data: snaps } = await supabase
    .from("canvas_snapshot")
    .select("id, title, workshop_id, block_ord, object_count, created_at, data")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const list = snaps ?? [];

  const wkIds = Array.from(new Set(list.map((s) => s.workshop_id)));
  const { data: wks } = wkIds.length
    ? await supabase.from("workshop").select("id, title, team_id").in("id", wkIds)
    : { data: [] as { id: string; title: string; team_id: string }[] };
  const wkById = new Map((wks ?? []).map((w) => [w.id, w]));
  const teamIds = Array.from(new Set((wks ?? []).map((w) => w.team_id)));
  const { data: teams } = teamIds.length
    ? await supabase.from("team").select("id, name, lead_user_id").in("id", teamIds)
    : { data: [] as { id: string; name: string; lead_user_id: string | null }[] };
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const admin = isAdmin(role);

  const items: GalleryItem[] = list.map((s) => {
    const wk = wkById.get(s.workshop_id);
    const team = wk ? teamById.get(wk.team_id) : null;
    return {
      id: s.id,
      title: s.title,
      workshopId: s.workshop_id,
      workshopTitle: wk?.title ?? "Workshop",
      team: team?.name ?? null,
      blockOrd: s.block_ord,
      objectCount: s.object_count,
      createdAt: s.created_at,
      manageable: admin || team?.lead_user_id === userId,
      data: (s.data ?? []) as unknown as CanvasObj[],
    };
  });

  return (
    <div>
      <h1 className="page-title">Canvas gallery</h1>
      <p className="page-sub">Saved canvases from every session — download one, or start a fresh session from it.</p>
      <CanvasGallery items={items} />
    </div>
  );
}
