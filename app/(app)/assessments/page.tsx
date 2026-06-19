import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { listTemplates, instrumentsFrom } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys } from "@/lib/survey";
import { AssessmentsClient, type Dynamic, type FpMember } from "./AssessmentsClient";
import { AssessmentLibrary, type CatalogItem } from "./AssessmentLibrary";
import { SurveyRespond } from "./SurveyRespond";
import { SendSurvey } from "./SendSurvey";

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: { team?: string };
}) {
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
    .select("template_key, scores, shared")
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

  if (teamList.length === 0) {
    return <AssessmentLibrary workspaceId={ctx.workspace.id} catalog={catalog} userName={userName} />;
  }

  const activeTeam =
    teamList.find((t) => t.id === searchParams.team) ?? teamList[0];
  const teamId = activeTeam.id;

  const { data: dynData } = await supabase.rpc("team_dynamics", {
    p_team: teamId,
  });
  const dynamics = (dynData ?? []) as Dynamic[];

  // Trend: per-dynamic movement between the two most recent closed pulses.
  const { data: histData } = await supabase.rpc("team_dynamics_history", {
    p_team: teamId,
  });
  const byDyn = new Map<string, { name: string; pct: number | null }[]>();
  for (const h of histData ?? []) {
    const arr = byDyn.get(h.dynamic) ?? [];
    arr.push({ name: h.pulse_name, pct: h.pct == null ? null : Number(h.pct) });
    byDyn.set(h.dynamic, arr);
  }
  const deltas: Record<string, { delta: number; prevName: string } | null> = {};
  for (const [dyn, arr] of byDyn) {
    if (arr.length >= 2) {
      const last = arr[arr.length - 1];
      const prev = arr[arr.length - 2];
      deltas[dyn] =
        last.pct != null && prev.pct != null
          ? { delta: last.pct - prev.pct, prevName: prev.name }
          : null;
    } else {
      deltas[dyn] = null;
    }
  }

  const { data: pulses } = await supabase
    .from("pulse")
    .select("id, name, status, closed_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  const openPulse = (pulses ?? []).find((p) => p.status === "open") ?? null;
  // Bands reflect the latest CLOSED pulse (by close time, not insert order).
  const closedPulses = (pulses ?? []).filter((p) => p.status === "closed");
  const latestClosed = closedPulses.length
    ? closedPulses.reduce((a, b) =>
        new Date(a.closed_at ?? 0) > new Date(b.closed_at ?? 0) ? a : b,
      )
    : null;

  const { data: tms } = await supabase
    .from("team_member")
    .select("id, user_id, role_title, consent_share, is_lead")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });
  const tmList = tms ?? [];

  const userIds = tmList.map((t) => t.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", userIds)
    : { data: [] as any[] };
  const pById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameOf = (uid: string) => {
    const p = pById.get(uid);
    return p?.full_name || p?.display_name || p?.email || "Unknown";
  };

  const tmIds = tmList.map((t) => t.id);
  const { data: fps } = tmIds.length
    ? await supabase
        .from("fingerprint")
        .select("team_member_id, trait, band_low, band_high")
        .in("team_member_id", tmIds)
        .order("trait", { ascending: true })
    : { data: [] as any[] };
  const fpByMember = new Map<string, { trait: string; lo: number; hi: number }[]>();
  for (const f of fps ?? []) {
    const arr = fpByMember.get(f.team_member_id) ?? [];
    arr.push({ trait: f.trait, lo: f.band_low, hi: f.band_high });
    fpByMember.set(f.team_member_id, arr);
  }

  const members: FpMember[] = tmList.map((t) => ({
    teamMemberId: t.id,
    name: nameOf(t.user_id),
    roleTitle: t.role_title,
    consentShare: t.consent_share,
    isSelf: t.user_id === ctx.userId,
    traits: fpByMember.get(t.id) ?? [],
  }));

  const meTm = tmList.find((t) => t.user_id === ctx.userId);
  const canManage =
    isAdmin(ctx.role) ||
    activeTeam.lead_user_id === ctx.userId ||
    Boolean(meTm?.is_lead);
  const isTeamMember = Boolean(meTm);

  const { data: openSurveys } = await supabase
    .from("survey")
    .select("id, name, kind, due_at, subject_user_id")
    .eq("team_id", teamId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  // ----- enrich the team catalog with this team's open survey + aggregate report -----
  // openSurveyId lets a member contribute a response straight from the library;
  // teamReport is the anonymised aggregate (min-3 masked, never attributed) from
  // the team's latest survey of that kind — whether still open or already closed.
  {
    const { data: kindSurveys } = await supabase
      .from("survey")
      .select("id, kind, status")
      .eq("team_id", teamId)
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
      const { data: res } = await supabase.rpc("survey_results", {
        p_survey: latest,
        p_strength_items: strengthItemKeys(inst),
      });
      const r = res as unknown as
        | { respondents: number; masked: boolean; items: { item_key: string; mean: number; n: number }[] }
        | null;
      if (!r) continue;
      const dims = dimensionMeans(inst, r.items ?? [])
        .filter((d): d is { key: string; label: string; blurb: string; mean: number } => d.mean != null)
        .map((d) => ({ key: d.key, mean: d.mean }));
      item.teamReport = { dims, respondents: r.respondents, masked: r.masked };
    }
  }

  // Instrument catalog from the template library (data-driven).
  const teamTemplates = catalogTemplates.filter((t) => t.scope === "team").map((t) => ({ key: t.key, name: t.name }));
  const instruments = catalogInstruments;

  // Per-open-survey response status (lead/admin only): count + who's answered.
  type SurveyStatus = { responded: number; total: number; roster: { name: string; completed: boolean }[] };
  const surveyStatus: Record<string, SurveyStatus> = {};
  if (canManage) {
    for (const s of openSurveys ?? []) {
      const { data: part } = await supabase.rpc("survey_participation", { p_survey: s.id });
      const roster = (part ?? [])
        .map((p) => ({ name: nameOf(p.user_id), completed: p.completed }))
        .sort((a, b) => Number(b.completed) - Number(a.completed) || a.name.localeCompare(b.name));
      surveyStatus[s.id] = {
        responded: roster.filter((r) => r.completed).length,
        total: roster.length,
        roster,
      };
    }
  }

  // Perception gap (lead/admin): a designated subject's view vs the team's.
  type GapDim = { key: string; label: string; subject: number | null; others: number | null };
  type Gap = {
    has_subject: boolean;
    subject_present?: boolean;
    others_n?: number;
    others_masked?: boolean;
    per_dim?: GapDim[];
    subject_composite?: number | null;
    others_composite?: number | null;
    gap?: number | null;
  };
  const surveyGap: Record<string, { subjectId: string | null; gap: Gap | null }> = {};
  const subjectMembers = tmList.map((t) => ({ id: t.user_id, name: nameOf(t.user_id) }));
  if (canManage) {
    for (const s of openSurveys ?? []) {
      const subjectId = (s as { subject_user_id: string | null }).subject_user_id;
      let gap: Gap | null = null;
      if (subjectId) {
        const { data } = await supabase.rpc("survey_perception_gap", { p_survey: s.id });
        gap = (data as unknown as Gap) ?? null;
      }
      surveyGap[s.id] = { subjectId, gap };
    }
  }

  // Participation roster for an open pulse (lead/admin only): who has responded.
  let participation: { name: string; completed: boolean }[] | null = null;
  if (openPulse && canManage) {
    const { data: part } = await supabase.rpc("pulse_participation", {
      p_pulse: openPulse.id,
    });
    participation = (part ?? []).map((p) => ({
      name: nameOf(p.user_id),
      completed: p.completed,
    }));
  }

  return (
    <div>
      <AssessmentLibrary workspaceId={ctx.workspace.id} catalog={catalog} userName={userName} />

      <div className="cat-head" style={{ marginTop: 34 }}>
        Team dynamics <span className="n">{activeTeam.name}</span>
      </div>
      <p className="page-sub" style={{ marginTop: -6 }}>
        Run a quick pulse or a multi-item survey, then track how the team moves over time.
      </p>

      {teamList.length > 1 ? (
        <div className="chips" style={{ display: "flex", gap: 7, marginBottom: 18 }}>
          {teamList.map((t) => (
            <Link
              key={t.id}
              href={`/assessments?team=${t.id}`}
              className={`pill sm ${t.id === teamId ? "open" : "draft"}`}
              style={{ textDecoration: "none" }}
            >
              {t.name}
            </Link>
          ))}
        </div>
      ) : null}

      {canManage ? (
        <SendSurvey
          teamId={teamId}
          openSurveys={(openSurveys ?? []) as { id: string; name: string; kind: string; due_at: string | null }[]}
          templates={teamTemplates}
          status={surveyStatus}
          members={subjectMembers}
          gaps={surveyGap}
        />
      ) : null}

      {isTeamMember ? (
        <SurveyRespond
          surveys={(openSurveys ?? []) as { id: string; name: string; kind: string }[]}
          userId={ctx.userId}
          instruments={instruments}
        />
      ) : null}

      <AssessmentsClient
        teamId={teamId}
        teamName={activeTeam.name}
        canManage={canManage}
        isTeamMember={isTeamMember}
        openPulse={openPulse ? { id: openPulse.id, name: openPulse.name } : null}
        latestPulseName={latestClosed?.name ?? null}
        dynamics={dynamics}
        deltas={deltas}
        members={members}
        participation={participation}
      />
    </div>
  );
}
