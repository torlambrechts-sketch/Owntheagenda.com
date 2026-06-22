import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { FlowBuilderShell, type BuilderStep } from "./FlowBuilderShell";

// Full-screen visual Flow Builder (outside the app shell, like /builder and the
// run surface). Renders the imported "Assessment & workshop flow builder"
// design: editable title + chrome, a Canvas / Table / Outline / Timeline view
// switcher, a node palette, and a right-hand inspector. Admin-only — the
// underlying RLS policies enforce it too.
export default async function FlowBuilderPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect(`/workflow/${params.id}`);
  const supabase = createClient();

  const { data: program } = await supabase
    .from("program")
    .select("id, title, status, team_id, workspace_id, kind, min_responses")
    .eq("id", params.id)
    .maybeSingle();
  if (!program || program.workspace_id !== ctx.workspace.id) notFound();

  const { data: team } = program.team_id
    ? await supabase.from("team").select("name").eq("id", program.team_id).maybeSingle()
    : { data: null as { name: string } | null };

  const { data: steps } = await supabase
    .from("program_step")
    .select("id, ord, kind, title, status, gate, config")
    .eq("program_id", program.id)
    .order("ord", { ascending: true });
  const stepRows = steps ?? [];

  // Workshop templates referenced by branch routing (resolve names).
  const { data: allTpls } = await supabase
    .from("template")
    .select("id, name")
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspace.id}`)
    .order("name");
  const templates = (allTpls ?? []).map((t) => ({ id: t.id as string, name: t.name as string }));
  const tplName = new Map(templates.map((t) => [t.id, t.name]));

  const builderSteps: BuilderStep[] = stepRows.map((s) => {
    const c = (s.config ?? {}) as Record<string, unknown>;
    const pos = (c.pos as { x?: number; y?: number } | undefined) ?? undefined;
    return {
      id: s.id as string,
      ord: s.ord as number,
      kind: s.kind as string,
      title: s.title as string,
      status: s.status as string,
      gate: (s.gate as string | null) ?? null,
      config: c,
      pos: pos && typeof pos.x === "number" && typeof pos.y === "number" ? { x: pos.x, y: pos.y } : null,
      branch: s.kind === "branch" ? {
        dynamic: (c.dynamic as string) ?? null,
        op: (c.op as string) ?? null,
        value: typeof c.value === "number" ? c.value : c.value ? Number(c.value) : null,
        thenTemplate: typeof c.then_template === "string" ? (c.then_template as string) : null,
        elseTemplate: typeof c.else_template === "string" ? (c.else_template as string) : null,
        thenName: typeof c.then_template === "string" ? tplName.get(c.then_template as string) ?? "a workshop" : null,
        elseName: typeof c.else_template === "string" ? tplName.get(c.else_template as string) ?? "a workshop" : null,
      } : null,
    };
  });

  return (
    <FlowBuilderShell
      programId={program.id as string}
      title={program.title as string}
      status={program.status as string}
      teamName={team?.name ?? null}
      templates={templates}
      steps={builderSteps}
    />
  );
}
