import Link from "next/link";
import { Users, Flame, Trophy, ArrowRight, CircleDot, Compass } from "lucide-react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeam } from "@/lib/m2/context";
import { levelProgress, type JourneyLevel } from "@/lib/m2/journey";
import { getScorecard } from "@/lib/m2/scorecard";
import { initials } from "@/lib/util";
import { Icon } from "@/components/m2/Icon";

export default async function M2Team() {
  const ctx = await requireSession();
  const supabase = createClient();
  const team = await getActiveTeam(supabase, ctx);

  if (!team) {
    return (
      <div>
        <div className="m2-page-head">
          <div>
            <div className="m2-eyebrow">Team</div>
            <h1 className="m2-title">Your team</h1>
          </div>
        </div>
        <div className="m2-empty">
          <Compass />
          <b>No team yet</b>
          <p>Set up a team to see its members, journey and scorecard in one place.</p>
          <Link className="m2-btn" href="/m2/onboarding">Set up a team</Link>
        </div>
      </div>
    );
  }

  const [membersRes, journeyRes, levelsRes, earnedRes, allMsRes, sc, lead] = await Promise.all([
    supabase
      .from("team_member")
      .select("id, user_id, role_title, is_lead")
      .eq("team_id", team.id),
    supabase.from("team_journey").select("xp, level, streak, longest_streak").eq("team_id", team.id).maybeSingle(),
    supabase.from("journey_level").select("level, name, min_xp, icon, blurb").order("min_xp", { ascending: true }),
    supabase.from("team_milestone").select("milestone:milestone(key)").eq("team_id", team.id),
    supabase.from("milestone").select("key", { count: "exact", head: true }),
    getScorecard(supabase, team.id),
    supabase.from("team").select("lead_user_id").eq("id", team.id).maybeSingle(),
  ]);

  // team_member.user_id references auth.users (no FK to profile), so profiles
  // are fetched separately and joined in app code.
  const memberRows = membersRes.data ?? [];
  const userIds = memberRows.map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", userIds)
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const members = memberRows.map((m) => {
    const u = profById.get(m.user_id);
    return {
      id: m.id,
      name: u?.full_name || u?.display_name || u?.email || "Member",
      role: m.role_title,
      isLead: m.is_lead,
    };
  });
  const journey = journeyRes.data;
  const levels = (levelsRes.data ?? []) as JourneyLevel[];
  const prog = journey ? levelProgress(journey.xp, levels) : null;
  const earnedCount = (earnedRes.data ?? []).length;
  const totalMs = allMsRes.count ?? 0;

  const topRisks = sc.dynamics.filter((d) => d.status === "watch").slice(0, 2);

  return (
    <div>
      <div className="m2-page-head">
        <div>
          <div className="m2-eyebrow">Team</div>
          <h1 className="m2-title">{team.name}</h1>
          <p className="m2-sub">{members.length} member{members.length === 1 ? "" : "s"} · one place for people, journey and health</p>
        </div>
      </div>

      {/* journey + health summary */}
      <div className="m2-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 4 }}>
        <Link href="/m2/team/journey" className="m2-card m2-card-link">
          <div className="m2-sec-head" style={{ margin: "0 0 12px" }}>
            <h2>Journey</h2>
            <span className="m2-link">View all <ArrowRight size={12} style={{ verticalAlign: "-1px" }} /></span>
          </div>
          {prog ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--open-bg)", color: "var(--green)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={prog.current.icon} size={24} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Level {prog.current.level} · {prog.current.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "2px 0 8px" }}>
                  {prog.next ? `${prog.xp} / ${prog.next.min_xp} XP` : `${prog.xp} XP · max level`}
                </div>
                <div className="m2-bar" style={{ marginTop: 0 }}><span style={{ width: `${prog.pct}%` }} /></div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
                  <Flame size={16} color="#e6b24a" />
                  <b style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>{journey!.streak}</b>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>streak</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13 }}>
              <Icon name="sprout" size={20} /> Start a cycle to begin the journey.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 14, fontSize: 12.5, color: "var(--muted)" }}>
            <Trophy size={14} color="var(--amber)" /> {earnedCount} of {totalMs} milestones earned
          </div>
        </Link>

        <Link href="/m2/insights" className="m2-card m2-card-link">
          <div className="m2-sec-head" style={{ margin: "0 0 12px" }}>
            <h2>Health</h2>
            <span className="m2-link">Scorecard <ArrowRight size={12} style={{ verticalAlign: "-1px" }} /></span>
          </div>
          {sc.hasData ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600 }}>{sc.overall}</span>
                {sc.delta != null ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: sc.delta >= 0 ? "var(--green)" : "var(--rust)" }}>
                    {sc.delta >= 0 ? "▲" : "▼"} {Math.abs(sc.delta)}
                  </span>
                ) : null}
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>health index</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
                {(topRisks.length ? topRisks : sc.dynamics.slice(0, 2)).map((d) => (
                  <div key={d.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span>{d.label}</span>
                    <span className={`m2-pill ${d.status === "watch" ? "reject" : "open"}`}>{d.score ?? "—"}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13 }}>
              <CircleDot size={18} /> No assessment results yet.
            </div>
          )}
        </Link>
      </div>

      {/* members */}
      <div className="m2-sec-head">
        <h2>Members</h2>
        <Link className="m2-link" href="/m2/onboarding">Invite people</Link>
      </div>
      {members.length === 0 ? (
        <div className="m2-empty">
          <Users />
          <b>No members yet</b>
          <p>Invite colleagues to take the assessment and join {team.name}.</p>
          <Link className="m2-btn" href="/m2/onboarding">Invite people</Link>
        </div>
      ) : (
        <div className="m2-card" style={{ padding: 0 }}>
          {members.map((m) => (
            <div className="m2-mem" key={m.id}>
              <span className="m2-mem-av">{initials(m.name)}</span>
              <div className="m2-mem-main">
                <div className="m2-mem-name">{m.name}</div>
                <div className="m2-mem-role">{m.role ?? "Member"}</div>
              </div>
              {m.isLead ? <span className="m2-pill open">Team lead</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
