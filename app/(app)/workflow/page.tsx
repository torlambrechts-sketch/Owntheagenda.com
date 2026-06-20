import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { WorkflowClient, type ProgramView, type StepView } from "./WorkflowClient";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const [{ data: programs }, { data: teams }, { data: templates }] = await Promise.all([
    supabase
      .from("program")
      .select("id, title, status, current_ord, team_id, created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false }),
    supabase.from("team").select("id, name").eq("workspace_id", wsId).is("deleted_at", null).order("name"),
    supabase
      .from("template")
      .select("id, name, workspace_id")
      .or(`workspace_id.is.null,workspace_id.eq.${wsId}`)
      .order("name"),
  ]);

  const ids = (programs ?? []).map((p) => p.id);
  const { data: steps } = ids.length
    ? await supabase
        .from("program_step")
        .select("id, program_id, ord, kind, title, status, gate, scheduled_at, completed_at")
        .in("program_id", ids)
        .order("ord", { ascending: true })
    : { data: [] as { id: string; program_id: string; ord: number; kind: string; title: string; status: string; gate: string | null; scheduled_at: string | null; completed_at: string | null }[] };

  // Live state (pulse responses, workshop status, re-pulse date) per linked step.
  const live = new Map<string, { live: string | null; ready: boolean }>();
  await Promise.all(
    ids.map(async (pid) => {
      const { data } = await supabase.rpc("program_status", { p_program: pid });
      for (const r of data ?? []) live.set(r.step_id, { live: r.live, ready: r.ready });
    }),
  );

  const byProgram = new Map<string, StepView[]>();
  for (const s of steps ?? []) {
    const arr = byProgram.get(s.program_id) ?? [];
    const l = live.get(s.id);
    arr.push({
      id: s.id,
      ord: s.ord,
      kind: s.kind,
      title: s.title,
      status: s.status,
      gate: s.gate,
      scheduledAt: s.scheduled_at,
      completedAt: s.completed_at,
      live: l?.live ?? null,
      ready: l?.ready ?? false,
    });
    byProgram.set(s.program_id, arr);
  }

  const view: ProgramView[] = (programs ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    currentOrd: p.current_ord,
    teamId: p.team_id,
    steps: byProgram.get(p.id) ?? [],
  }));

  return (
    <WorkflowClient
      workspaceId={wsId}
      canManage={isAdmin(ctx.role)}
      programs={view}
      teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name }))}
      templates={(templates ?? []).map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
