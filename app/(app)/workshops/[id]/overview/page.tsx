import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, initials, ACTIVITY } from "@/lib/util";
import { resolveInstrument } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys } from "@/lib/survey";
import { PHASES, phaseOf } from "../../blocks";
import { Icon, WA, statusVis, catVis, PHASE_VIS, actIcon } from "../../visuals";

// Read-only workshop *overview* — the hub that closes the assessment → workshop
// → run loop. Distinct from the builder (/workshops/[id], edit mode): it shows
// what assessment frames the session, the agenda as a timeline, the output
// captured so far, and who took part. Adapted from the imported design into the
// app's own design language.
//
// Two lenses, switched via ?as=participant: the facilitator view (manage / run)
// and the participant view (how to prepare, RSVP) — same data, framed for the
// reader.

function bandOf(pct: number): 0 | 1 | 2 {
  return pct < 45 ? 0 : pct < 62 ? 1 : 2;
}
// Band → bar colour. Below band reads rust, mid amber, healthy the brand green.
const BAND_COLOR = ["#b8584a", "#a16207", "#3f7d5a"] as const;

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function fmtClock(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function fmtWhen(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
// A Google Calendar "add event" link — the RSVP / add-to-calendar action in the
// participant lens. Carries the title, the scheduled window and the objective.
function calendarUrl(title: string, startIso: string | null, minutes: number, details: string): string {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const params = new URLSearchParams({ text: title });
  if (details) params.set("details", details);
  if (startIso) {
    const start = new Date(startIso);
    if (!isNaN(start.getTime())) {
      const end = new Date(start.getTime() + Math.max(minutes, 30) * 60000);
      const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      params.set("dates", `${z(start)}/${z(end)}`);
    }
  }
  return `${base}&${params.toString()}`;
}

// Human labels for the audit actions surfaced here.
const ACTION_LABEL: Record<string, string> = {
  "workshop.created": "Workshop created",
  "workshop.quickstarted": "Workshop quick-started",
  "workshop.scheduled": "Workshop scheduled",
  "session.started": "Session started",
  "session.completed": "Session completed",
  "assessment.opened": "Assessment opened",
  "assessment.closed": "Assessment closed",
  "pulse.reminded": "Pulse reminder sent",
};

export default async function WorkshopOverviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { as?: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const mode: "facilitator" | "participant" = searchParams.as === "participant" ? "participant" : "facilitator";

  const { data: workshop } = await supabase
    .from("workshop")
    .select("id, title, status, team_id, workspace_id, scheduled_at, objective, objectives, created_by, template_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!workshop || workshop.workspace_id !== ctx.workspace.id) notFound();

  const { data: team } = await supabase
    .from("team")
    .select("name, lead_user_id")
    .eq("id", workshop.team_id)
    .maybeSingle();
  const canManage = isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  // The seeding template — drives the category chip + the "{#CODE} · {template}"
  // sub-line in the header.
  let templateName: string | null = null;
  let category: string | null = null;
  if (workshop.template_id) {
    const { data: tpl } = await supabase
      .from("template")
      .select("name, category")
      .eq("id", workshop.template_id)
      .maybeSingle();
    if (tpl) {
      templateName = tpl.name;
      category = tpl.category;
    }
  }

  // Host = the workshop creator (falls back to the team lead).
  const hostId = workshop.created_by ?? team?.lead_user_id ?? null;
  let hostName = "Your facilitator";
  if (hostId) {
    const { data: hp } = await supabase
      .from("profile")
      .select("full_name, display_name, email")
      .eq("id", hostId)
      .maybeSingle();
    if (hp) hostName = hp.full_name || hp.display_name || hp.email || hostName;
  }

  const { data: blocks } = await supabase
    .from("block")
    .select("id, ord, title, activity_type, duration, prompt, owner_name, phase, survey_id, config")
    .eq("workshop_id", workshop.id)
    .order("ord", { ascending: true });
  const blockList = blocks ?? [];
  const totalMins = blockList.reduce((a, b) => a + (b.duration ?? 0), 0);

  // Ordered, structured objectives (legacy single objective is the fallback).
  const objectives = (workshop.objectives ?? []).length
    ? (workshop.objectives ?? [])
    : workshop.objective
      ? [workshop.objective]
      : [];

  // ----- "From the assessment": the survey that frames this workshop -----
  // The flow engine pins the carried survey onto a step's survey_id; we take the
  // first such step and show its section scores, below-band highlighted.
  const linkedBlock = blockList.find((b) => b.survey_id);
  let assessment: {
    name: string;
    respondents: number;
    masked: boolean;
    scores: { key: string; label: string; mean: number; pct: number; band: 0 | 1 | 2 }[];
    belowCount: number;
  } | null = null;
  if (linkedBlock?.survey_id) {
    const { data: survey } = await supabase
      .from("survey")
      .select("id, name, kind")
      .eq("id", linkedBlock.survey_id)
      .maybeSingle();
    if (survey) {
      const inst = await resolveInstrument(survey.kind as string);
      const { data: res } = await supabase.rpc("survey_results", {
        p_survey: survey.id,
        p_strength_items: inst ? strengthItemKeys(inst) : [],
      });
      const r = res as { respondents: number; masked: boolean; items: { item_key: string; mean: number; n: number }[] } | null;
      let scores: { key: string; label: string; mean: number; pct: number; band: 0 | 1 | 2 }[] = [];
      if (inst && r && !r.masked) {
        const { min, max } = inst.scale;
        scores = dimensionMeans(inst, r.items ?? [])
          .filter((d): d is { key: string; label: string; blurb: string; mean: number } => d.mean != null)
          .map((d) => {
            const pct = ((d.mean - min) / (max - min)) * 100;
            return { key: d.key, label: d.label, mean: d.mean, pct, band: bandOf(pct) };
          });
      }
      assessment = {
        name: inst?.name ?? (survey.name as string) ?? "Assessment",
        respondents: r?.respondents ?? 0,
        masked: r ? r.masked : true,
        scores,
        belowCount: scores.filter((s) => s.band === 0).length,
      };
    }
  }

  // ----- latest session → attendees + captured output (actions) -----
  const { data: session } = await supabase
    .from("session")
    .select("id, status, started_at")
    .eq("workshop_id", workshop.id)
    .eq("is_dry_run", false)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let attendees: { name: string; isFacilitator: boolean }[] = [];
  let actions: { id: string; text: string; owner: string | null; due: string | null; done: boolean }[] = [];
  if (session) {
    const { data: parts } = await supabase
      .from("participant")
      .select("user_id, is_facilitator")
      .eq("session_id", session.id);
    const pids = (parts ?? []).map((p) => p.user_id);
    const { data: profs } = pids.length
      ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", pids)
      : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Member"]));
    attendees = (parts ?? []).map((p) => ({ name: nameById.get(p.user_id) || "Member", isFacilitator: p.is_facilitator }));

    const { data: acts } = await supabase
      .from("action_item")
      .select("id, text, owner_name, due_at, status")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    actions = (acts ?? []).map((a) => ({ id: a.id, text: a.text, owner: a.owner_name, due: a.due_at, done: a.status === "done" }));
  }

  // ----- activity log (audit_log; readable by workspace admins via RLS) -----
  const { data: events } = await supabase
    .from("audit_log")
    .select("id, action, actor_id, metadata, created_at")
    .eq("entity_type", "workshop")
    .eq("entity_id", workshop.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const eventActorIds = Array.from(new Set((events ?? []).map((e) => e.actor_id).filter((x): x is string => !!x)));
  const { data: eventProfs } = eventActorIds.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", eventActorIds)
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const eventNameById = new Map((eventProfs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Someone"]));
  const activity = (events ?? []).map((e) => {
    let label = ACTION_LABEL[e.action] ?? e.action;
    const n = (e.metadata as { measures?: number } | null)?.measures;
    if (e.action === "session.completed" && typeof n === "number") {
      label += ` · ${n} ${n === 1 ? "measure" : "measures"}`;
    }
    return {
      id: e.id,
      label,
      actor: e.actor_id ? eventNameById.get(e.actor_id) ?? "Someone" : "System",
      at: e.created_at as string,
    };
  });

  const st = statusVis(workshop.status);
  const cat = catVis(category);
  const sched = fmtDate(workshop.scheduled_at);

  // Agenda timeline clock — runs from the scheduled time when set.
  let clock = workshop.scheduled_at ? new Date(workshop.scheduled_at) : null;
  if (clock && isNaN(clock.getTime())) clock = null;

  // Group the agenda into facilitation phases (Open → Explore → Decide → Close),
  // preserving block order and carrying the running clock through each block.
  const phaseGroups = PHASES.map((ph) => {
    const items = blockList.filter((b) => ((b.phase as ReturnType<typeof phaseOf> | null) ?? phaseOf(b.activity_type)) === ph.key);
    const mins = items.reduce((a, b) => a + (b.duration ?? 0), 0);
    return { ...ph, items, mins };
  }).filter((g) => g.items.length);

  const calHref = calendarUrl(
    workshop.title,
    workshop.scheduled_at,
    totalMins,
    objectives.length ? `Objectives:\n- ${objectives.join("\n- ")}` : "",
  );

  const here = `/workshops/${workshop.id}/overview`;

  // ----- shared inline-style primitives (WorkshopHome idiom) -----
  const card: React.CSSProperties = {
    background: WA.cardBg,
    border: `1px solid ${WA.cardBorder}`,
    borderRadius: 13,
    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  };
  const cardHead: React.CSSProperties = {
    fontFamily: WA.serif,
    fontSize: 18,
    fontWeight: 600,
    color: WA.ink,
  };
  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    borderRadius: 7,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    cursor: "pointer",
  };
  const btnSec: React.CSSProperties = { ...btnBase, background: "#fff", color: "#404040", border: "1px solid #d4d4d4" };
  const btnPrim: React.CSSProperties = { ...btnBase, background: WA.accent, color: "#fff", border: `1px solid ${WA.accent}` };
  const seg = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 7,
    padding: "7px 13px", fontSize: 12.5, fontWeight: 600, textDecoration: "none", fontFamily: "inherit",
    background: active ? "#fff" : "transparent", color: active ? WA.accent : "#6b6f68",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
  });

  return (
    <div style={{ background: "#f3f1e8", color: WA.ink2, margin: "-24px", padding: 24, minHeight: "100%" }}>
      {/* 1. breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: WA.faint, marginBottom: 14 }}>
        <Link href="/workshops" style={{ color: WA.faint, textDecoration: "none", fontWeight: 600 }}>Workshops</Link>
        <Icon name="ChevronRight" size={13} color={WA.faint2} />
        <span style={{ color: WA.muted }}>{workshop.title}</span>
      </div>

      {/* 2. header row */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: cat.tint, border: `1px solid ${cat.border}`, color: cat.accent }}>
            <Icon name={cat.icon} size={23} color={cat.accent} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
              <h1 style={{ fontFamily: WA.serif, fontSize: 27, fontWeight: 600, color: WA.ink, lineHeight: 1.15, margin: 0 }}>{workshop.title}</h1>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: st.bg, border: `1px solid ${st.border}`, color: st.text }}>
                <span className={st.live ? "wa-pulse" : undefined} style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />{st.label}
              </span>
            </div>
            <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: WA.faint }}>
              <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11.5, color: WA.faint2 }}>#{workshop.id.slice(0, 4).toUpperCase()}</span>
              {templateName ? <><span style={{ color: "#d8d6cd" }}>·</span><span>{templateName}</span></> : null}
              {team?.name ? <><span style={{ color: "#d8d6cd" }}>·</span><span>{team.name}</span></> : null}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* facilitator ⇄ participant lens */}
          <div style={{ display: "inline-flex", gap: 3, padding: 3, background: WA.segBg, borderRadius: 9 }}>
            <Link href={here} style={seg(mode === "facilitator")}>Facilitator</Link>
            <Link href={`${here}?as=participant`} style={seg(mode === "participant")}>Participant</Link>
          </div>

          {mode === "facilitator" ? (
            <>
              {canManage ? <Link href={`/workshops/${workshop.id}`} style={btnSec}><Icon name="SquarePen" size={15} color="#404040" />Edit in builder</Link> : null}
              <Link href={`${here}#prepare`} style={btnSec}><Icon name="ListTodo" size={15} color="#404040" />Preparation</Link>
              <Link href={`${here}#outcome`} style={btnSec}><Icon name="ChartColumnBig" size={15} color="#404040" />Outcome</Link>
              {canManage ? <Link href={`/run/${workshop.id}`} style={btnPrim}><Icon name="Play" size={15} color="#fff" />Enter run</Link> : null}
            </>
          ) : (
            <>
              <Link href={`${here}?as=participant#prepare`} style={btnSec}><Icon name="ListTodo" size={15} color="#404040" />Prepare</Link>
              <a href={calHref} target="_blank" rel="noopener noreferrer" style={btnPrim}><Icon name="CalendarPlus" size={15} color="#fff" />RSVP · Add to calendar</a>
            </>
          )}
        </div>
      </div>

      {/* 3. meta strip */}
      <div style={{ ...card, display: "flex", flexWrap: "wrap", marginBottom: 18 }}>
        {([
          { icon: "Calendar", label: "When", value: sched ?? "Not scheduled" },
          { icon: "Clock", label: "Duration", value: totalMins ? `${totalMins} min` : "—" },
          { icon: "Users", label: "Participants", value: attendees.length ? String(attendees.length) : "—" },
          { icon: "ChartColumnBig", label: "Owner", value: hostName },
        ] as const).map((m, i) => (
          <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 11, flex: "1 1 180px", minWidth: 0, padding: "16px 18px", borderLeft: i === 0 ? "none" : `1px solid ${WA.hair}` }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "#f3f4f1", color: WA.faint }}>
              <Icon name={m.icon} size={17} color={WA.faint} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: WA.faint2 }}>{m.label}</div>
              <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600, color: WA.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 4. two-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "start" }}>
        {/* ---- LEFT: agenda ---- */}
        <div style={{ ...card, padding: "18px 20px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: blockList.length ? 16 : 0 }}>
            <span style={cardHead}>Agenda</span>
            {blockList.length ? (
              <span style={{ fontSize: 13, fontWeight: 500, color: WA.faint2 }}>{blockList.length} blocks · {totalMins} min</span>
            ) : null}
          </div>

          {blockList.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {phaseGroups.map((g) => {
                const pv = PHASE_VIS[g.key] ?? { accent: g.accent, tint: "#f3f4f1", border: "#e8e6df" };
                return (
                  <div key={g.key}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 9, paddingBottom: 11, borderBottom: `1px solid ${WA.hair}`, marginBottom: 11 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: pv.accent, alignSelf: "center", flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: WA.ink2 }}>{g.label}</span>
                      <span style={{ fontSize: 12.5, color: WA.faint2 }}>{g.desc}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: WA.faint, fontVariantNumeric: "tabular-nums" }}>{g.mins} min</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {g.items.map((b) => {
                        const label = ACTIVITY[b.activity_type]?.label ?? b.activity_type;
                        const startStr = clock ? fmtClock(clock) : null;
                        if (clock) clock = new Date(clock.getTime() + (b.duration ?? 0) * 60000);
                        return (
                          <div key={b.id} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: pv.tint, border: `1px solid ${pv.border}`, color: pv.accent }}>
                              <Icon name={actIcon(b.activity_type)} size={15} color={pv.accent} />
                            </span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 600, color: WA.ink, minWidth: 0 }}>{b.title}</span>
                                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: WA.faint, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                                  {b.duration ? `${b.duration}m` : ""}{startStr ? ` · ${startStr}` : ""}
                                </span>
                              </div>
                              <div style={{ marginTop: 1, fontSize: 12, color: WA.faint2 }}>
                                {label}{b.owner_name ? ` · ${b.owner_name}` : ""}
                              </div>
                              {b.prompt ? <div style={{ marginTop: 4, fontSize: 12.5, color: WA.muted, lineHeight: 1.5 }}>{b.prompt}</div> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: WA.faint }}>
              No steps yet. {canManage ? <Link href={`/workshops/${workshop.id}`} style={{ color: WA.accent, fontWeight: 600 }}>Add steps in the builder →</Link> : null}
            </p>
          )}
        </div>

        {/* ---- RIGHT: sidebar ---- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* participant: hosted-by + how to prepare */}
          {mode === "participant" ? (
            <>
              <div style={{ background: WA.accent, borderRadius: 13, padding: "16px 18px", color: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials(hostName)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: "rgba(255,255,255,.65)" }}>Hosted by</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{hostName}</div>
                  </div>
                </div>
                <div style={{ marginTop: 11, fontSize: 12.5, lineHeight: 1.55, color: "rgba(255,255,255,.82)" }}>
                  You’re invited to this session. Here’s what we’ll cover and how to prepare — no pre-work required beyond showing up ready to think together.
                </div>
              </div>

              <div id="prepare" style={{ ...card, padding: "16px 18px", scrollMarginTop: 24 }}>
                <div style={{ ...cardHead, marginBottom: 12 }}>How to prepare</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    `Block the full ${totalMins ? `${totalMins} min` : "session"} — we start on time.`,
                    "Come ready to speak candidly — what’s said here stays here.",
                    "Think about the objectives below before we meet.",
                  ].map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: WA.ink2, lineHeight: 1.5 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "#e7efe9", color: WA.accent, flexShrink: 0, marginTop: 1 }}><Icon name="Check" size={12} color={WA.accent} /></span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {/* facilitator: seeded from assessment */}
          {mode === "facilitator" && assessment ? (
            <div style={{ ...card, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                <Icon name="Scale" size={17} color={WA.accent} />
                <span style={cardHead}>Seeded from assessment</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: WA.ink }}>{assessment.name}</div>
              <p style={{ fontStyle: "italic", fontSize: 12.5, color: WA.muted, lineHeight: 1.5, margin: "4px 0 0" }}>
                {assessment.scores.length
                  ? assessment.belowCount
                    ? `${assessment.belowCount} ${assessment.belowCount === 1 ? "section is" : "sections are"} below the healthy band — the focus for this session.`
                    : "All sections sit in or above the healthy band."
                  : assessment.masked
                    ? "Results stay hidden until enough people respond — they will frame the session once unmasked."
                    : "No responses yet."}
              </p>
              {assessment.scores.length ? (
                <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 11 }}>
                  {assessment.scores.map((s) => (
                    <div key={s.key}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, color: WA.ink2, fontWeight: 500 }}>{s.label}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: BAND_COLOR[s.band], fontVariantNumeric: "tabular-nums" }}>{s.mean.toFixed(1)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "#f0eee8", overflow: "hidden" }}>
                        <div style={{ width: `${s.pct.toFixed(0)}%`, height: "100%", borderRadius: 999, background: BAND_COLOR[s.band] }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* participants */}
          <div style={{ ...card, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: attendees.length ? 12 : 6 }}>
              <span style={cardHead}>{mode === "participant" ? "Who’s coming" : "Participants"}</span>
              {attendees.length ? <span style={{ fontSize: 13, fontWeight: 500, color: WA.faint2 }}>· {attendees.length}</span> : null}
            </div>
            {attendees.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {attendees.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#e7efe9", color: WA.accent, fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{initials(p.name)}</span>
                    <span style={{ fontSize: 13, color: WA.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    {p.isFacilitator ? <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", flexShrink: 0 }}>Facilitator</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: WA.faint2, margin: 0 }}>No one has joined a session yet.</p>
            )}
          </div>

          {/* objectives */}
          {objectives.length ? (
            <div style={{ ...card, padding: "16px 18px" }}>
              <div style={{ ...cardHead, marginBottom: 12 }}>{objectives.length > 1 ? "Objectives" : "Objective"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {objectives.map((o, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: WA.ink2, lineHeight: 1.5 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "#e7efe9", color: WA.accent, flexShrink: 0, marginTop: 1 }}><Icon name="Check" size={12} color={WA.accent} /></span>
                    <span>{o}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : mode === "facilitator" && canManage ? (
            <div style={{ ...card, padding: "16px 18px", fontSize: 12.5, color: WA.muted, lineHeight: 1.5 }}>
              No objectives set yet. <Link href={`/workshops/${workshop.id}`} style={{ color: WA.accent, fontWeight: 600 }}>Add them in the builder →</Link>
            </div>
          ) : null}

          {/* facilitator: outcome so far */}
          {mode === "facilitator" ? (
            <div id="outcome" style={{ ...card, padding: "16px 18px", scrollMarginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: actions.length ? 12 : 6 }}>
                <span style={cardHead}>Outcome so far</span>
                {actions.length ? <span style={{ fontSize: 13, fontWeight: 500, color: WA.faint2 }}>· {actions.length}</span> : null}
              </div>
              {actions.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {actions.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1, background: a.done ? "#dcfce7" : "#f3f4f1", color: a.done ? "#166534" : WA.faint2 }}>
                        <Icon name="Check" size={11} color={a.done ? "#166534" : WA.faint2} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: WA.ink2, lineHeight: 1.4 }}>{a.text}</div>
                        <div style={{ marginTop: 2, fontSize: 11.5, color: WA.faint2 }}>
                          {a.owner ?? "Unassigned"}{a.due ? ` · ${fmtDate(a.due)}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: WA.faint2, margin: 0, lineHeight: 1.5 }}>No measures captured yet — they appear here as the team agrees actions during the session.</p>
              )}
            </div>
          ) : null}

          {/* facilitator: activity log */}
          {mode === "facilitator" && activity.length ? (
            <div style={{ ...card, padding: "16px 18px" }}>
              <div style={{ ...cardHead, marginBottom: 12 }}>Activity</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {activity.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: cat.accent, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: WA.ink2, fontWeight: 500 }}>{e.label}</div>
                      <div style={{ marginTop: 1, fontSize: 11.5, color: WA.faint2 }}>{e.actor} · {fmtWhen(e.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
