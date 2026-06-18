import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { BuilderClient, type BlockRow } from "./BuilderClient";

export default async function BuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: workshop } = await supabase
    .from("workshop")
    .select("id, title, status, team_id, workspace_id, scheduled_at, objective")
    .eq("id", params.id)
    .maybeSingle();
  if (!workshop || workshop.workspace_id !== ctx.workspace.id) notFound();

  const { data: team } = await supabase
    .from("team")
    .select("name, lead_user_id")
    .eq("id", workshop.team_id)
    .maybeSingle();

  const { data: blocks } = await supabase
    .from("block")
    .select("id, ord, title, activity_type, duration, prompt, linked_dynamic, config, survey_id")
    .eq("workshop_id", workshop.id)
    .order("ord", { ascending: true });

  const rows: BlockRow[] = (blocks ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    activityType: b.activity_type,
    duration: b.duration,
    prompt: b.prompt,
    linkedDynamic: b.linked_dynamic,
    config: (b.config ?? {}) as BlockRow["config"],
  }));

  const canManage =
    isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  // Assessment binding: each survey step can pin a specific open assessment (or
  // send a new one) instead of the runtime newest-open-by-kind auto-match.
  type Cand = { id: string; name: string; dueAt: string | null; responded: number; total: number };
  type Panel = {
    blockId: string;
    stepTitle: string;
    kind: string;
    kindName: string;
    timing: string;
    bound: (Cand & { status: string }) | null;
    candidates: Cand[];
  };
  const assessments: Panel[] = [];
  const surveyBlocks = (blocks ?? []).filter((b) => b.activity_type === "survey");
  if (surveyBlocks.length && canManage) {
    const counts = async (sid: string) => {
      const { data: part } = await supabase.rpc("survey_participation", { p_survey: sid });
      const r = part ?? [];
      return { responded: r.filter((p) => p.completed).length, total: r.length };
    };
    // instrument display names for every kind in play
    const kinds = Array.from(new Set(surveyBlocks.map((b) => ((b.config ?? {}) as Record<string, unknown>).kind as string ?? "psych_safety_bang")));
    const { data: tpls } = await supabase
      .from("assessment_template")
      .select("key, name, workspace_id")
      .in("key", kinds)
      .order("workspace_id", { ascending: true, nullsFirst: false });
    const nameOfKind = (k: string) => (tpls ?? []).find((t) => t.key === k)?.name ?? k;
    // open candidates per kind (fetched once per distinct kind)
    const candsByKind: Record<string, Cand[]> = {};
    for (const k of kinds) {
      const { data: cands } = await supabase
        .from("survey")
        .select("id, name, due_at")
        .eq("team_id", workshop.team_id)
        .eq("kind", k)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      const list: Cand[] = [];
      for (const c of cands ?? []) list.push({ id: c.id, name: c.name, dueAt: c.due_at, ...(await counts(c.id)) });
      candsByKind[k] = list;
    }
    for (const b of surveyBlocks) {
      const cfg = (b.config ?? {}) as Record<string, unknown>;
      const kind = (cfg.kind as string) ?? "psych_safety_bang";
      let bound: (Cand & { status: string }) | null = null;
      if (b.survey_id) {
        const { data: bs } = await supabase
          .from("survey")
          .select("id, name, status, due_at")
          .eq("id", b.survey_id)
          .maybeSingle();
        if (bs) bound = { id: bs.id, name: bs.name, dueAt: bs.due_at, status: bs.status, ...(await counts(bs.id)) };
      }
      assessments.push({
        blockId: b.id,
        stepTitle: b.title,
        kind,
        kindName: nameOfKind(kind),
        timing: (cfg.timing as string) ?? "live",
        bound,
        candidates: candsByKind[kind] ?? [],
      });
    }
  }

  return (
    <div>
      <Link href="/workshops" className="linkbtn" style={{ fontSize: 12 }}>
        ‹ Workshops
      </Link>
      <BuilderClient
        workshop={{ id: workshop.id, title: workshop.title, scheduledAt: workshop.scheduled_at, objective: workshop.objective }}
        teamId={workshop.team_id}
        teamName={team?.name ?? ""}
        canManage={canManage}
        blocks={rows}
        assessments={assessments}
      />
    </div>
  );
}
