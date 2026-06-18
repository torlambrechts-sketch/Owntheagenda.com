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
    .select("id, title, status, team_id, workspace_id, scheduled_at, objective, survey_id")
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
    .select("id, ord, title, activity_type, duration, prompt, linked_dynamic, config")
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

  // Assessment binding panel: if the agenda has a survey step, let the lead pin
  // a specific open assessment (or send a new one) instead of the runtime
  // newest-open-by-kind auto-match.
  type Cand = { id: string; name: string; dueAt: string | null; responded: number; total: number };
  let assessment:
    | { kind: string; kindName: string; timing: string; bound: (Cand & { status: string }) | null; candidates: Cand[] }
    | null = null;
  const surveyBlock = (blocks ?? []).find((b) => b.activity_type === "survey");
  if (surveyBlock && canManage) {
    const cfg = (surveyBlock.config ?? {}) as Record<string, unknown>;
    const kind = (cfg.kind as string) ?? "psych_safety_bang";
    const timing = (cfg.timing as string) ?? "live";
    const { data: tpl } = await supabase
      .from("assessment_template")
      .select("name")
      .eq("key", kind)
      .order("workspace_id", { ascending: true, nullsFirst: false });
    const kindName = (tpl ?? [])[0]?.name ?? kind;

    const counts = async (sid: string) => {
      const { data: part } = await supabase.rpc("survey_participation", { p_survey: sid });
      const rows = part ?? [];
      return { responded: rows.filter((p) => p.completed).length, total: rows.length };
    };

    const { data: cands } = await supabase
      .from("survey")
      .select("id, name, due_at")
      .eq("team_id", workshop.team_id)
      .eq("kind", kind)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    const candidates: Cand[] = [];
    for (const c of cands ?? []) {
      candidates.push({ id: c.id, name: c.name, dueAt: c.due_at, ...(await counts(c.id)) });
    }

    let bound: (Cand & { status: string }) | null = null;
    if (workshop.survey_id) {
      const { data: bs } = await supabase
        .from("survey")
        .select("id, name, status, due_at")
        .eq("id", workshop.survey_id)
        .maybeSingle();
      if (bs) bound = { id: bs.id, name: bs.name, dueAt: bs.due_at, status: bs.status, ...(await counts(bs.id)) };
    }
    assessment = { kind, kindName, timing, bound, candidates };
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
        assessment={assessment}
      />
    </div>
  );
}
