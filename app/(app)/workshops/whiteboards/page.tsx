import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/util";
import { WB_TEMPLATES } from "./templates";
import { mapRow, type WBObject } from "./wb";
import { WhiteboardsClient, type BoardCard, type TemplateCard } from "./WhiteboardsClient";

// WHITEBOARDS gallery. Lists this workspace's boards (is_template=false) newest
// first, plus the built-in WB_TEMPLATES and any workspace template rows
// (is_template=true). Each card carries a small set of objects for the mini SVG
// preview rendered client-side.
export default async function WhiteboardsPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  // First team (matches workshops surface) — used as default team for new boards.
  const { data: teams } = await supabase
    .from("team")
    .select("id, name")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamId = teams?.[0]?.id ?? null;

  const { data: boards } = await supabase
    .from("whiteboard")
    .select("id, title, accent, icon, is_template, description, template_key, created_by, updated_at")
    .eq("workspace_id", wsId)
    .order("updated_at", { ascending: false });
  const rows = (boards ?? []) as {
    id: string; title: string; accent: string; icon: string; is_template: boolean;
    description: string | null; template_key: string | null; created_by: string | null; updated_at: string;
  }[];

  const boardRows = rows.filter((b) => !b.is_template);
  const tplRows = rows.filter((b) => b.is_template);
  const allIds = rows.map((b) => b.id);

  // Real "uses" per template = boards created from it (whiteboard.template_key).
  const usesByTemplate = new Map<string, number>();
  for (const b of boardRows) if (b.template_key) usesByTemplate.set(b.template_key, (usesByTemplate.get(b.template_key) ?? 0) + 1);

  // Objects for every board (preview) + collaborators per board.
  const objByBoard = new Map<string, WBObject[]>();
  const authorsByBoard = new Map<string, Set<string>>();
  if (allIds.length) {
    const { data: objs } = await supabase
      .from("whiteboard_object")
      .select("*")
      .in("whiteboard_id", allIds);
    for (const o of (objs ?? []) as Record<string, unknown>[]) {
      const bid = o.whiteboard_id as string;
      if (!objByBoard.has(bid)) objByBoard.set(bid, []);
      objByBoard.get(bid)!.push(mapRow(o));
      if (o.author_id) {
        if (!authorsByBoard.has(bid)) authorsByBoard.set(bid, new Set());
        authorsByBoard.get(bid)!.add(o.author_id as string);
      }
    }
  }

  // Resolve creator + collaborator display names.
  const personIds = new Set<string>();
  for (const b of rows) if (b.created_by) personIds.add(b.created_by);
  for (const set of authorsByBoard.values()) for (const id of set) personIds.add(id);
  const { data: profs } = personIds.size
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", Array.from(personIds))
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Member"]));

  const boardCards: BoardCard[] = boardRows.map((b) => {
    const collabIds = new Set(authorsByBoard.get(b.id) ?? []);
    if (b.created_by) collabIds.add(b.created_by);
    return {
      id: b.id,
      title: b.title,
      accent: b.accent,
      editedLabel: timeAgo(b.updated_at),
      updatedAt: b.updated_at,
      ownerId: b.created_by,
      ownerName: b.created_by ? nameById.get(b.created_by) ?? null : null,
      objects: objByBoard.get(b.id) ?? [],
      collaborators: Array.from(collabIds).map((id) => nameById.get(id) ?? "Member").slice(0, 5),
    };
  });

  // Built-in templates render their seed elements as preview objects.
  const builtinCards: TemplateCard[] = WB_TEMPLATES.map((t) => ({
    key: t.id,
    title: t.title,
    desc: t.desc,
    accent: t.accent,
    uses: usesByTemplate.get(t.id) ?? 0,
    objects: t.els
      .filter((e) => e.kind !== "connector")
      .map((e, i) => ({
        id: `seed-${i}`, kind: e.kind, text: e.text ?? "", fill: e.fill ?? null, stroke: e.stroke ?? null,
        color: e.color ?? null, x: e.x ?? 0, y: e.y ?? 0, w: e.w ?? null, h: e.h ?? null,
        fontSize: e.fontSize ?? null, points: null, width: null, opacity: null, variant: null,
        srcId: null, dstId: null, lineStyle: null, z: 0, comments: [], reactions: {}, authorId: null, authorName: null,
      })) as WBObject[],
  }));
  const dbTemplateCards: TemplateCard[] = tplRows.map((t) => ({
    key: t.id,
    title: t.title,
    desc: t.description ?? "Saved template.",
    accent: t.accent,
    fromBoardId: t.id,
    uses: usesByTemplate.get(t.id) ?? 0,
    objects: objByBoard.get(t.id) ?? [],
  }));

  const ownerOptions = Array.from(
    new Map(boardCards.filter((b) => b.ownerId).map((b) => [b.ownerId!, b.ownerName ?? "Member"])).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <WhiteboardsClient
      teamId={teamId}
      boards={boardCards}
      templates={[...builtinCards, ...dbTemplateCards]}
      ownerOptions={ownerOptions}
      currentUserId={ctx.userId}
    />
  );
}
