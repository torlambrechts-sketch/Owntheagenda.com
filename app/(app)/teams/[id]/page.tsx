import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { TeamDetailClient, type TMRow, type Addable } from "./TeamDetailClient";
import { resolveInstrument, resolveInstruments } from "@/lib/assessments";
import { dimensionMeans, individualDimensionMeans, climateStrength, strengthItemKeys, type ItemStat, type SurveyInstrument } from "@/lib/survey";

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

  const { data: latestSurvey } = await supabase
    .from("survey")
    .select("id")
    .eq("team_id", teamId)
    .eq("kind", "psych_safety_bang")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const psychInst = await resolveInstrument("psych_safety_bang");
  const surveyResults = latestSurvey && psychInst
    ? (await supabase.rpc("survey_results", { p_survey: latestSurvey.id, p_strength_items: strengthItemKeys(psychInst) })).data
    : null;

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

  // Shared individual profiles (opt-in). RLS returns only the rows the viewer
  // may see — own rows and teammates' shared rows — so filtering on shared=true
  // gives the team's opted-in profiles.
  const memberUserIds = teamMembers.map((m) => m.user_id);
  const { data: sharedRows } = memberUserIds.length
    ? await supabase
        .from("individual_response")
        .select("user_id, template_key, scores")
        .in("user_id", memberUserIds)
        .eq("shared", true)
    : { data: [] as { user_id: string; template_key: string; scores: unknown }[] };
  let sharedProfiles: SharedProfile[] = [];
  if ((sharedRows ?? []).length) {
    const instMap = await resolveInstruments();
    sharedProfiles = memberUserIds
      .map((uid) => {
        const entries = (sharedRows ?? [])
          .filter((r) => r.user_id === uid)
          .map((r) => {
            const inst = instMap[r.template_key];
            if (!inst) return null;
            return {
              instrument: inst.name,
              max: inst.scale.max,
              dims: individualDimensionMeans(inst, (r.scores ?? {}) as Record<string, number>),
            };
          })
          .filter((e): e is ProfileEntry => e !== null);
        return entries.length ? { name: nameOf(uid), entries } : null;
      })
      .filter((p): p is SharedProfile => p !== null);
  }

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
      <PsychSafetyReadout results={surveyResults as SurveyResults | null} instrument={psychInst} />
      <TeamProfiles profiles={sharedProfiles} />
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

type SurveyResults = { respondents: number; masked: boolean; items: ItemStat[]; strength_sd: number | null };

function PsychSafetyReadout({ results, instrument }: { results: SurveyResults | null; instrument: SurveyInstrument | null }) {
  if (!results || !instrument) return null;
  const max = instrument.scale.max;
  const dims = results.masked ? null : dimensionMeans(instrument, results.items);
  const strength = results.masked ? null : climateStrength(results.strength_sd);
  const strengthLabel = instrument.dimensions.find((d) => d.key === instrument.strengthDimension)?.label.toLowerCase() ?? "agreement";
  return (
    <div className="team-charter" style={{ marginTop: 16 }}>
      <div className="tc-h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
        <h2>Psychological safety</h2>
        {strength ? <span className={`svchip ${strength.tone}`} style={{ marginLeft: 4 }}>{strength.label} on {strengthLabel}</span> : null}
      </div>
      {results.masked || !dims ? (
        <p className="ro-empty" style={{ marginTop: 6 }}>Hidden until at least 3 people respond ({results.respondents}/3).</p>
      ) : (
        <div className="assess-agg" style={{ boxShadow: "none", border: "none", padding: "8px 0 0" }}>
          {dims.map((d) => {
            const pct = d.mean == null ? 0 : Math.round((d.mean / max) * 100);
            return (
              <div className="svdim" key={d.key}>
                <div className="svdim-top"><span className="svdim-label">{d.label}</span><span className="svdim-val">{d.mean == null ? "· · ·" : `${d.mean.toFixed(1)} / ${max}`}</span></div>
                <div className="svtrack"><div className="svfill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ProfileEntry = { instrument: string; max: number; dims: { key: string; label: string; blurb: string; mean: number | null }[] };
type SharedProfile = { name: string; entries: ProfileEntry[] };

function TeamProfiles({ profiles }: { profiles: SharedProfile[] }) {
  if (!profiles.length) return null;
  return (
    <div className="team-charter" style={{ marginTop: 16 }}>
      <div className="tc-h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--role)" strokeWidth="2.2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
        <h2>Team profiles</h2>
        <span className="libhint" style={{ marginLeft: 4 }}>shared by members</span>
      </div>
      <div className="tpl-grid" style={{ marginTop: 10 }}>
        {profiles.map((p) => (
          <div className="tpl" key={p.name}>
            <div className="body">
              <h3 style={{ marginBottom: 6 }}>{p.name}</h3>
              {p.entries.map((e) => (
                <div key={e.instrument} style={{ marginBottom: 10 }}>
                  <div className="src" style={{ marginBottom: 6 }}>{e.instrument}</div>
                  {e.dims.map((d) => {
                    const pct = d.mean == null ? 0 : Math.round((d.mean / e.max) * 100);
                    return (
                      <div className="svdim" key={d.key}>
                        <div className="svdim-top"><span className="svdim-label">{d.label}</span><span className="svdim-val">{d.mean == null ? "· · ·" : `${d.mean.toFixed(1)} / ${e.max}`}</span></div>
                        <div className="svtrack"><div className="svfill" style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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
