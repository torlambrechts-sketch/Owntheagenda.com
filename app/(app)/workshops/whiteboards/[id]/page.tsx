import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/util";
import { mapRow, type WBObject } from "../wb";
import { BoardEditor } from "./BoardEditor";

export default async function WhiteboardEditorPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: board } = await supabase
    .from("whiteboard")
    .select("id, workspace_id, title, accent, icon, updated_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!board || (board as { workspace_id: string }).workspace_id !== ctx.workspace.id) notFound();
  const b = board as { id: string; title: string; accent: string; icon: string; updated_at: string };

  const { data: objs } = await supabase
    .from("whiteboard_object")
    .select("*")
    .eq("whiteboard_id", b.id);
  const objects: WBObject[] = ((objs ?? []) as Record<string, unknown>[]).map(mapRow);

  const userName =
    ctx.profile?.full_name || ctx.profile?.display_name || ctx.email || "You";

  return (
    <BoardEditor
      boardId={b.id}
      workspaceId={ctx.workspace.id}
      initialTitle={b.title}
      accent={b.accent}
      editedLabel={timeAgo(b.updated_at)}
      userId={ctx.userId}
      userName={userName}
      initialObjects={objects}
    />
  );
}
