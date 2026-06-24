import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, timeAgo } from "@/lib/util";
import { weakestDynamic, RECOMMENDED } from "@/lib/grounding";
import { WorkshopsClient, type TemplateCard, type WorkshopRow, type Recommendation } from "./WorkshopsClient";
import { type SessionRow } from "./SessionsTable";
import { type GalleryItem } from "./CanvasGallery";
import type { CanvasObj } from "@/components/CanvasStatic";

const TABS = ["workshops", "sessions", "canvas"] as const;
type Tab = (typeof TABS)[number];

export default async function WorkshopsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;
  const initialTab: Tab = TABS.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : "workshops";

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const team = teams?.[0] ?? null;
  // All teams the user can target when creating a workshop (New-workshop modal).
  const teamOptions = (teams ?? []).map((t) => ({ id: t.id, name: t.name }));

  const { data: templates } = await supabase
    .from("template")
    .select("id, key, name, category, source, description, default_duration, definition")
    .order("category", { ascending: true });

  const tplCards: TemplateCard[] = (templates ?? []).map((t) => {
    const phases = (((t.definition as any)?.phases ?? []) as any[]) || [];
    const minutes = phases.reduce((s, p) => s + (p?.minutes ?? 0), 0);
    return {
      id: t.id,
      key: t.key,
      name: t.name,
      category: t.category,
      source: t.source,
      description: t.description,
      steps: phases.length,
      minutes: minutes || t.default_duration,
      types: phases.map((p) => p?.type ?? "canvas"),
      phases: phases.map((p) => ({
        title: (p?.title ?? "Step") as string,
        type: (p?.type ?? "canvas") as string,
        minutes: (p?.minutes ?? 0) as number,
        prompt: (p?.prompt ?? null) as string | null,
      })),
    };
  });

  let workshops: WorkshopRow[] = [];
  if (team) {
    const { data: ws } = await supabase
      .from("workshop")
      .select("id, title, status, updated_at, scheduled_at, created_by, template_id")
      .eq("team_id", team.id)
      .order("updated_at", { ascending: false });
    const rows = ws ?? [];
    const creatorIds = Array.from(new Set(rows.map((w) => w.created_by).filter(Boolean))) as string[];
    const { data: profs } = creatorIds.length
      ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", creatorIds)
      : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Member"]));
    const catById = new Map(tplCards.map((t) => [t.id, t.category]));
    const tplNameById = new Map(tplCards.map((t) => [t.id, t.name]));

    // Per-workshop outcome rollup (participants / actions / decisions) from the
    // sessions these workshops have run — drives the rich rows + board cards.
    const wkIds = rows.map((w) => w.id);
    const part = new Map<string, number>();
    const acts = new Map<string, number>();
    const decs = new Map<string, number>();
    if (wkIds.length) {
      const { data: sess } = await supabase
        .from("session")
        .select("id, workshop_id")
        .in("workshop_id", wkIds);
      const sessList = sess ?? [];
      const wkBySession = new Map(sessList.map((s) => [s.id, s.workshop_id]));
      const sIds = sessList.map((s) => s.id);
      if (sIds.length) {
        const [{ data: pr }, { data: ai }, { data: dc }] = await Promise.all([
          supabase.from("participant").select("session_id").in("session_id", sIds),
          supabase.from("action_item").select("session_id").in("session_id", sIds),
          supabase.from("decision").select("session_id").in("session_id", sIds),
        ]);
        // participants: peak attendance across a workshop's sessions
        const perSession = new Map<string, number>();
        for (const p of pr ?? []) perSession.set(p.session_id, (perSession.get(p.session_id) ?? 0) + 1);
        for (const [sid, n] of perSession) {
          const wid = wkBySession.get(sid);
          if (wid) part.set(wid, Math.max(part.get(wid) ?? 0, n));
        }
        for (const a of ai ?? []) {
          const wid = a.session_id ? wkBySession.get(a.session_id) : null;
          if (wid) acts.set(wid, (acts.get(wid) ?? 0) + 1);
        }
        for (const d of dc ?? []) {
          const wid = d.session_id ? wkBySession.get(d.session_id) : null;
          if (wid) decs.set(wid, (decs.get(wid) ?? 0) + 1);
        }
      }
    }

    workshops = rows.map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
      editedLabel: timeAgo(w.updated_at),
      scheduledAt: w.scheduled_at,
      creatorName: w.created_by ? nameById.get(w.created_by) ?? null : null,
      category: w.template_id ? catById.get(w.template_id) ?? null : null,
      templateName: w.template_id ? tplNameById.get(w.template_id) ?? null : null,
      participants: part.get(w.id) ?? 0,
      actions: acts.get(w.id) ?? 0,
      decisions: decs.get(w.id) ?? 0,
    }));
  }

  // Grounded recommendation: steer the weakest pulse dynamic to a framework.
  let recommendation: Recommendation | null = null;
  if (team) {
    const { data: dyn } = await supabase.rpc("team_dynamics", { p_team: team.id });
    const weak = weakestDynamic((dyn ?? []) as any[]);
    const rec = weak ? RECOMMENDED[weak.dynamic] : null;
    const card = rec ? tplCards.find((c) => c.key === rec.key) : null;
    if (weak && rec && card) {
      const { data: lp } = await supabase
        .from("pulse")
        .select("id")
        .eq("team_id", team.id)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Contextual deep-link: the science article for this dynamic, if published.
      const { data: sci } = await supabase
        .from("help_article")
        .select("slug")
        .eq("topic_key", `dynamic:${weak.dynamic}`)
        .eq("status", "published")
        .maybeSingle();
      recommendation = {
        templateId: card.id,
        templateName: card.name,
        dynamicLabel: weak.label,
        why: rec.why,
        pct: weak.pct,
        targetLow: weak.target_low,
        belowBand: weak.in_band === false && (weak.pct ?? 0) < weak.target_low,
        pulseId: lp?.id ?? null,
        scienceSlug: sci?.slug ?? null,
      };
    }
  }

  const canManage =
    isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  // team-scoped assessment instruments — offered as a starting/added module
  const { data: instRows } = canManage
    ? await supabase.from("assessment_template").select("key, name").eq("scope", "team").order("name")
    : { data: [] as { key: string; name: string }[] };
  const surveyInsts = (instRows ?? []).map((t) => ({ kind: t.key, name: t.name }));

  // Science deep-links per workshop category (topic_key = workshop:<category>).
  const { data: sciArticles } = await supabase
    .from("help_article")
    .select("slug, topic_key")
    .like("topic_key", "workshop:%")
    .eq("status", "published");
  const scienceByCategory: Record<string, string> = {};
  for (const a of sciArticles ?? []) {
    const tk = a.topic_key as string | null;
    if (tk) scienceByCategory[tk.slice("workshop:".length)] = a.slug;
  }

  // ----- Sessions tab (workspace-wide live-run history) -----
  const { data: sessionRows } = await supabase
    .from("session")
    .select("id, workshop_id, status, started_at, ended_at")
    .eq("workspace_id", wsId)
    .order("started_at", { ascending: false })
    .limit(100);
  const sList = sessionRows ?? [];
  const sWkIds = Array.from(new Set(sList.map((s) => s.workshop_id)));
  const { data: sWks } = sWkIds.length
    ? await supabase.from("workshop").select("id, title, team_id").in("id", sWkIds)
    : { data: [] as { id: string; title: string; team_id: string }[] };
  const sWkById = new Map((sWks ?? []).map((w) => [w.id, w]));
  const sTeamIds = Array.from(new Set((sWks ?? []).map((w) => w.team_id)));
  const { data: sTeams } = sTeamIds.length
    ? await supabase.from("team").select("id, name").in("id", sTeamIds)
    : { data: [] as { id: string; name: string }[] };
  const sTeamById = new Map((sTeams ?? []).map((t) => [t.id, t.name]));
  const sids = sList.map((s) => s.id);
  const { data: parts } = sids.length
    ? await supabase.from("participant").select("session_id").in("session_id", sids)
    : { data: [] as { session_id: string }[] };
  const partCount = new Map<string, number>();
  for (const p of parts ?? []) partCount.set(p.session_id, (partCount.get(p.session_id) ?? 0) + 1);
  const { data: acts } = sids.length
    ? await supabase.from("action_item").select("session_id").in("session_id", sids)
    : { data: [] as { session_id: string | null }[] };
  const actCount = new Map<string, number>();
  for (const a of acts ?? []) if (a.session_id) actCount.set(a.session_id, (actCount.get(a.session_id) ?? 0) + 1);
  const { data: fus } = sids.length
    ? await supabase.from("follow_up").select("source_session_id, kind, scheduled_at, status").in("source_session_id", sids).neq("status", "skipped").order("scheduled_at", { ascending: true })
    : { data: [] as { source_session_id: string | null; kind: string; scheduled_at: string | null; status: string }[] };
  const nextBySession = new Map<string, { kind: string; at: string | null; status: string }>();
  for (const f of fus ?? []) {
    if (!f.source_session_id) continue;
    const cur = nextBySession.get(f.source_session_id);
    if (!cur) nextBySession.set(f.source_session_id, { kind: f.kind, at: f.scheduled_at, status: f.status });
    else if (cur.status !== "planned" && f.status === "planned") nextBySession.set(f.source_session_id, { kind: f.kind, at: f.scheduled_at, status: f.status });
  }
  const sessions: SessionRow[] = sList.map((s) => {
    const wk = sWkById.get(s.workshop_id);
    return {
      id: s.id,
      workshopId: s.workshop_id,
      title: wk?.title ?? "Workshop",
      team: wk ? sTeamById.get(wk.team_id) ?? null : null,
      startedAt: s.started_at,
      people: partCount.get(s.id) ?? 0,
      actions: actCount.get(s.id) ?? 0,
      status: s.status,
      nextStep: nextBySession.get(s.id) ?? null,
    };
  });

  // ----- Canvas tab (workspace-wide saved canvases) -----
  const { data: snaps } = await supabase
    .from("canvas_snapshot")
    .select("id, title, workshop_id, block_ord, object_count, created_at, data")
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false })
    .limit(200);
  const cList = snaps ?? [];
  const cWkIds = Array.from(new Set(cList.map((s) => s.workshop_id)));
  const { data: cWks } = cWkIds.length
    ? await supabase.from("workshop").select("id, title, team_id").in("id", cWkIds)
    : { data: [] as { id: string; title: string; team_id: string }[] };
  const cWkById = new Map((cWks ?? []).map((w) => [w.id, w]));
  const cTeamIds = Array.from(new Set((cWks ?? []).map((w) => w.team_id)));
  const { data: cTeams } = cTeamIds.length
    ? await supabase.from("team").select("id, name, lead_user_id").in("id", cTeamIds)
    : { data: [] as { id: string; name: string; lead_user_id: string | null }[] };
  const cTeamById = new Map((cTeams ?? []).map((t) => [t.id, t]));
  const admin = isAdmin(ctx.role);
  const canvasItems: GalleryItem[] = cList.map((s) => {
    const wk = cWkById.get(s.workshop_id);
    const tm = wk ? cTeamById.get(wk.team_id) : null;
    return {
      id: s.id,
      title: s.title,
      workshopId: s.workshop_id,
      workshopTitle: wk?.title ?? "Workshop",
      team: tm?.name ?? null,
      blockOrd: s.block_ord,
      objectCount: s.object_count,
      createdAt: s.created_at,
      manageable: admin || tm?.lead_user_id === ctx.userId,
      data: (s.data ?? []) as unknown as CanvasObj[],
    };
  });

  // ----- KPI summary row (Workshop App handoff) — all derived from real data -----
  const now = new Date();
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const liveScheduled = workshops.filter((w) => w.status === "live" || w.status === "scheduled").length;
  const nextScheduled = workshops
    .filter((w) => w.status === "scheduled" && w.scheduledAt)
    .map((w) => w.scheduledAt as string)
    .sort()[0];
  const ranThisQuarter = sessions.filter((s) => s.startedAt && new Date(s.startedAt) >= qStart).length;
  const totalActions = sessions.reduce((s, x) => s + (x.actions ?? 0), 0);
  const completedCount = workshops.filter((w) => w.status === "done").length;
  const kpis: { label: string; value: string; sub: string }[] = [
    { value: String(liveScheduled), label: "Live & scheduled", sub: nextScheduled ? `next: ${new Date(nextScheduled).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}` : "nothing booked" },
    { value: String(ranThisQuarter), label: "Run this quarter", sub: `${sessions.length} sessions all-time` },
    { value: String(totalActions), label: "Action items", sub: "captured live" },
    { value: String(completedCount), label: "Completed", sub: `${tplCards.length} frameworks ready` },
  ];

  return (
    <div>
      <h1 className="page-title">Workshops</h1>
      <p className="page-sub">
        Start from a proven framework, then run it live — we build the agenda for you.
      </p>
      {team ? (
        <WorkshopsClient
          teamId={team.id}
          canManage={canManage}
          templates={tplCards}
          workshops={workshops}
          recommendation={recommendation}
          surveyInsts={surveyInsts}
          scienceByCategory={scienceByCategory}
          sessions={sessions}
          canvasItems={canvasItems}
          initialTab={initialTab}
          kpis={kpis}
          teamOptions={teamOptions}
        />
      ) : (
        <div className="card empty">Create a team first to build a workshop.</div>
      )}
    </div>
  );
}
