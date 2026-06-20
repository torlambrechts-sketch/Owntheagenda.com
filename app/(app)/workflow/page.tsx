import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { WorkflowClient, type ProgramView, type StepView } from "./WorkflowClient";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const [{ data: programs }, { data: teams }, { data: templates }, { data: instruments }] = await Promise.all([
    supabase
      .from("program")
      .select("id, title, status, current_ord, team_id, kind, min_responses, play_key, assessment_kind, created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false }),
    supabase.from("team").select("id, name").eq("workspace_id", wsId).is("deleted_at", null).order("name"),
    supabase
      .from("template")
      .select("id, name, key, category, workspace_id")
      .or(`workspace_id.is.null,workspace_id.eq.${wsId}`)
      .order("name"),
    supabase
      .from("assessment_template")
      .select("key, name, scope, workspace_id")
      .eq("scope", "team")
      .or(`workspace_id.is.null,workspace_id.eq.${wsId}`)
      .order("name"),
  ]);

  const ids = (programs ?? []).map((p) => p.id);
  const [{ data: steps }, { data: tasks }] = ids.length
    ? await Promise.all([
        supabase
          .from("program_step")
          .select("id, program_id, ord, kind, title, status, gate, config, scheduled_at, completed_at")
          .in("program_id", ids)
          .order("ord", { ascending: true }),
        supabase
          .from("program_task")
          .select("id, program_id, kind, title, owner_name, due_at, status")
          .in("program_id", ids)
          .order("due_at", { ascending: true }),
      ])
    : [
        { data: [] as { id: string; program_id: string; ord: number; kind: string; title: string; status: string; gate: string | null; config: unknown; scheduled_at: string | null; completed_at: string | null }[] },
        { data: [] as { id: string; program_id: string; kind: string; title: string; owner_name: string | null; due_at: string | null; status: string }[] },
      ];

  const tasksByProgram = new Map<string, { id: string; kind: string; title: string; ownerName: string | null; dueAt: string | null; status: string }[]>();
  for (const t of tasks ?? []) {
    const arr = tasksByProgram.get(t.program_id) ?? [];
    arr.push({ id: t.id, kind: t.kind, title: t.title, ownerName: t.owner_name, dueAt: t.due_at, status: t.status });
    tasksByProgram.set(t.program_id, arr);
  }

  // Live state (pulse responses, workshop status, re-pulse date) per linked step.
  const live = new Map<string, { live: string | null; ready: boolean; done: number | null; target: number | null }>();
  await Promise.all(
    ids.map(async (pid) => {
      const { data } = await supabase.rpc("program_status", { p_program: pid });
      for (const r of data ?? [])
        live.set(r.step_id, { live: r.live, ready: r.ready, done: r.done, target: r.target });
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
      config: (s.config ?? {}) as Record<string, unknown>,
      scheduledAt: s.scheduled_at,
      completedAt: s.completed_at,
      live: l?.live ?? null,
      ready: l?.ready ?? false,
      done: l?.done ?? null,
      target: l?.target ?? null,
    });
    byProgram.set(s.program_id, arr);
  }

  const view: ProgramView[] = (programs ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    currentOrd: p.current_ord,
    teamId: p.team_id,
    kind: p.kind,
    playKey: p.play_key,
    minResponses: p.min_responses,
    assessmentKind: p.assessment_kind,
    steps: byProgram.get(p.id) ?? [],
    tasks: tasksByProgram.get(p.id) ?? [],
  }));

  return (
    <WorkflowClient
      workspaceId={wsId}
      canManage={isAdmin(ctx.role)}
      programs={view}
      teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name }))}
      templates={(templates ?? []).map((t) => ({ id: t.id, name: t.name, key: t.key, category: t.category }))}
      assessments={(instruments ?? []).map((a) => ({ key: a.key as string, name: a.name as string }))}
    />
  );
}
