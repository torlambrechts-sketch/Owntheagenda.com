"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { wbTemplate } from "./templates";

// ---------------------------------------------------------------------------
// Whiteboard server actions. The `whiteboard` + `whiteboard_object` tables are
// already migrated with member-write RLS and a BEFORE INSERT trigger that
// stamps workspace_id + author. Object CRUD itself happens client-side under
// RLS (mirroring CanvasBoard.tsx); these actions own board lifecycle +
// template materialisation, where resolving connector temp-ids server-side is
// cleaner.
// ---------------------------------------------------------------------------

// Create a board (optionally from a template), seed its objects, then redirect
// straight into the editor.
export async function createWhiteboard(
  teamId: string | null,
  templateKey?: string,
): Promise<void> {
  const ctx = await requireSession();
  const supabase = createClient();
  const tpl = templateKey ? wbTemplate(templateKey) : undefined;

  const { data: board, error } = await supabase
    .from("whiteboard")
    .insert({
      workspace_id: ctx.workspace.id,
      team_id: teamId,
      title: tpl ? tpl.title : "Untitled whiteboard",
      template_key: tpl ? tpl.id : null,
      accent: tpl?.accent ?? "green",
      icon: tpl?.icon ?? "square",
      is_template: false,
      description: tpl?.desc ?? null,
      created_by: ctx.userId,
    } as never)
    .select("id")
    .single();
  if (error || !board) throw new Error(error?.message ?? "Could not create whiteboard");
  const boardId = (board as { id: string }).id;

  if (tpl && tpl.els.length) {
    await seedObjects(supabase, ctx.workspace.id, boardId, tpl.els);
  }

  revalidatePath("/workshops/whiteboards");
  redirect(`/workshops/whiteboards/${boardId}`);
}

// Insert template seed elements: non-connectors first (so we can map their temp
// ids to real ids), then connectors with resolved src_id / dst_id.
async function seedObjects(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  boardId: string,
  els: import("./templates").WBSeed[],
) {
  const nodes = els.filter((e) => e.kind !== "connector");
  const conns = els.filter((e) => e.kind === "connector");
  const idMap = new Map<string, string>();

  for (const el of nodes) {
    const { data } = await supabase
      .from("whiteboard_object")
      .insert({
        whiteboard_id: boardId,
        workspace_id: workspaceId,
        kind: el.kind,
        text: el.text ?? "",
        fill: el.fill ?? null,
        stroke: el.stroke ?? null,
        color: el.color ?? null,
        x: el.x ?? 0,
        y: el.y ?? 0,
        w: el.w ?? null,
        h: el.h ?? null,
        font_size: el.fontSize ?? null,
      } as never)
      .select("id")
      .single();
    if (data) idMap.set(el.id, (data as { id: string }).id);
  }

  for (const el of conns) {
    const src = el.from ? idMap.get(el.from) : null;
    const dst = el.to ? idMap.get(el.to) : null;
    if (!src || !dst) continue;
    await supabase.from("whiteboard_object").insert({
      whiteboard_id: boardId,
      workspace_id: workspaceId,
      kind: "connector",
      text: "",
      color: el.color ?? "#737373",
      x: 0,
      y: 0,
      src_id: src,
      dst_id: dst,
      line_style: el.lineStyle ?? "curved",
    } as never);
  }
}

export async function renameWhiteboard(id: string, title: string): Promise<{ error?: string }> {
  await requireSession();
  const supabase = createClient();
  const clean = title.trim() || "Untitled whiteboard";
  const { error } = await supabase.from("whiteboard").update({ title: clean } as never).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/workshops/whiteboards");
  return {};
}

export async function deleteWhiteboard(id: string): Promise<{ error?: string }> {
  await requireSession();
  const supabase = createClient();
  // objects cascade via FK; delete the board row.
  const { error } = await supabase.from("whiteboard").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/workshops/whiteboards");
  return {};
}

// Clone an existing board (and all its objects) as a reusable template row
// (is_template = true). Connectors are re-resolved against the cloned objects.
export async function saveBoardAsTemplate(id: string): Promise<{ id?: string; error?: string }> {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: src } = await supabase
    .from("whiteboard")
    .select("title, accent, icon, description, template_key")
    .eq("id", id)
    .maybeSingle();
  if (!src) return { error: "Whiteboard not found." };
  const s = src as { title: string; accent: string; icon: string; description: string | null; template_key: string | null };

  const { data: clone, error: cErr } = await supabase
    .from("whiteboard")
    .insert({
      workspace_id: ctx.workspace.id,
      team_id: null,
      title: `${s.title} (template)`,
      template_key: s.template_key,
      accent: s.accent,
      icon: s.icon,
      is_template: true,
      description: s.description,
      created_by: ctx.userId,
    } as never)
    .select("id")
    .single();
  if (cErr || !clone) return { error: cErr?.message ?? "Could not save template." };
  const templateId = (clone as { id: string }).id;

  const { data: objs } = await supabase
    .from("whiteboard_object")
    .select("*")
    .eq("whiteboard_id", id);
  const rows = (objs ?? []) as Record<string, unknown>[];
  const nodes = rows.filter((o) => o.kind !== "connector");
  const conns = rows.filter((o) => o.kind === "connector");
  const idMap = new Map<string, string>();

  for (const o of nodes) {
    const { data } = await supabase
      .from("whiteboard_object")
      .insert({
        whiteboard_id: templateId,
        workspace_id: ctx.workspace.id,
        kind: o.kind, text: o.text ?? "", fill: o.fill ?? null, stroke: o.stroke ?? null,
        color: o.color ?? null, x: o.x, y: o.y, w: o.w ?? null, h: o.h ?? null,
        font_size: o.font_size ?? null, points: o.points ?? null, width: o.width ?? null,
        opacity: o.opacity ?? null, variant: o.variant ?? null, line_style: o.line_style ?? null,
        z: o.z ?? 0,
      } as never)
      .select("id")
      .single();
    if (data) idMap.set(o.id as string, (data as { id: string }).id);
  }
  for (const o of conns) {
    const src2 = o.src_id ? idMap.get(o.src_id as string) : null;
    const dst2 = o.dst_id ? idMap.get(o.dst_id as string) : null;
    if (!src2 || !dst2) continue;
    await supabase.from("whiteboard_object").insert({
      whiteboard_id: templateId, workspace_id: ctx.workspace.id, kind: "connector",
      text: "", color: o.color ?? "#737373", x: 0, y: 0, src_id: src2, dst_id: dst2,
      line_style: o.line_style ?? "curved",
    } as never);
  }

  revalidatePath("/workshops/whiteboards");
  return { id: templateId };
}
