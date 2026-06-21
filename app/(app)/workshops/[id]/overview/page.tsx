import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, initials, ACTIVITY } from "@/lib/util";
import { resolveInstrument } from "@/lib/assessments";
import { dimensionMeans, strengthItemKeys } from "@/lib/survey";

// Read-only workshop *overview* — the hub that closes the assessment → workshop
// → run loop. Distinct from the builder (/workshops/[id], edit mode): it shows
// what assessment frames the session, the agenda as a timeline, the output
// captured so far, and who took part. Adapted from the imported design into the
// app's own design language.

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

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "draft" },
  scheduled: { label: "Scheduled", cls: "internal" },
  live: { label: "Running", cls: "open" },
  ended: { label: "Finished", cls: "draft" },
  done: { label: "Finished", cls: "draft" },
};

export default async function WorkshopOverviewPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: workshop } = await supabase
    .from("workshop")
    .select("id, title, status, team_id, workspace_id, scheduled_at, objective")
    .eq("id", params.id)
    .maybeSingle();
  if (!workshop || workshop.workspace_id !== ctx.workspace.id) notFound();

  const { data: team } = await supabase
    .from("team")
    .select("name, lead_user_id")
    .eq("id", workshop.team_id)
    .maybeSingle();
  const canManage = isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  const { data: blocks } = await supabase
    .from("block")
    .select("id, ord, title, activity_type, duration, prompt, survey_id, config")
    .eq("workshop_id", workshop.id)
    .order("ord", { ascending: true });
  const blockList = blocks ?? [];
  const totalMins = blockList.reduce((a, b) => a + (b.duration ?? 0), 0);

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

  const st = STATUS_PILL[workshop.status] ?? { label: workshop.status, cls: "draft" };
  const sched = fmtDate(workshop.scheduled_at);

  // Agenda timeline clock — runs from the scheduled time when set.
  let clock = workshop.scheduled_at ? new Date(workshop.scheduled_at) : null;
  if (clock && isNaN(clock.getTime())) clock = null;

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
          <span className={`pill ${st.cls}`}>{st.label}</span>
          {canManage ? <Link className="btn-sec" href={`/workshops/${workshop.id}`}>✎ Edit</Link> : null}
          {canManage ? <Link className="btn-prim" href={`/run/${workshop.id}`}>▶ Run session</Link> : null}
        </div>
      </div>

      {workshop.objective ? (
        <div className="a-note" style={{ marginBottom: 18 }}>
          <strong>Objective:</strong> {workshop.objective}
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

          {/* Agenda timeline */}
          <div className="a-ovcard">
            <h3>Agenda</h3>
            {blockList.length ? (
              <div className="wsd-timeline">
                {blockList.map((b, i) => {
                  const label = ACTIVITY[b.activity_type]?.label ?? b.activity_type;
                  const startStr = clock ? fmtClock(clock) : null;
                  if (clock) clock = new Date(clock.getTime() + (b.duration ?? 0) * 60000);
                  return (
                    <div className="wsd-step" key={b.id}>
                      {i < blockList.length - 1 ? <span className="wsd-line" /> : null}
                      <span className="wsd-dot" />
                      <div className="wsd-step-body">
                        <div className="wsd-step-h">
                          <span className="wsd-step-t">{b.title}</span>
                          <span className="wsd-step-meta">{label}{b.duration ? ` · ${b.duration}m` : ""}{startStr ? ` · ${startStr}` : ""}</span>
                        </div>
                        {b.prompt ? <div className="wsd-step-p">{b.prompt}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No steps yet. <Link className="linkbtn" href={`/workshops/${workshop.id}`}>Add steps in the builder ›</Link></p>
            )}
          </div>

          {/* Output captured */}
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
        </div>

        {/* Attendees */}
        <div className="wsd-aside">
          <div className="a-ovcard">
            <h3>Attendees {attendees.length ? <span style={{ fontWeight: 500, color: "var(--faint)" }}>· {attendees.length}</span> : null}</h3>
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
        </div>
      </div>
    </div>
  );
}
