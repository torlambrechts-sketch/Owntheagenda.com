import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { TeamDetailClient, type TMRow, type Addable } from "./TeamDetailClient";

export default async function TeamDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const teamId = params.id;

  const { data: team } = await supabase
    .from("team")
    .select("id, name, description, lead_user_id, workspace_id")
    .eq("id", teamId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!team || team.workspace_id !== ctx.workspace.id) notFound();

  const { data: charterRow } = await supabase
    .from("team_charter")
    .select("purpose, goals, roles, work_methods, norms, status")
    .eq("team_id", teamId)
    .maybeSingle();

  const { data: dynRows } = await supabase.rpc("team_dynamics", { p_team: teamId });

  const { data: tm } = await supabase
    .from("team_member")
    .select("id, user_id, role_title, is_lead, consent_share")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });
  const teamMembers = tm ?? [];

  // workspace members (for the "add" picker) + profiles for names
  const { data: ws } = await supabase
    .from("membership")
    .select("user_id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", "active");
  const wsUserIds = (ws ?? []).map((m) => m.user_id);

  const { data: profiles } = wsUserIds.length
    ? await supabase
        .from("profile")
        .select("id, full_name, display_name, email")
        .in("id", wsUserIds)
    : { data: [] as any[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameOf = (uid: string) => {
    const p = byId.get(uid);
    return p?.full_name || p?.display_name || p?.email || "Unknown";
  };

  const members: TMRow[] = teamMembers.map((m) => ({
    teamMemberId: m.id,
    userId: m.user_id,
    name: nameOf(m.user_id),
    email: byId.get(m.user_id)?.email ?? null,
    roleTitle: m.role_title,
    isLead: m.is_lead || team.lead_user_id === m.user_id,
    consentShare: m.consent_share,
    isSelf: m.user_id === ctx.userId,
  }));

  const onTeam = new Set(teamMembers.map((m) => m.user_id));
  const addable: Addable[] = wsUserIds
    .filter((uid) => !onTeam.has(uid))
    .map((uid) => ({
      userId: uid,
      name: nameOf(uid),
      email: byId.get(uid)?.email ?? null,
    }));

  const meTM = teamMembers.find((m) => m.user_id === ctx.userId);
  const canManage =
    isAdmin(ctx.role) ||
    team.lead_user_id === ctx.userId ||
    Boolean(meTM?.is_lead);

  return (
    <div>
      <Link href="/teams" className="linkbtn" style={{ fontSize: 12 }}>
        ‹ Teams
      </Link>
      <h1 className="page-title" style={{ marginTop: 6 }}>
        {team.name}
      </h1>
      <p className="page-sub">
        {team.description || "Team members, leadership and consent."}
      </p>
      <TeamDetailClient
        teamId={teamId}
        canManage={canManage}
        isAdmin={isAdmin(ctx.role)}
        team={{ name: team.name, description: team.description }}
        members={members}
        addable={addable}
      />
      {charterRow ? <TeamCharterReadout charter={charterRow} /> : null}
      <TeamDynamicsSnapshot rows={(dynRows ?? []) as DynRow[]} />
    </div>
  );
}

type DynRow = { dynamic: string; label: string; pct: number | null; target_low: number; target_high: number };

function TeamDynamicsSnapshot({ rows }: { rows: DynRow[] }) {
  if (!rows.length) return null;
  const anyReading = rows.some((r) => r.pct != null);
  return (
    <div className="team-charter" style={{ marginTop: 16 }}>
      <div className="tc-h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--role)" strokeWidth="2.2">
          <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
        </svg>
        <h2>Team dynamics</h2>
      </div>
      {!anyReading ? (
        <p className="ro-empty" style={{ marginTop: 6 }}>Run an assessment to see where the team stands. Hidden until at least 3 people respond.</p>
      ) : (
        <div className="assess-agg" style={{ boxShadow: "none", border: "none", padding: "8px 0 0" }}>
          {rows.map((r) => {
            const masked = r.pct == null;
            return (
              <div className="asrow" key={r.dynamic}>
                <div className="aslabel">{r.label}</div>
                <div className="astrack">
                  <div className="astarget" style={{ left: `${r.target_low}%`, width: `${Math.max(0, r.target_high - r.target_low)}%` }} />
                  {!masked ? <div className="asmark" style={{ left: `${r.pct}%` }} /> : null}
                </div>
                <div className="asval">{masked ? "· · ·" : `${r.pct}%`}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamCharterReadout({ charter }: { charter: Record<string, unknown> }) {
  const purpose = (charter.purpose as string) || "";
  const goals = (charter.goals as { text: string }[]) ?? [];
  const roles = (charter.roles as { name: string; responsibilities?: string }[]) ?? [];
  const norms = (charter.norms as { text: string }[]) ?? [];
  const wm = (charter.work_methods as Record<string, string>) ?? {};
  const active = charter.status === "active";
  const empty = !purpose && !goals.length && !roles.length && !norms.length && !Object.values(wm).some(Boolean);
  if (empty) return null;
  return (
    <div className="team-charter">
      <div className="tc-h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
        <h2>Team charter</h2>
        <span className={`pill sm${active ? "" : " draft"}`} style={active ? { background: "var(--open-bg)", color: "var(--green)" } : {}}>
          {active ? "Active" : "Draft"}
        </span>
      </div>
      {purpose ? <p className="chbody" style={{ marginTop: 6 }}><b>Purpose.</b> {purpose}</p> : null}
      {goals.length ? (
        <div className="chsec" style={{ boxShadow: "none", marginTop: 12 }}>
          <div className="chsec-h"><b>Goals</b></div>
          <ul className="chlist">{goals.map((g, i) => <li key={i}>{g.text}</li>)}</ul>
        </div>
      ) : null}
      {roles.length ? (
        <div className="chsec" style={{ boxShadow: "none", marginTop: 12 }}>
          <div className="chsec-h"><b>Roles & responsibilities</b></div>
          <ul className="chlist">{roles.map((r, i) => <li key={i}><b>{r.name}</b>{r.responsibilities ? ` — ${r.responsibilities}` : ""}</li>)}</ul>
        </div>
      ) : null}
      {Object.values(wm).some(Boolean) ? (
        <div className="chsec" style={{ boxShadow: "none", marginTop: 12 }}>
          <div className="chsec-h"><b>How we work</b></div>
          <div className="chmethods">
            {(["meetings", "communication", "tools", "decisions"] as const).map((k) =>
              wm[k] ? <div key={k}><span className="chk-label">{k}</span> {wm[k]}</div> : null,
            )}
          </div>
        </div>
      ) : null}
      {norms.length ? (
        <div className="chsec" style={{ boxShadow: "none", marginTop: 12 }}>
          <div className="chsec-h"><b>Collaboration norms</b></div>
          <ul className="chlist">{norms.map((n, i) => <li key={i}>{n.text}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
