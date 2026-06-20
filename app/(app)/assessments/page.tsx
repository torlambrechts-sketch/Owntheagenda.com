import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { listTemplates, instrumentsFrom } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys } from "@/lib/survey";
import { AssessmentLibrary, type CatalogItem, type SessionRow, type ResponseRow } from "./AssessmentLibrary";

export default async function AssessmentsPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamList = teams ?? [];
  const userName = ctx.profile?.full_name || ctx.profile?.display_name || ctx.email || "You";

  // ----- instrument library catalog (drives the new Assessments library) -----
  const catalogTemplates = await listTemplates();
  const catalogInstruments = instrumentsFrom(catalogTemplates);
  const { data: myResp } = await supabase
    .from("individual_response")
    .select("template_key, scores, shared, updated_at")
    .eq("workspace_id", ctx.workspace.id)
    .eq("user_id", ctx.userId);
  const myByKey = new Map((myResp ?? []).map((r) => [r.template_key as string, (r.scores ?? {}) as Record<string, number>]));
  const mySharedByKey = new Map((myResp ?? []).map((r) => [r.template_key as string, Boolean(r.shared)]));
  // Personal take-history (oldest first) per instrument, for the report's trend.
  const { data: histRows } = await supabase
    .from("individual_response_history")
    .select("template_key, scores, created_at")
    .eq("workspace_id", ctx.workspace.id)
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: true });
  const histByKey = new Map<string, { at: string; scores: Record<string, number> }[]>();
  for (const h of histRows ?? []) {
    const arr = histByKey.get(h.template_key as string) ?? [];
    arr.push({ at: h.created_at as string, scores: (h.scores ?? {}) as Record<string, number> });
    histByKey.set(h.template_key as string, arr);
  }
  // Instruments assigned to me (so the library can flag them).
  const { data: myAssign } = await supabase
    .from("assessment_assignment")
    .select("template_key, note, due_at")
    .eq("workspace_id", ctx.workspace.id)
    .eq("assignee_user_id", ctx.userId);
  const assignByKey = new Map(
    (myAssign ?? []).map((a) => [a.template_key as string, { note: (a.note ?? null) as string | null, dueAt: (a.due_at ?? null) as string | null }]),
  );
  // Workspace members for the admin "assign" picker (admins only).
  const admin = isAdmin(ctx.role);
  let wsMembers: { id: string; name: string }[] = [];
  if (admin) {
    const { data: mem } = await supabase
      .from("membership")
      .select("user_id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "active");
    const ids = (mem ?? []).map((m) => m.user_id as string);
    if (ids.length) {
      const { data: profs } = await supabase.from("profile").select("id, full_name, display_name, email").in("id", ids);
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      wsMembers = ids.map((id) => {
        const p = byId.get(id) as { full_name?: string | null; display_name?: string | null; email?: string | null } | undefined;
        return { id, name: p?.full_name || p?.display_name || p?.email || "Member" };
      });
    }
  }
  const { data: traitCopy } = await supabase
    .from("assessment_trait_copy")
    .select("template_key, dimension_key, definition, advantages, risks, statements");
  const copyMap = new Map(
    (traitCopy ?? []).map((r) => [
      `${r.template_key}:${r.dimension_key}`,
      { definition: r.definition as string, advantages: (r.advantages ?? []) as string[], risks: (r.risks ?? []) as string[], statements: (r.statements ?? []) as string[] },
    ]),
  );
  const catalog: CatalogItem[] = [
    {
      key: "leadership_effectiveness",
      name: "Leadership Effectiveness",
      category: "How your leadership team performs across input, process, emergent states and output.",
      scope: "individual",
      source: "Bang & Midelfart leadership-team research",
      description: "A 63-item self-assessment of your leadership team across 21 facets — scored by category, with reverse-scoring handled for you.",
      dimensions: ["Input", "Process", "Emergent states", "Output"].map((l, i) => ({ key: `c${i}`, label: l, blurb: "" })),
      items: Array.from({ length: 63 }, (_, i) => ({ key: `q${i}`, dimension: "c0", text: "" })),
      scale: { min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      mins: 15,
      completedByMe: false,
      myScores: null,
      external: "/assessments/leadership",
      openSurveyId: null,
      teamReport: null,
      myHistory: [],
      myShared: false,
      norms: [],
      assignedToMe: null,
    },
    ...catalogTemplates.map((t): CatalogItem => {
      const inst = catalogInstruments[t.key];
      const items = inst?.items ?? [];
      const scores = myByKey.get(t.key) ?? null;
      return {
        key: t.key,
        name: t.name,
        category: t.description ?? "",
        scope: t.scope === "team" ? "team" : "individual",
        source: t.source,
        description: t.description,
        dimensions: (inst?.dimensions ?? []).map((d) => ({ ...d, copy: copyMap.get(`${t.key}:${d.key}`) ?? null })),
        items,
        scale: inst?.scale ?? { min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
        mins: Math.max(3, Math.round(items.length * 0.5)),
        completedByMe: !!scores,
        myScores: scores,
        external: null,
        openSurveyId: null,
        teamReport: null,
        myHistory: histByKey.get(t.key) ?? [],
        myShared: mySharedByKey.get(t.key) ?? false,
        norms: [],
        assignedToMe: assignByKey.get(t.key) ?? null,
      };
    }),
  ];

  // ----- per-dimension percentile norms for the instruments I've completed -----
  // Global pool, reverse-aware, min-N guarded server-side; only my own standing
  // is returned, never anyone else's scores.
  for (const item of catalog) {
    if (item.scope !== "individual" || !item.completedByMe || item.external) continue;
    const { data: norm } = await supabase.rpc("individual_norms", { p_template_key: item.key });
    item.norms = (norm as unknown as { dims?: { dimension: string; percentile: number | null; others_n: number }[] } | null)?.dims ?? [];
  }

  // ----- Gap-2 team-report enrichment for the primary team -----
  // Team instruments still surface an open survey to contribute to and the
  // primary team's anonymised aggregate; full per-team analysis now lives under
  // Insight · Leadership Teams.
  const primaryTeam = teamList[0] ?? null;
  if (primaryTeam) {
    const { data: kindSurveys } = await supabase
      .from("survey")
      .select("id, kind, status")
      .eq("team_id", primaryTeam.id)
      .order("created_at", { ascending: false });
    const latestByKind = new Map<string, string>();
    const openByKind = new Map<string, string>();
    for (const s of kindSurveys ?? []) {
      if (!latestByKind.has(s.kind)) latestByKind.set(s.kind, s.id);
      if (s.status === "open" && !openByKind.has(s.kind)) openByKind.set(s.kind, s.id);
    }
    for (const item of catalog) {
      if (item.scope !== "team") continue;
      const inst = catalogInstruments[item.key];
      if (!inst) continue;
      item.openSurveyId = openByKind.get(item.key) ?? null;
      const latest = latestByKind.get(item.key);
      if (!latest) continue;
      const { data: res } = await supabase.rpc("survey_results", { p_survey: latest, p_strength_items: strengthItemKeys(inst) });
      const r = res as unknown as { respondents: number; masked: boolean; items: { item_key: string; mean: number; n: number }[] } | null;
      if (!r) continue;
      const dims = dimensionMeans(inst, r.items ?? [])
        .filter((d): d is { key: string; label: string; blurb: string; mean: number } => d.mean != null)
        .map((d) => ({ key: d.key, mean: d.mean }));
      item.teamReport = { dims, respondents: r.respondents, masked: r.masked };
    }
  }

  // ----- Sessions tab: assessment runs (team surveys) across my teams -----
  const teamIds = teamList.map((t) => t.id);
  const teamNameById = new Map(teamList.map((t) => [t.id, t.name]));
  const instNameByKind = new Map(Object.values(catalogInstruments).map((i) => [i.kind, i.name]));
  const { data: surveyRows } = teamIds.length
    ? await supabase
        .from("survey")
        .select("id, name, kind, status, team_id, created_at")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] as { id: string; name: string | null; kind: string; status: string; team_id: string; created_at: string }[] };
  const sIds = (surveyRows ?? []).map((s) => s.id);
  const { data: respRows } = sIds.length
    ? await supabase.from("survey_response").select("survey_id").in("survey_id", sIds)
    : { data: [] as { survey_id: string }[] };
  const respCount = new Map<string, number>();
  for (const r of respRows ?? []) respCount.set(r.survey_id, (respCount.get(r.survey_id) ?? 0) + 1);
  const sessions: SessionRow[] = (surveyRows ?? []).map((s) => ({
    id: s.id,
    instrument: instNameByKind.get(s.kind) ?? s.name ?? s.kind,
    team: teamNameById.get(s.team_id) ?? null,
    status: s.status,
    respondents: respCount.get(s.id) ?? 0,
    date: s.created_at,
  }));

  // ----- Responses tab: my own completed assessments -----
  const responses: ResponseRow[] = (myResp ?? [])
    .map((r) => ({
      key: r.template_key as string,
      instrument: instNameByKind.get(r.template_key as string) ?? (r.template_key as string),
      takenAt: (r.updated_at as string) ?? "",
      scope: (catalog.find((c) => c.key === r.template_key)?.scope ?? "individual") as "individual" | "team",
    }))
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));

  return (
    <AssessmentLibrary
      workspaceId={ctx.workspace.id}
      catalog={catalog}
      userName={userName}
      isAdmin={admin}
      members={wsMembers}
      sessions={sessions}
      responses={responses}
    />
  );
}
