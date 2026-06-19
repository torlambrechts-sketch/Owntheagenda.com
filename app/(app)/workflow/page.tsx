import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { WorkflowClient, type ProgramView, type StepView } from "./WorkflowClient";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const { data: programs } = await supabase
    .from("program")
    .select("id, title, status, current_ord, created_at")
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false });

  const ids = (programs ?? []).map((p) => p.id);
  const { data: steps } = ids.length
    ? await supabase
        .from("program_step")
        .select("id, program_id, ord, kind, title, status, gate, scheduled_at, completed_at")
        .in("program_id", ids)
        .order("ord", { ascending: true })
    : { data: [] as { id: string; program_id: string; ord: number; kind: string; title: string; status: string; gate: string | null; scheduled_at: string | null; completed_at: string | null }[] };

  const byProgram = new Map<string, StepView[]>();
  for (const s of steps ?? []) {
    const arr = byProgram.get(s.program_id) ?? [];
    arr.push({
      id: s.id,
      ord: s.ord,
      kind: s.kind,
      title: s.title,
      status: s.status,
      gate: s.gate,
      scheduledAt: s.scheduled_at,
      completedAt: s.completed_at,
    });
    byProgram.set(s.program_id, arr);
  }

  const view: ProgramView[] = (programs ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    currentOrd: p.current_ord,
    steps: byProgram.get(p.id) ?? [],
  }));

  return (
    <WorkflowClient workspaceId={wsId} canManage={isAdmin(ctx.role)} programs={view} />
  );
}
