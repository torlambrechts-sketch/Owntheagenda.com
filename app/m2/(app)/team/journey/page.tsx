import Link from "next/link";
import { ArrowLeft, Flame, Trophy, Lock } from "lucide-react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeam } from "@/lib/m2/context";
import { levelProgress, type JourneyLevel } from "@/lib/m2/journey";
import { Icon } from "@/components/m2/Icon";

function tintBg(t: string) {
  return { open: "var(--open-bg)", internal: "var(--internal-bg)", interview: "var(--interview-bg)", draft: "var(--draft-bg)", reject: "var(--reject-bg)" }[t] ?? "var(--open-bg)";
}
function tintFg(t: string) {
  return { open: "var(--open-fg)", internal: "var(--internal-fg)", interview: "var(--interview-fg)", draft: "var(--draft-fg)", reject: "var(--reject-fg)" }[t] ?? "var(--open-fg)";
}

export default async function M2Journey() {
  const ctx = await requireSession();
  const supabase = createClient();
  const team = await getActiveTeam(supabase, ctx);

  if (!team) {
    return (
      <div>
        <Back />
        <div className="m2-empty">
          <Trophy />
          <b>No team journey yet</b>
          <p>Create a team and start a cycle to begin earning milestones.</p>
          <Link className="m2-btn" href="/m2/onboarding">Get started</Link>
        </div>
      </div>
    );
  }

  const [journeyRes, levelsRes, earnedRes, allMsRes] = await Promise.all([
    supabase.from("team_journey").select("xp, level, streak, longest_streak").eq("team_id", team.id).maybeSingle(),
    supabase.from("journey_level").select("level, name, min_xp, icon, blurb").order("min_xp", { ascending: true }),
    supabase.from("team_milestone").select("milestone:milestone(key), earned_at").eq("team_id", team.id),
    supabase.from("milestone").select("key, name, description, icon, tint, xp_reward, sort").order("sort", { ascending: true }),
  ]);

  const journey = journeyRes.data;
  const levels = (levelsRes.data ?? []) as JourneyLevel[];
  const prog = journey ? levelProgress(journey.xp, levels) : levelProgress(0, levels);
  const earned = new Set(
    (earnedRes.data ?? []).map((r) => (r.milestone as unknown as { key: string } | null)?.key).filter(Boolean) as string[],
  );
  const milestones = allMsRes.data ?? [];

  return (
    <div>
      <Back />
      <div className="m2-page-head">
        <div>
          <div className="m2-eyebrow">{team.name} · Team journey</div>
          <h1 className="m2-title">Level {prog.current.level} · {prog.current.name}</h1>
          <p className="m2-sub">{prog.current.blurb ?? "Growth is rewarded by consistency, not high scores."}</p>
        </div>
      </div>

      {/* progress hero */}
      <div className="m2-hero" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", marginBottom: 8 }}>
            {prog.next ? (
              <>
                {prog.xp} / {prog.next.min_xp} XP to{" "}
                <b style={{ color: "#9fd3ad" }}>Level {prog.next.level} · {prog.next.name}</b>
              </>
            ) : (
              <>Top level reached — {prog.xp} XP</>
            )}
          </div>
          <div style={{ height: 9, borderRadius: 5, background: "rgba(255,255,255,.16)", maxWidth: 420 }}>
            <span style={{ display: "block", width: `${prog.pct}%`, height: "100%", borderRadius: 5, background: "#9fd3ad" }} />
          </div>
          {/* level ladder */}
          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            {levels.map((l) => {
              const reached = (journey?.xp ?? 0) >= l.min_xp;
              return (
                <div key={l.level} title={`${l.name} · ${l.min_xp} XP`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: reached ? 1 : 0.4 }}>
                  <span style={{ width: 38, height: 38, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: reached ? "rgba(159,211,173,.22)" : "rgba(255,255,255,.08)", color: reached ? "#9fd3ad" : "rgba(255,255,255,.6)", border: l.level === prog.current.level ? "2px solid #9fd3ad" : "none" }}>
                    <Icon name={l.icon} size={18} />
                  </span>
                  <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.7)" }}>{l.name}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Flame size={26} color="#e6b24a" />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, lineHeight: 1 }}>{journey?.streak ?? 0}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>current streak · best {journey?.longest_streak ?? 0}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Trophy size={24} color="#9fd3ad" />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, lineHeight: 1 }}>
                {earned.size}<span style={{ fontSize: 15, color: "rgba(255,255,255,.6)" }}> / {milestones.length}</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>milestones earned</div>
            </div>
          </div>
        </div>
      </div>

      {/* all milestones */}
      <div className="m2-sec-head"><h2>Milestones</h2></div>
      <div className="m2-badges">
        {milestones.map((m) => {
          const got = earned.has(m.key);
          return (
            <div key={m.key} className={`m2-badge-card${got ? "" : " locked"}`}>
              <span className="m2-badge-ic" style={{ background: got ? tintBg(m.tint) : "var(--canvas-2)", color: got ? tintFg(m.tint) : "var(--faint)", border: got ? "none" : "1px dashed var(--line-2)" }}>
                {got ? <Icon name={m.icon} size={24} /> : <Lock size={20} />}
              </span>
              <div className="m2-badge-name">{m.name}</div>
              <div className="m2-badge-desc">{m.description}</div>
              {m.xp_reward > 0 ? (
                <span className="m2-pill draft" style={{ marginTop: 2 }}>+{m.xp_reward} XP</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Back() {
  return (
    <Link href="/m2/team" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", textDecoration: "none", marginBottom: 14 }}>
      <ArrowLeft size={14} /> Back to team
    </Link>
  );
}
