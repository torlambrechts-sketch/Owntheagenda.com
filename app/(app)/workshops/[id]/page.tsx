import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { RECOMMENDED, DYNAMIC_LABEL, type DynamicReading } from "@/lib/grounding";
import type { Enums } from "@/types/database.types";
import { BuilderClient, type BlockRow, type BlockSuggestion } from "./BuilderClient";

// How each weak dynamic becomes a single, droppable agenda block. Kept here (not
// in the run engine) because it only seeds the builder; a facilitator edits after.
const SUGGEST_BLOCK: Record<string, { activity: Enums<"activity_type">; title: string; prompt: string; minutes: number }> = {
  psych_safety: { activity: "checkin", title: "Safety check-in", prompt: "How safe does it feel to speak up in this team right now?", minutes: 10 },
  trust: { activity: "discuss", title: "Trust audit", prompt: "Where do we genuinely rely on each other — and where do we quietly hedge?", minutes: 15 },
  conflict_norms: { activity: "retrospective", title: "How we disagree — Start / Stop / Continue", prompt: "What should we start, stop and continue in how we handle conflict?", minutes: 15 },
  role_clarity: { activity: "canvas", title: "Roles & ownership canvas", prompt: "Map who owns what, and where ownership is ambiguous.", minutes: 15 },
  decision_rights: { activity: "outcome", title: "Decision rights", prompt: "Turn the murkiest recurring calls into prioritised, owned decisions.", minutes: 12 },
};

export default async function BuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: workshop } = await supabase
    .from("workshop")
    .select("id, title, status, team_id, workspace_id, scheduled_at, objective, objectives")
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
    .select("id, ord, title, activity_type, duration, prompt, linked_dynamic, owner_name, config, survey_id")
    .eq("workshop_id", workshop.id)
    .order("ord", { ascending: true });

  const rows: BlockRow[] = (blocks ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    activityType: b.activity_type,
    duration: b.duration,
    prompt: b.prompt,
    linkedDynamic: b.linked_dynamic,
    ownerName: b.owner_name,
    config: (b.config ?? {}) as BlockRow["config"],
  }));

  const canManage =
    isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  // Grounded block suggestions: the team's below-band pulse dynamics, each mapped
  // to one targeted agenda block. Only computed for managers (who can add them).
  let suggestions: BlockSuggestion[] = [];
  if (canManage) {
    const { data: dyn } = await supabase.rpc("team_dynamics", { p_team: workshop.team_id });
    const readings = ((dyn ?? []) as DynamicReading[]).filter((r) => r.responses > 0 && r.pct != null);
    const below = readings.filter((r) => (r.pct as number) < r.target_low);
    const pool = (below.length ? below : readings)
      .slice()
      .sort((a, b) => (b.target_low - (b.pct ?? 0)) - (a.target_low - (a.pct ?? 0)))
      .slice(0, 3);
    suggestions = pool.flatMap((r): BlockSuggestion[] => {
      const tpl = SUGGEST_BLOCK[r.dynamic];
      if (!tpl) return [];
      const rec = RECOMMENDED[r.dynamic];
      return [{
        id: `sg-${r.dynamic}`,
        title: tpl.title,
        activityType: tpl.activity,
        duration: tpl.minutes,
        prompt: tpl.prompt,
        linkedDynamic: r.dynamic as Enums<"team_dynamic">,
        dynamicLabel: DYNAMIC_LABEL[r.dynamic] ?? r.label ?? r.dynamic,
        why: rec?.why ?? "address the team's lowest reading",
      }];
    });
  }

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Link href="/workshops" className="linkbtn" style={{ fontSize: 12 }}>
          ‹ Workshops
        </Link>
        <Link href={`/workshops/${workshop.id}/overview`} className="linkbtn" style={{ fontSize: 12 }}>
          Overview →
        </Link>
      </div>
      <BuilderClient
        workshop={{ id: workshop.id, title: workshop.title, scheduledAt: workshop.scheduled_at, objective: workshop.objective, objectives: workshop.objectives ?? [] }}
        teamId={workshop.team_id}
        teamName={team?.name ?? ""}
        canManage={canManage}
        blocks={rows}
        assessments={assessments}
        suggestions={suggestions}
      />
    </div>
  );
}
