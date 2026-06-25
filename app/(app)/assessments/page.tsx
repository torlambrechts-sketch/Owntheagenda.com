import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { resolveInstruments } from "@/lib/assessments";
import { getFrameworks } from "@/lib/frameworks";
import { AssessmentSuite, type SuiteRow } from "./suite/AssessmentSuite";

// Assessment Suite — an organisation-wide hub over the assessment *instances*
// (team surveys), adapted from the imported "Assessment Suite" design into the
// app's own design language. The instrument library (taking / reports) still
// lives at /assessments; this is the operational overview across teams.
export default async function AssessmentSuitePage({ searchParams }: { searchParams: { compose?: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamList = teams ?? [];
  const teamNameById = new Map(teamList.map((t) => [t.id, t.name as string]));
  const teamIds = teamList.map((t) => t.id);

  // Teams the caller can start an assessment for: admins manage all; leads manage
  // teams they lead (team.lead_user_id or a team_member is_lead flag).
  const admin = isAdmin(ctx.role);
  const { data: leadMem } = !admin && teamIds.length
    ? await supabase.from("team_member").select("team_id").eq("user_id", ctx.userId).eq("is_lead", true).in("team_id", teamIds)
    : { data: [] as { team_id: string }[] };
  const leadTeamIds = new Set<string>([
    ...teamList.filter((t) => t.lead_user_id === ctx.userId).map((t) => t.id),
    ...(leadMem ?? []).map((m) => m.team_id),
  ]);
  const manageableBase = (admin ? teamList : teamList.filter((t) => leadTeamIds.has(t.id)));
  // Member counts per manageable team — drives the wizard's small-group privacy
  // warning (a group smaller than the min-participants floor stays masked).
  const manageableIds = manageableBase.map((t) => t.id);
  const { data: countRows } = manageableIds.length
    ? await supabase.from("team_member").select("team_id").in("team_id", manageableIds)
    : { data: [] as { team_id: string }[] };
  const countByTeam = new Map<string, number>();
  for (const c of countRows ?? []) countByTeam.set(c.team_id, (countByTeam.get(c.team_id) ?? 0) + 1);
  const manageableTeams = manageableBase.map((t) => ({ id: t.id as string, name: t.name as string, count: countByTeam.get(t.id) ?? 0 }));

  const instruments = await resolveInstruments();
  const instNameByKind = new Map(Object.values(instruments).map((i) => [i.kind, i.name]));

  // Team-scoped instruments that can be started for a team (the "New assessment" picker).
  const { data: tmplRows } = await supabase
    .from("assessment_template")
    .select("key, name")
    .eq("scope", "team")
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspace.id}`)
    .order("name");
  const templates = (tmplRows ?? []).map((t) => ({ key: t.key as string, name: t.name as string }));

  // Rich template cards for the Templates tab — every reusable instrument
  // (global + workspace-custom), with its section/question counts derived from
  // the definition snapshot.
  const { data: tmplCardRows } = await supabase
    .from("assessment_template")
    .select("key, name, description, category, scope, workspace_id, definition")
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspace.id}`)
    .order("name");
  const templateCards = (tmplCardRows ?? []).map((t) => {
    const def = (t.definition ?? {}) as { dimensions?: unknown[]; items?: unknown[] };
    return {
      key: t.key as string,
      name: t.name as string,
      description: (t.description as string | null) ?? "",
      category: (t.category as string | null) ?? "custom",
      scope: (t.scope as string | null) ?? "team",
      sections: Array.isArray(def.dimensions) ? def.dimensions.length : 0,
      questions: Array.isArray(def.items) ? def.items.length : 0,
      custom: t.workspace_id != null,
    };
  });

  // One cheap pass over every survey across the caller's teams. No per-survey
  // scoring here — that is resolved lazily when a row is opened.
  const { data: surveyRows } = teamIds.length
    ? await supabase
        .from("survey")
        .select("id, name, kind, status, team_id, created_at, created_by, start_at, due_at")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as { id: string; name: string | null; kind: string; status: string; team_id: string; created_at: string; created_by: string | null; start_at: string | null; due_at: string | null }[] };

  // Owner initials for the table's Owner column.
  const ownerIds = Array.from(new Set((surveyRows ?? []).map((s) => s.created_by).filter((x): x is string => !!x)));
  const { data: ownerRows } = ownerIds.length
    ? await supabase.from("profile").select("id, full_name, display_name").in("id", ownerIds)
    : { data: [] as { id: string; full_name: string | null; display_name: string | null }[] };
  const ownerNameById = new Map((ownerRows ?? []).map((o) => [o.id, (o.full_name || o.display_name || "") as string]));

  // Per-survey metrics in one set-based call: response count + invited (team
  // size), masking, overall band position, sections below band, and whether a
  // workshop was triggered. Powers the row Score marker + response-rate bar and
  // the KPIs/alert exactly, in a single round-trip. Not in the committed
  // generated types (kept un-regenerated to avoid drift), so it's cast and
  // guarded — a missing migration or any error degrades to no metrics.
  type OverviewMetric = { survey_id: string; respondents: number; invited: number; masked: boolean; overall_mean: number | null; overall_pct: number | null; below_count: number; has_workshop: boolean };
  // Bind to the client: extracting `.rpc` into a variable detaches it from
  // `supabase`, so the SDK dereferences `this.rest` and throws. Wrapped too, so
  // any failure (missing fn / returned error / thrown) falls through to the
  // cheap respondent-count fallback below instead of 500-ing the page.
  let metricRows: OverviewMetric[] | null = null;
  let metricErr: unknown = null;
  try {
    const callRpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: OverviewMetric[] | null; error: unknown }>;
    const res = await callRpc("assessment_suite_overview", { p_workspace: ctx.workspace.id });
    metricRows = res.data;
    metricErr = res.error;
  } catch (e) {
    metricErr = e;
  }
  const metrics = new Map<string, OverviewMetric>();
  if (!metricErr) for (const m of metricRows ?? []) metrics.set(m.survey_id, m);

  // Fallback: if the metrics RPC is unavailable (e.g. migration not yet
  // applied), still show real respondent counts via a cheap aggregate so the
  // overview never regresses to all-zeros — scores/rate just stay hidden.
  if (metricErr) {
    const sIds = (surveyRows ?? []).map((s) => s.id);
    const { data: respRows } = sIds.length
      ? await supabase.from("survey_response").select("survey_id").in("survey_id", sIds)
      : { data: [] as { survey_id: string }[] };
    const count = new Map<string, number>();
    for (const r of respRows ?? []) count.set(r.survey_id, (count.get(r.survey_id) ?? 0) + 1);
    for (const s of surveyRows ?? []) {
      metrics.set(s.id, { survey_id: s.id, respondents: count.get(s.id) ?? 0, invited: 0, masked: true, overall_mean: null, overall_pct: null, below_count: 0, has_workshop: false });
    }
  }

  const rows: SuiteRow[] = (surveyRows ?? []).map((s) => {
    const m = metrics.get(s.id);
    const ownerName = s.created_by ? ownerNameById.get(s.created_by) ?? null : null;
    return {
      id: s.id,
      name: s.name ?? instNameByKind.get(s.kind) ?? s.kind,
      kind: s.kind,
      category: "Survey",
      status: s.status,
      team: teamNameById.get(s.team_id) ?? null,
      teamId: s.team_id,
      respondents: m?.respondents ?? 0,
      invited: m?.invited ?? null,
      score: m && !m.masked ? m.overall_mean : null,
      pct: m && !m.masked ? m.overall_pct : null,
      masked: m ? m.masked : true,
      date: s.created_at,
      ownerName,
      startAt: s.start_at,
      dueAt: s.due_at,
      below: m?.below_count ?? 0,
    };
  });

  // KPIs + alert from the full metric set (every readable survey, not just the
  // listed page), so the headline numbers stay accurate.
  const all = Array.from(metrics.values());
  const withInvited = all.filter((m) => m.invited > 0);
  const avgRate = withInvited.length
    ? Math.round((withInvited.reduce((a, m) => a + Math.min(1, m.respondents / m.invited), 0) / withInvited.length) * 100)
    : null;
  const sectionsBelow = all.reduce((a, m) => a + m.below_count, 0);
  const assessmentsBelow = all.filter((m) => m.below_count > 0).length;
  const workshopsTriggered = all.filter((m) => m.has_workshop).length;
  const alert = sectionsBelow > 0 ? { sections: sectionsBelow, assessments: assessmentsBelow } : null;

  const openCount = rows.filter((r) => r.status === "open").length;
  const kpis = [
    { big: String(openCount), title: "Active assessments", sub: `${rows.length} total across ${teamList.length} ${teamList.length === 1 ? "team" : "teams"}` },
    { big: avgRate == null ? "—" : `${avgRate}%`, title: "Avg response rate", sub: withInvited.length ? `${withInvited.length} with a target team` : "no responses yet" },
    { big: String(sectionsBelow), title: "Sections below band", sub: assessmentsBelow ? `${assessmentsBelow} ${assessmentsBelow === 1 ? "assessment" : "assessments"}` : "all within band" },
    { big: String(workshopsTriggered), title: "Workshops triggered", sub: "from an assessment" },
  ];

  if (!teamList.length) {
    return (
      <>
        <div className="a-phead">
          <div>
            <div className="a-pt">Assessment suite</div>
            <div className="a-ps">An organisation-wide overview of every assessment across your teams.</div>
          </div>
        </div>
        <div className="empty">
          Create a team first — assessments run for a team. <Link className="linkbtn" href="/teams">Go to teams ›</Link>
        </div>
      </>
    );
  }

  // Frameworks strip — the top validated instruments, linking to the science.
  const frameworks = await getFrameworks();
  const frameworkChips = frameworks.slice(0, 5).map((f) => ({ key: f.key, title: f.title, accent: f.accent, accentBg: f.accentBg, iconKey: f.iconKey }));
  // Deep-link from a framework's "Use this framework" CTA: auto-open the wizard
  // with that instrument preselected (only if it's a valid template the user can send).
  const composeKind = searchParams.compose && templates.some((t) => t.key === searchParams.compose) ? searchParams.compose : null;

  return <AssessmentSuite rows={rows} kpis={kpis} alert={alert} isAdmin={admin} canStart={admin || manageableTeams.length > 0} manageableTeamIds={manageableTeams.map((t) => t.id)} teams={manageableTeams} templates={templates} templateCards={templateCards} frameworkChips={frameworkChips} composeKind={composeKind} />;
}
