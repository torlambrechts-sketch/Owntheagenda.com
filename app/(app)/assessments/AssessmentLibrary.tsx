"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AssessmentRunner } from "@/components/AssessmentRunner";

export type TraitCopy = { definition: string; advantages: string[]; risks: string[]; statements: string[] };
export type CatalogDim = { key: string; label: string; blurb: string; copy?: TraitCopy | null };
export type CatalogItemDef = { key: string; dimension: string; text: string; reverse?: boolean };
export type CatalogItem = {
  key: string;
  name: string;
  category: string;
  scope: "team" | "individual";
  source: string | null;
  description: string | null;
  dimensions: CatalogDim[];
  items: CatalogItemDef[];
  scale: { min: number; max: number; minLabel: string; maxLabel: string };
  mins: number;
  completedByMe: boolean;
  myScores: Record<string, number> | null;
  external: string | null; // route for instruments handled elsewhere (e.g. leadership)
  openSurveyId: string | null; // team scope: an open survey to contribute a response to
  teamReport: { dims: { key: string; mean: number }[]; respondents: number; masked: boolean } | null;
  myHistory: { at: string; scores: Record<string, number> }[]; // individual scope: past takes, oldest first
  myShared: boolean; // individual scope: am I sharing this result with teammates?
  norms: { dimension: string; percentile: number | null; others_n: number }[]; // individual scope: my percentile per dimension vs the global pool
  assignedToMe: { note: string | null; dueAt: string | null } | null; // an admin asked me to take this
};

// Sessions tab: each time a team assessment was run (a survey instance).
export type SessionRow = { id: string; instrument: string; team: string | null; status: string; respondents: number; date: string };
// Responses tab: the current user's own completed assessments.
export type ResponseRow = { key: string; instrument: string; takenAt: string; scope: "individual" | "team" };

type View = "library" | "detail" | "run" | "report";
type LibTab = "assessments" | "sessions" | "responses";
type DimScore = { key: string; label: string; blurb: string; copy: TraitCopy | null; mean: number; pct: number; band: number; n: number };

const BANDS = ["Lower", "Moderate", "Higher"];
function bandOf(pct: number) { return pct < 34 ? 0 : pct < 67 ? 1 : 2; }

// Deterministic sample scores so "View sample report" shows a realistic spread.
function sampleScores(inst: CatalogItem): DimScore[] {
  const { min, max } = inst.scale;
  return inst.dimensions.map((d, i) => {
    const mean = min + ((i * 2 + 2) % (max - min + 1)) + (i % 2 ? 0.4 : 0.7);
    const m = Math.min(max, Math.max(min, mean));
    const pct = ((m - min) / (max - min)) * 100;
    return { key: d.key, label: d.label, blurb: d.blurb, copy: d.copy ?? null, mean: m, pct, band: bandOf(pct), n: 0 };
  });
}
function scoreFrom(inst: CatalogItem, answers: Record<string, number>): DimScore[] {
  const { min, max } = inst.scale;
  return inst.dimensions.map((d) => {
    const its = inst.items.filter((it) => it.dimension === d.key);
    // Reverse-keyed items are flipped onto the dimension's pole before averaging.
    const vals = its
      .map((it) => (answers[it.key] == null ? null : it.reverse ? min + max - answers[it.key] : answers[it.key]))
      .filter((v): v is number => v != null);
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : min;
    const pct = ((mean - min) / (max - min)) * 100;
    return { key: d.key, label: d.label, blurb: d.blurb, copy: d.copy ?? null, mean, pct, band: bandOf(pct), n: vals.length };
  });
}
function scoreFromAggregate(inst: CatalogItem): DimScore[] {
  const { min, max } = inst.scale;
  const dims = inst.teamReport?.dims ?? [];
  return inst.dimensions.map((d) => {
    const mean = dims.find((x) => x.key === d.key)?.mean ?? min;
    const pct = ((mean - min) / (max - min)) * 100;
    return { key: d.key, label: d.label, blurb: d.blurb, copy: d.copy ?? null, mean, pct, band: bandOf(pct), n: 0 };
  });
}
function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function bandSentence(label: string, band: number) {
  if (band === 2) return `${label} sits in the higher band — it shows up readily and is likely a defining strength.`;
  if (band === 0) return `${label} sits in the lower band — it shows up less, which can be a deliberate choice or a growth edge.`;
  return `${label} sits in the moderate band — present and balanced, drawn on when the situation calls for it.`;
}

