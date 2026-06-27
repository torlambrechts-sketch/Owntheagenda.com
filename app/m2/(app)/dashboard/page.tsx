import Link from "next/link";
import {
  Flame,
  Users,
  Sparkles,
  Send,
  Lock,
  Plus,
  ClipboardCheck,
  Presentation,
  CircleDot,
  TrendingUp,
  Compass,
} from "lucide-react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeam } from "@/lib/m2/context";
import { getScorecard } from "@/lib/m2/scorecard";
import { levelProgress, type JourneyLevel } from "@/lib/m2/journey";
import { isManagerOrAbove } from "@/lib/util";
import { Icon } from "@/components/m2/Icon";
import { startCycle } from "./actions";

export default async function M2Dashboard() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;
  const canManage = isManagerOrAbove(ctx.role);
  const team = await getActiveTeam(supabase, ctx);

  const firstName = (ctx.profile?.full_name || ctx.profile?.display_name || "there").split(/\s+/)[0];

  // ----- no team yet → onboarding nudge -----
  if (!team) {
    return (
      <div>
        <div className="m2-page-head">
          <div>
            <div className="m2-eyebrow">Welcome</div>
            <h1 className="m2-title">Good to see you, {firstName}</h1>
          </div>
        </div>
        <div className="m2-empty">
          <Compass />
          <b>Set up your first team</b>
          <p>
            MAIN2 organizes everything around a team and its measurement cycles. Create a team to
            start your first cycle.
          </p>
          <Link className="m2-btn" href="/m2/onboarding">
            Start onboarding <Plus size={15} />
          </Link>
        </div>
      </div>
    );
  }

  // ----- gather everything in parallel -----
  const [
    memberCountRes,
    journeyRes,
    levelsRes,
    cycleRes,
    earnedRes,
    allMilestonesRes,
    workshopsRes,
    sc,
  ] = await Promise.all([
    supabase.from("team_member").select("*", { count: "exact", head: true }).eq("team_id", team.id),
    supabase.from("team_journey").select("xp, level, streak, longest_streak").eq("team_id", team.id).maybeSingle(),
    supabase.from("journey_level").select("level, name, min_xp, icon, blurb").order("min_xp", { ascending: true }),
    supabase.from("cycle").select("id, seq, label, season, status, participation_pct").eq("team_id", team.id).order("seq", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("team_milestone").select("milestone:milestone(key, name, description, icon, tint)").eq("team_id", team.id).order("earned_at", { ascending: false }),
    supabase.from("milestone").select("key, name, description, icon, tint, sort").order("sort", { ascending: true }),
    supabase.from("workshop").select("id, title, scheduled_at").eq("team_id", team.id),
    getScorecard(supabase, team.id),
  ]);

  const teamSize = sc.teamSize || (memberCountRes.count ?? 0);
  const journey = journeyRes.data;
  const levels = (levelsRes.data ?? []) as JourneyLevel[];
  const cycle = cycleRes.data;
  const earnedKeys = new Set(
    (earnedRes.data ?? [])
      .map((r) => (r.milestone as unknown as { key: string } | null)?.key)
      .filter(Boolean) as string[],
  );
  const allMilestones = allMilestonesRes.data ?? [];

  // Next scheduled workshop for this team.
  const upcoming = (workshopsRes.data ?? [])
    .filter((w) => w.scheduled_at && new Date(w.scheduled_at) >= new Date(Date.now() - 3600 * 1000))
    .sort((a, b) => +new Date(a.scheduled_at!) - +new Date(b.scheduled_at!))[0];

  // Open vs total actions for this team's workshops.
  const workshopIds = (workshopsRes.data ?? []).map((w) => w.id);
  let openActions = 0;
  let totalActions = 0;
  if (workshopIds.length) {
    const [openRes, totalRes] = await Promise.all([
      supabase.from("action_item").select("*", { count: "exact", head: true }).in("workshop_id", workshopIds).eq("status", "open"),
      supabase.from("action_item").select("*", { count: "exact", head: true }).in("workshop_id", workshopIds),
    ]);
    openActions = openRes.count ?? 0;
    totalActions = totalRes.count ?? 0;
  }

  // Pulse / participation come from the scorecard (definer aggregates that
  // respect pulse_response anonymity), with the cycle's stored % as a fallback.
  const hasPulse = sc.hasData;
  const pulseScore = sc.pulse5;
  const pulseDelta = sc.delta5;
  const responded = sc.responded;
  const participationPct =
    teamSize > 0
      ? Math.round((responded / teamSize) * 100)
      : cycle?.participation_pct != null
        ? Number(cycle.participation_pct)
        : 0;

  const prog = journey ? levelProgress(journey.xp, levels) : null;

  return (
    <div>
      <div className="m2-page-head">
        <div>
          <div className="m2-eyebrow">
            {cycle ? `${cycle.label} · ${cycle.season ?? ""}`.trim() : team.name}
          </div>
          <h1 className="m2-title">Good morning, {firstName}</h1>
        </div>
        {canManage ? (
          <form action={startCycle}>
            <input type="hidden" name="team_id" value={team.id} />
            <input type="hidden" name="cadence_weeks" value={6} />
            <button className="m2-btn" type="submit">
              <Plus size={15} />
              {cycle ? "New cycle" : "Start first cycle"}
            </button>
          </form>
        ) : null}
      </div>

      {/* hero — journey state, or a start prompt */}
      {prog ? (
        <div className="m2-hero">
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Ring pct={prog.pct} level={prog.current.level} />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, marginBottom: 3 }}>
                {prog.current.name}
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", lineHeight: 1.5, marginBottom: 9 }}>
                {prog.next ? (
                  <>
                    {prog.xp} / {prog.next.min_xp} XP to{" "}
                    <b style={{ color: "#9fd3ad", fontWeight: 600 }}>
                      Level {prog.next.level} · {prog.next.name}
                    </b>
                  </>
                ) : (
                  <>Top level reached — {prog.xp} XP and counting</>
                )}
              </div>
              <div style={{ width: 200, maxWidth: "100%", height: 7, borderRadius: 4, background: "rgba(255,255,255,.16)" }}>
                <span style={{ display: "block", width: `${prog.pct}%`, height: "100%", borderRadius: 4, background: "#9fd3ad" }} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Flame size={22} color="#e6b24a" />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
                {journey!.streak}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", lineHeight: 1.45 }}>
              consecutive healthy cycles
              {journey!.longest_streak > journey!.streak ? ` · best ${journey!.longest_streak}` : " — your longest yet"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={20} color="#9fd3ad" />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
                {participationPct}%
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", lineHeight: 1.45 }}>
              participation this cycle — {responded} of {teamSize} responded
            </div>
          </div>
        </div>
      ) : (
        <div className="m2-empty" style={{ marginBottom: 18 }}>
          <Icon name="sprout" size={34} />
          <b>Begin {team.name}&rsquo;s journey</b>
          <p>
            Start a measurement cycle to unlock your team&rsquo;s first milestone. Growth here is
            rewarded by consistency — not high scores.
          </p>
          {canManage ? (
            <form action={startCycle}>
              <input type="hidden" name="team_id" value={team.id} />
              <input type="hidden" name="cadence_weeks" value={6} />
              <button className="m2-btn" type="submit">
                <Plus size={15} /> Start first cycle
              </button>
            </form>
          ) : null}
        </div>
      )}

      {/* KPI row */}
      <div className="m2-grid m2-grid-4">
        <div className="m2-card tight">
          <div className="m2-kpi-head">
            <span>Assessment</span>
            <ClipboardCheck className="" color="var(--green)" />
          </div>
          <div className="m2-kpi-num">
            {responded} <small>/ {teamSize}</small>
          </div>
          <div className="m2-kpi-sub">{hasPulse ? "responses in this cycle" : "no assessment sent yet"}</div>
          <div className="m2-bar">
            <span style={{ width: `${participationPct}%` }} />
          </div>
        </div>

        <div className="m2-card tight">
          <div className="m2-kpi-head">
            <span>Next workshop</span>
            <Presentation color="var(--role)" />
          </div>
          <div className="m2-kpi-num" style={{ fontSize: upcoming ? 20 : 25 }}>
            {upcoming
              ? new Date(upcoming.scheduled_at!).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
              : "—"}
          </div>
          <div className="m2-kpi-sub">{upcoming ? upcoming.title : "nothing scheduled"}</div>
        </div>

        <div className="m2-card tight">
          <div className="m2-kpi-head">
            <span>Open actions</span>
            <CircleDot color="var(--amber)" />
          </div>
          <div className="m2-kpi-num">
            {openActions} <small>of {totalActions}</small>
          </div>
          <div className="m2-kpi-sub">{totalActions - openActions} closed</div>
          <div className="m2-bar">
            <span style={{ width: `${totalActions ? Math.round(((totalActions - openActions) / totalActions) * 100) : 0}%`, background: "var(--amber)" }} />
          </div>
        </div>

        <div className="m2-card tight">
          <div className="m2-kpi-head">
            <span>Team pulse</span>
            <TrendingUp color="var(--green)" />
          </div>
          <div className="m2-kpi-num">
            {pulseScore != null ? pulseScore.toFixed(1) : "—"}{" "}
            {pulseDelta != null ? (
              <small style={{ color: pulseDelta >= 0 ? "var(--green)" : "var(--rust)" }}>
                {pulseDelta >= 0 ? "▲" : "▼"} {Math.abs(pulseDelta).toFixed(1)}
              </small>
            ) : null}
          </div>
          <div className="m2-kpi-sub">psychological safety</div>
        </div>
      </div>

      {/* milestones + next step */}
      <div className="m2-grid" style={{ gridTemplateColumns: "1.5fr 1fr", marginTop: 18 }}>
        <div className="m2-card">
          <div className="m2-sec-head" style={{ margin: "0 0 14px" }}>
            <h2>Milestones earned</h2>
            <Link className="m2-link" href="/m2/team/journey">
              View all {allMilestones.length}
            </Link>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {allMilestones.slice(0, 5).map((m) => {
              const earned = earnedKeys.has(m.key);
              return (
                <div key={m.key} style={{ textAlign: "center", flex: "1 1 80px", minWidth: 72, opacity: earned ? 1 : 0.45 }} title={m.description ?? m.name}>
                  <span
                    style={{
                      display: "inline-flex",
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 7,
                      background: earned ? tintBg(m.tint) : "var(--canvas-2)",
                      border: earned ? `1px solid ${tintBorder(m.tint)}` : "1px dashed var(--line-2)",
                      color: earned ? tintFg(m.tint) : "var(--faint)",
                    }}
                  >
                    {earned ? <Icon name={m.icon} size={22} /> : <Lock size={20} />}
                  </span>
                  <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.3, color: earned ? "var(--ink)" : "var(--muted)" }}>
                    {m.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="m2-card"
          style={{ background: "linear-gradient(135deg,#eef3ec,#fff)", borderColor: "#cfe0d4", display: "flex", flexDirection: "column" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Sparkles size={17} color="var(--green)" />
            <span style={{ fontWeight: 600, fontSize: 15 }}>Your next step</span>
          </div>
          <div style={{ fontSize: 13, color: "#585850", lineHeight: 1.55, marginBottom: "auto" }}>
            {nextStep({ hasCycle: !!cycle, responded, teamSize, openActions, hasPulse })}
          </div>
          <Link className="m2-btn" href={nextStepHref({ hasCycle: !!cycle, responded, teamSize, openActions })} style={{ marginTop: 14, alignSelf: "flex-start" }}>
            <Send size={14} /> {nextStepCta({ hasCycle: !!cycle, responded, teamSize, openActions })}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ----- helpers -----

function nextStep(s: { hasCycle: boolean; responded: number; teamSize: number; openActions: number; hasPulse: boolean }): string {
  if (!s.hasCycle) return "Start your first measurement cycle to set a baseline and unlock the team journey.";
  if (!s.hasPulse) return "Send an assessment to your team to capture this cycle's baseline.";
  if (s.responded < s.teamSize) {
    const missing = s.teamSize - s.responded;
    return `${s.responded} of ${s.teamSize} have responded. A gentle nudge to the remaining ${missing} unlocks Full participation and bonus XP.`;
  }
  if (s.openActions > 0) return `Everyone has responded. Close out the ${s.openActions} open action${s.openActions === 1 ? "" : "s"} to earn "All actions closed".`;
  return "You're all caught up this cycle. Schedule the next workshop to keep the streak alive.";
}

function nextStepCta(s: { hasCycle: boolean; responded: number; teamSize: number; openActions: number }): string {
  if (!s.hasCycle) return "Start a cycle";
  if (s.responded < s.teamSize) return "Send a nudge";
  if (s.openActions > 0) return "Review actions";
  return "Plan a workshop";
}

function nextStepHref(s: { hasCycle: boolean; responded: number; teamSize: number; openActions: number }): string {
  if (!s.hasCycle) return "/m2/dashboard";
  if (s.responded < s.teamSize) return "/m2/assessments";
  if (s.openActions > 0) return "/m2/team";
  return "/m2/workshops";
}

function tintBg(t: string) {
  return { open: "var(--open-bg)", internal: "var(--internal-bg)", interview: "var(--interview-bg)", draft: "var(--draft-bg)", reject: "var(--reject-bg)" }[t] ?? "var(--open-bg)";
}
function tintFg(t: string) {
  return { open: "var(--open-fg)", internal: "var(--internal-fg)", interview: "var(--interview-fg)", draft: "var(--draft-fg)", reject: "var(--reject-fg)" }[t] ?? "var(--open-fg)";
}
function tintBorder(t: string) {
  return { open: "#bcd6c4", internal: "#e6d6a8", interview: "#c4d4e3", draft: "var(--line-2)", reject: "#e8cfca" }[t] ?? "#bcd6c4";
}

function Ring({ pct, level }: { pct: number; level: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const off = c - (c * Math.min(100, Math.max(0, pct))) / 100;
  return (
    <span style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="7" />
        <circle cx="42" cy="42" r={r} fill="none" stroke="#9fd3ad" strokeWidth="7" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 42 42)" />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{level}</span>
        <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(255,255,255,.6)" }}>Level</span>
      </span>
    </span>
  );
}
