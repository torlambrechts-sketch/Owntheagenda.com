import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { FlowViews, type FlowStep } from "./FlowViews";

// Read-only flow detail with multiple representations (Outline / Timeline /
// Table / Map) + a plain-language Preview run — the imported Flow Builder
// design, adapted. Editing stays in the composer on /workflow.
export default async function FlowDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: program } = await supabase
    .from("program")
    .select("id, title, status, team_id, workspace_id, kind, min_responses, assessment_kind, due_at")
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

  // Resolve workshop-template names referenced by branch routing.
  const tplIds = new Set<string>();
  for (const s of stepRows) {
    const c = (s.config ?? {}) as Record<string, unknown>;
    for (const k of ["then_template", "else_template"] as const) {
      if (typeof c[k] === "string") tplIds.add(c[k] as string);
    }
  }
  const { data: tpls } = tplIds.size
    ? await supabase.from("template").select("id, name").in("id", Array.from(tplIds))
    : { data: [] as { id: string; name: string }[] };
  const tplName = new Map((tpls ?? []).map((t) => [t.id, t.name as string]));

  const flowSteps: FlowStep[] = stepRows.map((s) => {
    const c = (s.config ?? {}) as Record<string, unknown>;
    return {
      id: s.id as string,
      ord: s.ord as number,
      kind: s.kind as string,
      title: s.title as string,
      status: s.status as string,
      gate: (s.gate as string | null) ?? null,
      config: c,
      branch: s.kind === "branch" ? {
        dynamic: (c.dynamic as string) ?? null,
        op: (c.op as string) ?? null,
        value: typeof c.value === "number" ? c.value : c.value ? Number(c.value) : null,
        thenName: typeof c.then_template === "string" ? tplName.get(c.then_template as string) ?? "a workshop" : null,
        elseName: typeof c.else_template === "string" ? tplName.get(c.else_template as string) ?? "a workshop" : null,
      } : null,
    };
  });

  // All available workshop templates, for branch routing selects on the canvas.
  const { data: allTpls } = await supabase
    .from("template")
    .select("id, name")
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspace.id}`)
    .order("name");

  return (
    <div>
      <Link href="/workflow" className="linkbtn" style={{ fontSize: 12 }}>‹ Flows</Link>
      <FlowViews
        title={program.title as string}
        status={program.status as string}
        teamName={team?.name ?? null}
        programId={program.id as string}
        canEdit={isAdmin(ctx.role)}
        templates={(allTpls ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))}
        steps={flowSteps}
      />
    </div>
  );
}
