import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { listTemplates, instrumentsFrom } from "@/lib/assessments";
import { HealthClient, type Entity } from "./HealthClient";
import { AssessmentsClient, type Dynamic, type FpMember } from "../../assessments/AssessmentsClient";
import { SurveyRespond } from "../../assessments/SurveyRespond";
import { SendSurvey } from "../../assessments/SendSurvey";

// Insight · Leadership Teams — the workspace Health rollup plus the per-team
// dynamics tooling (pulses, multi-item surveys, perception gaps) that used to
// live on the Assessments page.
export default async function LeadershipTeamsPage({
  searchParams,
}: {
  searchParams: { team?: string };
}) {
  const ctx = await requireSession();
  // The org-wide rollup uses a definer RPC that bypasses RLS, so scoped
  // facilitators don't get it.
  if (ctx.role === "facilitator") redirect("/dashboard");
  const supabase = createClient();

  // ---------- workspace Health rollup ----------
  const { data: healthData } = await supabase.rpc("workspace_health", { p_workspace: ctx.workspace.id });
  const entities = ((healthData as unknown as Entity[]) ?? []).filter(Boolean);

  const admin = isAdmin(ctx.role);
  let manageable: string[];
  if (admin) {
    manageable = entities.map((e) => e.team_id);
  } else {
    const { data: led } = await supabase
      .from("team")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("lead_user_id", ctx.userId)
      .is("deleted_at", null);
    manageable = (led ?? []).map((t) => t.id);
  }

  const [{ data: fuPlanned }, { data: openActs }] = await Promise.all([
    supabase.from("follow_up").select("team_id, scheduled_at").eq("workspace_id", ctx.workspace.id).eq("status", "planned"),
    supabase.from("action_item").select("team_id").eq("workspace_id", ctx.workspace.id).eq("status", "open"),
  ]);
  const nextByTeam = new Map<string, string>();
  for (const f of fuPlanned ?? []) {
    if (f.team_id && f.scheduled_at) {
      const cur = nextByTeam.get(f.team_id);
      if (!cur || f.scheduled_at < cur) nextByTeam.set(f.team_id, f.scheduled_at);
    }
  }
  const openByTeam = new Map<string, number>();
  for (const a of openActs ?? []) if (a.team_id) openByTeam.set(a.team_id, (openByTeam.get(a.team_id) ?? 0) + 1);
  const momentum: Record<string, { nextAt: string | null; open: number }> = {};
  for (const e of entities) momentum[e.team_id] = { nextAt: nextByTeam.get(e.team_id) ?? null, open: openByTeam.get(e.team_id) ?? 0 };

  // ---------- per-team dynamics tooling ----------
  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const teamList = teams ?? [];

  const healthBoard = (
    <>
      <h1 className="page-title">Leadership Teams</h1>
      <p className="page-sub">Status of every team and leadership group — dynamics, strategy and performance.</p>
      <HealthClient entities={entities} manageable={manageable} momentum={momentum} />
    </>
  );

  if (teamList.length === 0) {
    return <div>{healthBoard}</div>;
  }

  const activeTeam = teamList.find((t) => t.id === searchParams.team) ?? teamList[0];
  const teamId = activeTeam.id;

  const { data: dynData } = await supabase.rpc("team_dynamics", { p_team: teamId });
  const dynamics = (dynData ?? []) as Dynamic[];

  // Trend: per-dynamic movement between the two most recent closed pulses.
  const { data: histData } = await supabase.rpc("team_dynamics_history", { p_team: teamId });
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
      deltas[dyn] = last.pct != null && prev.pct != null ? { delta: last.pct - prev.pct, prevName: prev.name } : null;
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
  const closedPulses = (pulses ?? []).filter((p) => p.status === "closed");
  const latestClosed = closedPulses.length
    ? closedPulses.reduce((a, b) => (new Date(a.closed_at ?? 0) > new Date(b.closed_at ?? 0) ? a : b))
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
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const pById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameOf = (uid: string) => {
    const p = pById.get(uid);
    return p?.full_name || p?.display_name || p?.email || "Unknown";
  };

  const tmIds = tmList.map((t) => t.id);
  const { data: fps } = tmIds.length
    ? await supabase.from("fingerprint").select("team_member_id, trait, band_low, band_high").in("team_member_id", tmIds).order("trait", { ascending: true })
    : { data: [] as { team_member_id: string; trait: string; band_low: number; band_high: number }[] };
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
  const canManage = admin || activeTeam.lead_user_id === ctx.userId || Boolean(meTm?.is_lead);
  const isTeamMember = Boolean(meTm);

  const { data: openSurveys } = await supabase
    .from("survey")
    .select("id, name, kind, due_at, subject_user_id, anonymity")
    .eq("team_id", teamId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  const catalogTemplates = await listTemplates();
  const instruments = instrumentsFrom(catalogTemplates);
  const teamTemplates = catalogTemplates.filter((t) => t.scope === "team").map((t) => ({ key: t.key, name: t.name }));

  type SurveyStatus = { responded: number; total: number; roster: { name: string; completed: boolean }[] };
  const surveyStatus: Record<string, SurveyStatus> = {};
  if (canManage) {
    for (const s of openSurveys ?? []) {
      const { data: part } = await supabase.rpc("survey_participation", { p_survey: s.id });
      const roster = (part ?? [])
        .map((p) => ({ name: nameOf(p.user_id), completed: p.completed }))
        .sort((a, b) => Number(b.completed) - Number(a.completed) || a.name.localeCompare(b.name));
      surveyStatus[s.id] = { responded: roster.filter((r) => r.completed).length, total: roster.length, roster };
    }
  }

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

  let participation: { name: string; completed: boolean }[] | null = null;
  if (openPulse && canManage) {
    const { data: part } = await supabase.rpc("pulse_participation", { p_pulse: openPulse.id });
    participation = (part ?? []).map((p) => ({ name: nameOf(p.user_id), completed: p.completed }));
  }

  return (
    <div>
      {healthBoard}

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
              href={`/insight/leadership-teams?team=${t.id}`}
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
          surveys={(openSurveys ?? []) as { id: string; name: string; kind: string; anonymity?: string }[]}
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
