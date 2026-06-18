import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { weakestDynamic, RECOMMENDED } from "@/lib/grounding";
import { WorkshopsClient, type TemplateCard, type WorkshopRow, type Recommendation } from "./WorkshopsClient";

export default async function WorkshopsPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const team = teams?.[0] ?? null;

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
      .select("id, title, status, created_at")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false });
    workshops = (ws ?? []).map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
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

  return (
    <div>
      <h1 className="page-title">Workshops</h1>
      <p className="page-sub">
        Proven frameworks, ready to run. Pick one — we build the agenda for you.
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
        />
      ) : (
        <div className="card empty">Create a team first to build a workshop.</div>
      )}
    </div>
  );
}