export function AssessmentLibrary({
  workspaceId,
  catalog,
  userName,
  isAdmin = false,
  members = [],
  sessions = [],
  responses = [],
}: {
  workspaceId: string;
  catalog: CatalogItem[];
  userName: string;
  isAdmin?: boolean;
  members?: { id: string; name: string }[];
  sessions?: SessionRow[];
  responses?: ResponseRow[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>("library");
  const [libTab, setLibTab] = useState<LibTab>("assessments");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [scores, setScores] = useState<DimScore[]>([]);
  const [sample, setSample] = useState(false);
  const [teamMode, setTeamMode] = useState(false);
  const [mode, setMode] = useState<"admin" | "candidate">("admin");
  const [exp, setExp] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [sharedKeys, setSharedKeys] = useState<Set<string>>(() => new Set(catalog.filter((c) => c.myShared).map((c) => c.key)));
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSel, setAssignSel] = useState<Set<string>>(new Set());
  const [assignNote, setAssignNote] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignStatus, setAssignStatus] = useState<{ assignee_user_id: string; completed: boolean }[]>([]);

  const active = catalog.find((c) => c.key === activeKey) ?? null;
  const personality = catalog.filter((c) => c.scope === "individual");
  const team = catalog.filter((c) => c.scope === "team");
  const assignedToMe = catalog.filter((c) => c.assignedToMe && !c.completedByMe);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2600); }
  function go(v: View) { setView(v); if (typeof window !== "undefined") window.scrollTo(0, 0); }
  function openDetail(c: CatalogItem) {
    // External instruments (e.g. the 63-item leadership inventory) keep their
    // purpose-built run/report, but still open a consistent in-library detail
    // that hands off — rather than bouncing straight out of the library.
    setActiveKey(c.key); setExp(new Set()); setAssignOpen(false); go("detail");
  }
  function startRun() { go("run"); }
  function viewSample() { if (!active) return; setSample(true); setTeamMode(false); setScores(sampleScores(active)); setMode("admin"); setExp(new Set()); go("report"); }
  function viewMine(c: CatalogItem) { setSample(false); setTeamMode(false); setScores(scoreFrom(c, c.myScores!)); setMode("candidate"); setExp(new Set()); go("report"); }
  function viewTeam(c: CatalogItem) { setSample(false); setTeamMode(true); setScores(scoreFromAggregate(c)); setMode("admin"); setExp(new Set()); go("report"); }

  async function finishRun(answers: Record<string, number>) {
    if (!active) return;
    // Team instruments contribute to the team's open survey; individual ones
    // persist a personal response.
    const { error } = active.scope === "team" && active.openSurveyId
      ? await supabase.rpc("submit_survey_response", { p_survey: active.openSurveyId, p_scores: answers })
      : await supabase.rpc("submit_individual_response", { p_workspace: workspaceId, p_template_key: active.key, p_scores: answers });
    if (error) { flash(error.message); throw error; }
    setSample(false); setTeamMode(false); setScores(scoreFrom(active, answers)); setMode("candidate"); setExp(new Set());
    go("report");
    flash(active.scope === "team" && active.openSurveyId ? "Your response is in — the team report builds as members complete it" : "Saved — your report is ready");
  }

  async function toggleShare(c: CatalogItem) {
    const next = !sharedKeys.has(c.key);
    setSharedKeys((p) => { const n = new Set(p); next ? n.add(c.key) : n.delete(c.key); return n; });
    const { error } = await supabase.rpc("set_individual_shared", { p_workspace: workspaceId, p_template_key: c.key, p_shared: next });
    if (error) {
      setSharedKeys((p) => { const n = new Set(p); next ? n.delete(c.key) : n.add(c.key); return n; }); // revert
      flash(error.message);
      return;
    }
    flash(next ? "Shared — teammates can now see this result" : "Sharing turned off");
  }

  async function openAssign(c: CatalogItem) {
    setAssignOpen(true); setAssignNote(""); setAssignStatus([]); setAssignSel(new Set());
    const { data } = await supabase.rpc("assessment_assignment_status", { p_workspace: workspaceId, p_template_key: c.key });
    const rows = (data ?? []) as { assignee_user_id: string; completed: boolean }[];
    setAssignStatus(rows);
    setAssignSel(new Set(rows.map((r) => r.assignee_user_id))); // preselect the already-assigned
  }

  async function submitAssign() {
    if (!active) return;
    setAssignBusy(true);
    const sel = Array.from(assignSel);
    const toRemove = assignStatus.map((r) => r.assignee_user_id).filter((id) => !assignSel.has(id));
    let err: string | null = null;
    if (sel.length) {
      const { error } = await supabase.rpc("assign_assessment", { p_workspace: workspaceId, p_template_key: active.key, p_assignees: sel, p_note: assignNote.trim() || null, p_due: null });
      if (error) err = error.message;
    }
    for (const id of toRemove) {
      const { error } = await supabase.rpc("unassign_assessment", { p_workspace: workspaceId, p_template_key: active.key, p_assignee: id });
      if (error) err = error.message;
    }
    setAssignBusy(false);
    if (err) { flash(err); return; }
    setAssignOpen(false);
    flash(sel.length ? `Assigned to ${sel.length} ${sel.length === 1 ? "person" : "people"}` : "Assignments cleared");
  }

  // Self-contained printable report → browser print dialog (Save as PDF).
  function exportReport() {
    if (!active) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));
    const who = sample ? "Sample profile" : teamMode ? `${active.name} · team` : userName;
    const rows = scores.map((s) => {
      const lists = [
        s.copy?.advantages?.length ? `<div class="lbl">Where it helps</div><ul>${s.copy.advantages.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "",
        !cand && s.copy?.risks?.length ? `<div class="lbl">Watch-outs</div><ul>${s.copy.risks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "",
      ].join("");
      return `<div class="dim"><div class="dh"><span class="nm">${esc(s.label)}</span><span class="bd">${BANDS[s.band]}${cand ? "" : ` · ${s.mean.toFixed(1)}`}</span></div>
        <p class="df">${esc(s.copy?.definition || s.blurb)}</p><p class="rd">${esc(bandSentence(s.label, s.band))}</p>${lists}</div>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(active.name)} — report</title>
<style>body{font-family:Georgia,'Times New Roman',serif;color:#1f2421;margin:48px;line-height:1.55}
h1{font-size:24px;margin:0 0 2px}.meta{color:#6b726c;font-size:13px;margin-bottom:24px}
.dim{padding:14px 0;border-top:1px solid #e3e6e2}.dh{display:flex;justify-content:space-between;align-items:baseline}
.nm{font-size:16px;font-weight:600}.bd{color:#3f5b48;font-size:13px}.df{margin:6px 0 4px}.rd{color:#4b524c;margin:0 0 6px}
.lbl{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#7a817b;margin:8px 0 2px}
ul{margin:0 0 6px 18px;padding:0}li{margin:2px 0}.foot{color:#7a817b;font-size:12px;margin-top:22px;border-top:1px solid #e3e6e2;padding-top:10px}</style>
</head><body><h1>${esc(active.name)}</h1><div class="meta">${esc(who)} · ${fmtDate(new Date().toISOString())}</div>${rows}
<div class="foot">${active.source ? `Based on ${esc(active.source)} · ` : ""}Scale ${active.scale.min}–${active.scale.max} · ${active.dimensions.length} dimensions${cand ? " · personal view" : ""}</div>
<script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) { flash("Allow pop-ups to export"); return; }
    w.document.write(html); w.document.close();
  }

  // ---------- library ----------
  const card = (c: CatalogItem) => (
    <button className={`a-card${c.scope === "team" ? " team" : ""}`} key={c.key} onClick={() => openDetail(c)}>
      <span className="a-aicon">
        {c.scope === "team" ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 19v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        )}
      </span>
      <div>
        <div className="a-anm">{c.name}</div>
        <div className="a-acat">{c.category}</div>
      </div>
      <div className="a-ameta">
        <span>◇ {c.dimensions.length} {c.dimensions.length === 1 ? "dimension" : "dimensions"}</span>
        {c.items.length ? <span>◷ ~{c.mins} min</span> : null}
        {c.completedByMe ? <span className="a-done-tag">✓ Completed</span> : null}
        {c.assignedToMe && !c.completedByMe ? <span className="a-assign-tag">★ Assigned to you</span> : null}
      </div>
    </button>
  );

  if (view === "library") {
    return (
      <>
        <div className="a-phead">
          <div>
            <div className="a-pt">Assessments</div>
            <div className="a-ps">Personality and team assessments you can run inside a workshop or take on their own.</div>
          </div>
        </div>
        {assignedToMe.length ? (
          <div className="a-assigned">
            <strong>{assignedToMe.length} assigned to you.</strong>{" "}
            {assignedToMe.map((c, i) => (
              <span key={c.key}>
                {i > 0 ? ", " : ""}
                <button className="a-linkbtn" onClick={() => openDetail(c)}>{c.name}</button>
              </span>
            ))}
          </div>
        ) : null}
        {/* templates first, in a box (like the workshop "Create" card) */}
        <div className="wk-create">
          <div className="cat-head wk-create-h">Start an assessment</div>
          <div className="a-tplbody">
            {personality.length ? (
              <div className="a-group">
                <div className="a-gt">Personality</div>
                <div className="a-lib">{personality.map(card)}</div>
              </div>
            ) : null}
            {team.length ? (
              <div className="a-group">
                <div className="a-gt">Team</div>
                <div className="a-lib">{team.map(card)}</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* tabbed table: green folder tabs + white panel */}
        <nav className="otabband" aria-label="Assessment views">
          <button className={`otabband-t${libTab === "assessments" ? " on" : ""}`} onClick={() => setLibTab("assessments")}>Assessments <span className="otabband-c">{catalog.length}</span></button>
          <button className={`otabband-t${libTab === "sessions" ? " on" : ""}`} onClick={() => setLibTab("sessions")}>Sessions <span className="otabband-c">{sessions.length}</span></button>
          <button className={`otabband-t${libTab === "responses" ? " on" : ""}`} onClick={() => setLibTab("responses")}>Responses <span className="otabband-c">{responses.length}</span></button>
        </nav>
        <div className="opanel">
          <div className="opanel-body">
            {libTab === "assessments" ? (
              <div className="tbl-card">
                <table className="tbl">
                  <thead>
                    <tr><th>Instrument</th><th style={{ width: 110 }}>Type</th><th style={{ width: 100 }}>Dimensions</th><th style={{ width: 80 }}>Time</th><th style={{ width: 140 }}>Your status</th><th style={{ width: 70 }} /></tr>
                  </thead>
                  <tbody>
                    {catalog.map((c) => (
                      <tr key={c.key} onClick={() => openDetail(c)} style={{ cursor: "pointer" }}>
                        <td><span style={{ fontWeight: 600 }}>{c.name}</span><small style={{ display: "block", color: "var(--muted)" }}>{c.category}</small></td>
                        <td>{c.scope === "team" ? "Team" : "Personality"}</td>
                        <td>{c.dimensions.length}</td>
                        <td>{c.items.length ? `~${c.mins}m` : "—"}</td>
                        <td>{c.completedByMe ? <span className="pill sm open">Completed</span> : c.assignedToMe ? <span className="pill sm draft">Assigned</span> : <span style={{ color: "var(--faint)" }}>Not taken</span>}</td>
                        <td className="r"><span className="linkbtn">Open ›</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : libTab === "sessions" ? (
              sessions.length ? (
                <div className="tbl-card">
                  <table className="tbl">
                    <thead>
                      <tr><th>Instrument</th><th>Team</th><th style={{ width: 100 }}>Status</th><th style={{ width: 110 }}>Respondents</th><th style={{ width: 140 }}>Run</th></tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.instrument}</td>
                          <td style={{ color: "var(--muted)" }}>{s.team ?? "—"}</td>
                          <td><span className={`pill sm ${s.status === "open" ? "open" : "draft"}`}>{s.status}</span></td>
                          <td>{s.respondents}</td>
                          <td style={{ color: "var(--muted)" }}>{fmtDate(s.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty">No assessment sessions yet. Open a team assessment to run one for your team.</div>
            ) : (
              responses.length ? (
                <div className="tbl-card">
                  <table className="tbl">
                    <thead>
                      <tr><th>Instrument</th><th style={{ width: 110 }}>Type</th><th style={{ width: 160 }}>Taken</th><th style={{ width: 130 }} /></tr>
                    </thead>
                    <tbody>
                      {responses.map((r) => {
                        const c = catalog.find((x) => x.key === r.key);
                        return (
                          <tr key={r.key} onClick={() => c && openDetail(c)} style={{ cursor: c ? "pointer" : "default" }}>
                            <td style={{ fontWeight: 600 }}>{r.instrument}</td>
                            <td>{r.scope === "team" ? "Team" : "Personality"}</td>
                            <td style={{ color: "var(--muted)" }}>{fmtDate(r.takenAt)}</td>
                            <td className="r">{c ? <span className="linkbtn">View report ›</span> : null}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty">You haven&rsquo;t completed any assessments yet.</div>
            )}
          </div>
        </div>
        <Toast toast={toast} />
      </>
    );
  }

  if (!active) { go("library"); return null; }

  // ---------- detail ----------
  if (view === "detail") {
    return (
      <>
        <div className="a-phead">
          <button className="a-back" onClick={() => go("library")} aria-label="Back">‹</button>
          <div>
            <div className="a-pt">{active.name}</div>
            <div className="a-ps">{active.category}</div>
          </div>
          <div className="a-pr">
            {active.external ? (
              <button className="btn-prim" onClick={() => router.push(active.external!)}>Open assessment →</button>
            ) : (
              <>
                {isAdmin && active.scope === "individual" ? (
                  <button className="btn-sec" onClick={() => openAssign(active)}>＋ Assign</button>
                ) : null}
                <button className="btn-sec" onClick={viewSample}>View sample report</button>
                <button className="btn-prim" onClick={startRun}>▶ Run assessment</button>
              </>
            )}
          </div>
        </div>
        {active.external ? (
          <p className="a-note" style={{ marginTop: 14 }}>
            This assessment has its own guided run and report — including the anonymised team rollup for leads. Open it to take it or review results.
          </p>
        ) : null}
        {active.assignedToMe && !active.completedByMe ? (
          <div className="a-assigned">
            <strong>Assigned to you.</strong>{" "}
            {active.assignedToMe.note ? `“${active.assignedToMe.note}” ` : ""}Run it when you’re ready.
            {active.assignedToMe.dueAt ? ` · due ${fmtDate(active.assignedToMe.dueAt)}` : ""}
          </div>
        ) : null}
        {assignOpen ? (
          <div className="a-assignpanel">
            <div className="a-ap-head"><span>Assign “{active.name}”</span><button className="a-back" onClick={() => setAssignOpen(false)} aria-label="Close">✕</button></div>
            <p className="a-ps" style={{ margin: "0 0 10px" }}>Pick who should take this. Results stay private — you’ll only see who has completed it.</p>
            <div className="a-ap-list">
              {members.length ? members.map((m) => {
                const st = assignStatus.find((r) => r.assignee_user_id === m.id);
                const on = assignSel.has(m.id);
                return (
                  <label key={m.id} className={`a-ap-row${on ? " on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => setAssignSel((p) => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} />
                    <span className="nm">{m.name}</span>
                    {st ? <span className={`a-ap-tag${st.completed ? " done" : ""}`}>{st.completed ? "✓ done" : "assigned"}</span> : null}
                  </label>
                );
              }) : <p className="a-ps">No workspace members found.</p>}
            </div>
            <input className="inp" style={{ marginTop: 10 }} placeholder="Add a note (optional)" value={assignNote} onChange={(e) => setAssignNote(e.target.value)} />
            <div className="a-ap-foot">
              <button className="btn-sec" onClick={() => setAssignOpen(false)}>Cancel</button>
              <button className="btn-prim" disabled={assignBusy} onClick={submitAssign}>{assignBusy ? "Saving…" : "Save assignments"}</button>
            </div>
          </div>
        ) : null}
        <div className="a-ov">
          <div className="a-ovcard">
            <h3>About this assessment</h3>
            {active.description ? <p>{active.description}</p> : <p className="muted">No description yet.</p>}
            <div className="a-seclbl">What it measures</div>
            <div className="a-dimlist">{active.dimensions.map((d) => <span className="a-dimchip" key={d.key}>{d.label}</span>)}</div>
          </div>
          <div className="a-ovcard">
            <h3>Details</h3>
            <div className="a-facts">
              <Fact k="Type" v={active.scope === "team" ? "Team assessment" : "Personality assessment"} />
              <Fact k="Dimensions" v={String(active.dimensions.length)} />
              <Fact k="Questions" v={String(active.items.length)} />
              <Fact k="Time to complete" v={`~${active.mins} min`} />
              {active.source ? <Fact k="Based on" v={active.source} /> : null}
              <Fact k="Scale" v={`${active.scale.min}–${active.scale.max}`} />
              <Fact k="Your status" v={active.completedByMe ? "Completed" : "Not taken"} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {active.completedByMe && active.myScores ? (
            <button className="btn-sec" onClick={() => viewMine(active)}>View your report →</button>
          ) : null}
          {active.scope === "team" && active.teamReport && !active.teamReport.masked ? (
            <button className="btn-sec" onClick={() => viewTeam(active)}>View team report →</button>
          ) : null}
        </div>
        {active.scope === "team" ? (
          <p className="a-note" style={{ marginTop: 16 }}>
            {active.teamReport && !active.teamReport.masked
              ? `Team report combines ${active.teamReport.respondents} responses — anonymous, never attributed to a person.`
              : active.openSurveyId
                ? active.teamReport && active.teamReport.respondents > 0
                  ? `Open for the team — ${active.teamReport.respondents} responded so far. The report unlocks once at least 3 people answer.`
                  : "This assessment is open for the team — run it above to add your response."
                : active.teamReport
                  ? `Team report is hidden until at least 3 people respond (${active.teamReport.respondents} so far).`
                  : "Team assessments combine every member’s response into one picture. Open it for the whole team from the Team dynamics tools below."}
          </p>
        ) : null}
        <Toast toast={toast} />
      </>
    );
  }

  // ---------- run ----------
  if (view === "run") {
    return (
      <>
        <AssessmentRunner
          instrument={{ name: active.name, scale: active.scale, dimensions: active.dimensions, items: active.items }}
          initialAnswers={active.myScores ?? undefined}
          draftKey={`otaa:run:${workspaceId}:${active.key}`}
          estimateMins={active.mins}
          privacyNote={active.scope === "team" ? "Anonymous in aggregate — individual answers are never shown." : "Private to you."}
          submitLabel="See my report ›"
          onBack={() => go("detail")}
          onSubmit={finishRun}
        />
        <Toast toast={toast} />
      </>
    );
  }

  // ---------- report ----------
  const cand = mode === "candidate";
  // Personal trend: per-dimension movement since the first take (own report only).
  const showTrend = !sample && !teamMode && active.myHistory.length > 1;
  const firstScores = showTrend ? scoreFrom(active, active.myHistory[0].scores) : [];
  return (
    <>
      <div className="a-phead">
        <button className="a-back" onClick={() => go("detail")} aria-label="Back">‹</button>
        <div>
          <div className="a-pt">Report{sample ? " · Sample" : ""}</div>
          <div className="a-ps">{active.name} · {sample ? "Sample profile" : userName}</div>
        </div>
        <div className="a-pr">
          {active.scope === "individual" && !sample && !teamMode && active.completedByMe ? (
            <button className={`btn-sec${sharedKeys.has(active.key) ? " on" : ""}`} onClick={() => toggleShare(active)}>
              {sharedKeys.has(active.key) ? "✓ Shared with team" : "Share with team"}
            </button>
          ) : null}
          <button className="btn-sec" onClick={exportReport}>⤓ Export</button>
        </div>
      </div>
      <div className="a-report">
        <div className="a-rephead">
          <div className="rh-l">
            <div className="a-rtitle">{active.name}</div>
            <div className="a-rperson">{sample ? "Sample profile" : userName}</div>
          </div>
          <div className="a-seg">
            <button className={!cand ? "on" : ""} onClick={() => setMode("admin")}>Full</button>
            <button className={cand ? "on" : ""} onClick={() => setMode("candidate")}>Personal</button>
          </div>
        </div>
        {sample ? <div className="a-note">This is an illustrative sample so you can see the format. Run the assessment to generate a real report.</div> : null}
        {cand ? <div className="a-note">A personal read: these describe tendencies, not verdicts — a starting point for reflection and conversation.</div> : null}
        {showTrend ? (
          <>
            <div className="a-repsec">↗ Movement</div>
            <div className="a-note">Compared with your first take on {fmtDate(active.myHistory[0].at)} · {active.myHistory.length} takes.</div>
            <div className="a-movewrap">
              {scores.map((s) => {
                const f = firstScores.find((x) => x.key === s.key);
                const d = f ? Math.round(s.pct - f.pct) : 0;
                return (
                  <div className="a-move" key={s.key}>
                    <span className="lbl">{s.label}</span>
                    <span className={`delta${d > 0 ? " up" : d < 0 ? " down" : ""}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "–"} {Math.abs(d)} pts</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
        <div className="a-repsec">▦ Profile</div>
        <div className="a-ttable">
          <div className="a-bandhead"><span>Dimension</span><span style={{ textAlign: "center" }}>{BANDS.join(" · ")}</span><span className="sc">{cand ? "" : "Score"}</span></div>
          {scores.map((s) => {
            const open = exp.has(s.key);
            const nm = !sample && !teamMode ? active.norms.find((x) => x.dimension === s.key) : undefined;
            return (
              <div key={s.key} className={`a-trow${open ? " open" : ""}`} onClick={() => setExp((p) => { const n = new Set(p); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}>
                <span className="a-tname"><span className="a-exp">›</span>{s.label}</span>
                <span className="a-btrack"><span className="a-bfill" style={{ width: `${s.pct.toFixed(0)}%` }} /></span>
                <span className="a-bscore">{cand ? <span className="a-bdot" title={BANDS[s.band]} /> : s.mean.toFixed(1)}</span>
                {open ? (
                  <div className="a-tdetail">
                    <div className="a-seclbl">What {s.label} means</div>
                    <p>{s.copy?.definition || s.blurb}</p>
                    <div className="a-seclbl">Your read</div>
                    <p>{bandSentence(s.label, s.band)}</p>
                    {nm && nm.percentile != null ? (
                      <p className="a-pctl">Compared with {nm.others_n} {nm.others_n === 1 ? "other" : "others"} who’ve taken this, you’re around the <strong>{ordinal(nm.percentile)} percentile</strong>.</p>
                    ) : null}
                    {s.copy?.advantages?.length ? (
                      <>
                        <div className="a-seclbl">Where it helps</div>
                        <ul>{s.copy.advantages.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </>
                    ) : null}
                    {!cand && s.copy?.risks?.length ? (
                      <>
                        <div className="a-seclbl">Watch-outs</div>
                        <ul>{s.copy.risks.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </>
                    ) : null}
                    {s.copy?.statements?.length ? (
                      <>
                        <div className="a-seclbl">People with this result often recognise</div>
                        <ul>{s.copy.statements.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="a-repfoot">
          {active.source ? <span>Based on {active.source}</span> : null}
          <span>Scale {active.scale.min}–{active.scale.max}</span>
          <span>{active.dimensions.length} dimensions</span>
        </div>
      </div>
      <Toast toast={toast} />
    </>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return <div className="a-fact"><span className="k">{k}</span><span className="v">{v}</span></div>;
}
function Toast({ toast }: { toast: string | null }) {
  return (
    <div className={`toast${toast ? " show" : ""}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
      <span>{toast}</span>
    </div>
  );
}
