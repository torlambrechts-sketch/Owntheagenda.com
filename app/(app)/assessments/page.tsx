import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { AssessmentsClient, type Dynamic, type FpMember } from "./AssessmentsClient";

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

  if (teamList.length === 0) {
    return (
      <div>
        <h1 className="page-title">Assessments</h1>
        <p className="page-sub">Team-dynamics pulses and individual fingerprints.</p>
        <div className="card empty">
          No teams yet. Create a team first, then run a pulse.
        </div>
      </div>
    );
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
      <h1 className="page-title">Assessments</h1>
      <p className="page-sub">
        Team-dynamics pulses and individual fingerprints for {activeTeam.name}.
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
