import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, initials, ACTIVITY } from "@/lib/util";
import { resolveInstrument } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys } from "@/lib/survey";
import { PHASES, phaseOf } from "../../blocks";

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
const BAND_VARS = ["var(--rust)", "var(--amber)", "var(--green)"] as const;

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

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "draft" },
  scheduled: { label: "Scheduled", cls: "internal" },
  live: { label: "Running", cls: "open" },
  ended: { label: "Finished", cls: "draft" },
  done: { label: "Finished", cls: "draft" },
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
    .select("id, title, status, team_id, workspace_id, scheduled_at, objective, objectives, created_by")
    .eq("id", params.id)
    .maybeSingle();
  if (!workshop || workshop.workspace_id !== ctx.workspace.id) notFound();

  const { data: team } = await supabase
    .from("team")
    .select("name, lead_user_id")
    .eq("id", workshop.team_id)
    .maybeSingle();
  const canManage = isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

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

  const st = STATUS_PILL[workshop.status] ?? { label: workshop.status, cls: "draft" };
  const sched = fmtDate(workshop.scheduled_at);

  // Agenda timeline clock — runs from the scheduled time when set.
  let clock = workshop.scheduled_at ? new Date(workshop.scheduled_at) : null;
  if (clock && isNaN(clock.getTime())) clock = null;

  // Group the agenda into facilitation phases (Open → Diverge → … → Close),
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

  return (
    <div>
      <Link href="/workshops" className="linkbtn" style={{ fontSize: 12 }}>‹ Workshops</Link>

      <div className="a-phead" style={{ marginTop: 8 }}>
        <div>
          <div className="a-pt">{workshop.title}</div>
          <div className="a-ps">
            {team?.name ? `${team.name} · ` : ""}
            {sched ? `${sched} · ` : ""}
            {totalMins ? `${totalMins} min · ` : ""}
            {blockList.length} {blockList.length === 1 ? "step" : "steps"}
            {attendees.length ? ` · ${attendees.length} participants` : ""}
          </div>
        </div>
        <div className="a-pr">
          {/* facilitator ⇄ participant lens */}
          <div className="ov-modetabs">
            <Link className={`ov-modetab${mode === "facilitator" ? " on" : ""}`} href={here}>Facilitator</Link>
            <Link className={`ov-modetab${mode === "participant" ? " on" : ""}`} href={`${here}?as=participant`}>Participant</Link>
          </div>
          <span className={`pill ${st.cls}`}>{st.label}</span>
          {mode === "facilitator" ? (
            <>
              {canManage ? <Link className="btn-sec" href={`/workshops/${workshop.id}`}>✎ Edit</Link> : null}
              {canManage ? <Link className="btn-prim" href={`/run/${workshop.id}`}>▶ Run session</Link> : null}
            </>
          ) : (
            <a className="btn-prim" href={calHref} target="_blank" rel="noopener noreferrer">＋ RSVP · Add to calendar</a>
          )}
        </div>
      </div>

      {/* Participant welcome — only in the participant lens. */}
      {mode === "participant" ? (
        <div className="ov-host">
          <span className="av sm green">{initials(hostName)}</span>
          <div>
            <div className="ov-host-by"><span className="muted">Hosted by</span> <strong>{hostName}</strong></div>
            <div className="ov-host-blurb">You’re invited to this session. Here’s what we’ll cover and how to prepare — no pre-work required beyond showing up ready to think together.</div>
          </div>
        </div>
      ) : null}

      {/* Objectives — structured list, shown in both lenses. */}
      {objectives.length ? (
        <div className="a-ovcard" style={{ marginBottom: 18 }}>
          <h3>{objectives.length > 1 ? "Objectives" : "Objective"}</h3>
          <div className="ov-objlist">
            {objectives.map((o, i) => (
              <div className="ov-obj" key={i}>
                <span className="ov-obj-check" aria-hidden>✓</span>
                <span>{o}</span>
              </div>
            ))}
          </div>
        </div>
      ) : mode === "facilitator" && canManage ? (
        <div className="a-note" style={{ marginBottom: 18 }}>
          No objectives set yet. <Link className="linkbtn" href={`/workshops/${workshop.id}`}>Add them in the builder ›</Link>
        </div>
      ) : null}

      {/* Results stats row (Workshop App handoff) — all derived from real data. */}
      {(attendees.length || actions.length || assessment) ? (
        <div className="wk-kpis" style={{ marginTop: 0 }}>
          <div className="wk-kpi">
            <div className="wk-kpi-v">{attendees.length}</div>
            <div className="wk-kpi-l">Participation</div>
            <div className="wk-kpi-s">{attendees.length ? "in the room" : "not run yet"}</div>
          </div>
          <div className="wk-kpi">
            <div className="wk-kpi-v">{actions.length}</div>
            <div className="wk-kpi-l">Action items</div>
            <div className="wk-kpi-s">{actions.filter((a) => a.done).length} done</div>
          </div>
          <div className="wk-kpi">
            <div className="wk-kpi-v">{blockList.length}</div>
            <div className="wk-kpi-l">Agenda steps</div>
            <div className="wk-kpi-s">{totalMins} min planned</div>
          </div>
          <div className="wk-kpi">
            <div className="wk-kpi-v">
              {assessment && assessment.scores.length
                ? (assessment.scores.reduce((s, x) => s + x.mean, 0) / assessment.scores.length).toFixed(1)
                : "—"}
            </div>
            <div className="wk-kpi-l">Alignment</div>
            <div className="wk-kpi-s">
              {assessment && assessment.scores.length
                ? assessment.belowCount
                  ? `${assessment.belowCount} below band`
                  : "all in band"
                : "no assessment"}
            </div>
          </div>
        </div>
      ) : null}

      <div className="wsd-grid">
        <div className="wsd-main">
          {/* From the assessment */}
          {assessment ? (
            <div className="a-ovcard">
              <h3>From the assessment</h3>
              <p style={{ marginBottom: assessment.scores.length ? 14 : 0 }}>
                Framed by <strong>{assessment.name}</strong>.{" "}
                {assessment.scores.length
                  ? assessment.belowCount
                    ? `${assessment.belowCount} ${assessment.belowCount === 1 ? "section is" : "sections are"} below the healthy band — the focus for this session.`
                    : "All sections sit in or above the healthy band."
                  : assessment.masked
                    ? "Results stay hidden until enough people respond — they will frame the session once unmasked."
                    : "No responses yet."}
              </p>
              {assessment.scores.map((s) => (
                <div className="as-scorerow" key={s.key}>
                  <span className="as-scorename">{s.label}</span>
                  <span className="as-scoretrack"><span className="as-scorefill" style={{ width: `${s.pct.toFixed(0)}%`, background: BAND_VARS[s.band] }} /></span>
                  <span className="as-scoreval" style={{ color: BAND_VARS[s.band] }}>{s.mean.toFixed(1)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Agenda — grouped by facilitation phase */}
          <div className="a-ovcard">
            <h3>Agenda {blockList.length ? <span style={{ fontWeight: 500, color: "var(--faint)" }}>· {blockList.length} blocks · {totalMins} min</span> : null}</h3>
            {blockList.length ? (
              <div className="ov-phases">
                {phaseGroups.map((g) => (
                  <div className="ov-phase" key={g.key}>
                    <div className="ov-phase-h">
                      <span className="tpl-phase-dot" style={{ background: g.accent }} />
                      <span className="ov-phase-t">{g.label}</span>
                      <span className="ov-phase-m">{g.items.length} · {g.mins}m</span>
                    </div>
                    <div className="wsd-timeline">
                      {g.items.map((b) => {
                        const label = ACTIVITY[b.activity_type]?.label ?? b.activity_type;
                        const startStr = clock ? fmtClock(clock) : null;
                        if (clock) clock = new Date(clock.getTime() + (b.duration ?? 0) * 60000);
                        return (
                          <div className="wsd-step" key={b.id}>
                            <span className="wsd-dot" />
                            <div className="wsd-step-body">
                              <div className="wsd-step-h">
                                <span className="wsd-step-t">{b.title}</span>
                                <span className="wsd-step-meta">
                                  {label}{b.duration ? ` · ${b.duration}m` : ""}{startStr ? ` · ${startStr}` : ""}
                                  {b.owner_name ? ` · ${b.owner_name}` : ""}
                                </span>
                              </div>
                              {b.prompt ? <div className="wsd-step-p">{b.prompt}</div> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No steps yet. {canManage ? <Link className="linkbtn" href={`/workshops/${workshop.id}`}>Add steps in the builder ›</Link> : null}</p>
            )}
          </div>

          {/* Output captured — facilitator lens only */}
          {mode === "facilitator" ? (
            <div className="a-ovcard">
              <h3>Output — measures captured {actions.length ? <span style={{ fontWeight: 500, color: "var(--faint)" }}>· {actions.length}</span> : null}</h3>
              {actions.length ? (
                <table className="tbl">
                  <thead>
                    <tr><th>Measure</th><th style={{ width: 150 }}>Owner</th><th style={{ width: 120 }}>Due</th><th style={{ width: 90 }}>Status</th></tr>
                  </thead>
                  <tbody>
                    {actions.map((a) => (
                      <tr key={a.id}>
                        <td>{a.text}</td>
                        <td style={{ color: "var(--muted)" }}>{a.owner ?? "—"}</td>
                        <td style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(a.due) ?? "—"}</td>
                        <td><span className={`pill sm ${a.done ? "open" : "draft"}`}>{a.done ? "Done" : "Open"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No measures captured yet — they appear here as the team agrees actions during the session.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="wsd-aside">
          {/* How to prepare — participant lens only */}
          {mode === "participant" ? (
            <div className="a-ovcard">
              <h3>How to prepare</h3>
              <div className="ov-prep">
                <div className="ov-prep-row"><span className="ov-obj-check" aria-hidden>✓</span><span>Block the full {totalMins ? `${totalMins} min` : "session"} — we start on time.</span></div>
                <div className="ov-prep-row"><span className="ov-obj-check" aria-hidden>✓</span><span>Come ready to speak candidly — what’s said here stays here.</span></div>
                <div className="ov-prep-row"><span className="ov-obj-check" aria-hidden>✓</span><span>Think about the objectives above before we meet.</span></div>
              </div>
            </div>
          ) : null}

          {/* Attendees */}
          <div className="a-ovcard">
            <h3>{mode === "participant" ? "Who’s coming" : "Attendees"} {attendees.length ? <span style={{ fontWeight: 500, color: "var(--faint)" }}>· {attendees.length}</span> : null}</h3>
            {attendees.length ? (
              <div className="wsd-att">
                {attendees.map((p, i) => (
                  <div className="wsd-att-row" key={i}>
                    <span className="av sm green">{initials(p.name)}</span>
                    <span className="wsd-att-nm">{p.name}</span>
                    {p.isFacilitator ? <span className="pill sm internal">Facilitator</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No one has joined a session yet.</p>
            )}
          </div>

          {/* Activity log — facilitator lens only */}
          {mode === "facilitator" && activity.length ? (
            <div className="a-ovcard">
              <h3>Activity</h3>
              <div className="wsd-log">
                {activity.map((e) => (
                  <div className="wsd-log-row" key={e.id}>
                    <span className="wsd-log-dot" />
                    <div>
                      <div className="wsd-log-l">{e.label}</div>
                      <div className="wsd-log-m">{e.actor} · {fmtWhen(e.at)}</div>
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
