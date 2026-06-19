"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type TraitCopy = { definition: string; advantages: string[]; risks: string[]; statements: string[] };
export type CatalogDim = { key: string; label: string; blurb: string; copy?: TraitCopy | null };
export type CatalogItemDef = { key: string; dimension: string; text: string };
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
};

type View = "library" | "detail" | "run" | "report";
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
    const vals = its.map((it) => answers[it.key]).filter((v): v is number => v != null);
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : min;
    const pct = ((mean - min) / (max - min)) * 100;
    return { key: d.key, label: d.label, blurb: d.blurb, copy: d.copy ?? null, mean, pct, band: bandOf(pct), n: vals.length };
  });
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
}: {
  workspaceId: string;
  catalog: CatalogItem[];
  userName: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>("library");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [runIdx, setRunIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<DimScore[]>([]);
  const [sample, setSample] = useState(false);
  const [mode, setMode] = useState<"admin" | "candidate">("admin");
  const [exp, setExp] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const active = catalog.find((c) => c.key === activeKey) ?? null;
  const personality = catalog.filter((c) => c.scope === "individual");
  const team = catalog.filter((c) => c.scope === "team");

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2600); }
  function go(v: View) { setView(v); if (typeof window !== "undefined") window.scrollTo(0, 0); }
  function openDetail(c: CatalogItem) {
    if (c.external) { router.push(c.external); return; }
    setActiveKey(c.key); setExp(new Set()); go("detail");
  }
  function startRun() { setRunIdx(0); setAnswers(active?.myScores ?? {}); go("run"); }
  function viewSample() { if (!active) return; setSample(true); setScores(sampleScores(active)); setMode("admin"); setExp(new Set()); go("report"); }

  async function finishRun() {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.rpc("submit_individual_response", { p_workspace: workspaceId, p_template_key: active.key, p_scores: answers });
    setBusy(false);
    if (error) { flash(error.message); return; }
    setSample(false); setScores(scoreFrom(active, answers)); setMode("candidate"); setExp(new Set());
    go("report");
    flash("Saved — your report is ready");
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
            <button className="btn-sec" onClick={viewSample}>View sample report</button>
            <button className="btn-prim" onClick={startRun}>▶ Run assessment</button>
          </div>
        </div>
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
        {active.completedByMe && active.myScores ? (
          <button className="btn-sec" onClick={() => { setSample(false); setScores(scoreFrom(active, active.myScores!)); setMode("candidate"); setExp(new Set()); go("report"); }}>
            View your report →
          </button>
        ) : null}
        {active.scope === "team" ? (
          <p className="a-note" style={{ marginTop: 16 }}>
            Team assessments combine every member’s response into one picture. Run it for yourself here, or open it for the whole team from the team’s Health &amp; pulse flow.
          </p>
        ) : null}
        <Toast toast={toast} />
      </>
    );
  }

  // ---------- run ----------
  if (view === "run") {
    const n = active.items.length;
    const it = active.items[runIdx];
    const answered = active.items.filter((x) => answers[x.key] != null).length;
    const pct = Math.round((answered / n) * 100);
    const cur = answers[it.key];
    const last = runIdx === n - 1;
    const opts: number[] = [];
    for (let v = active.scale.min; v <= active.scale.max; v++) opts.push(v);
    const label = (v: number) => v === active.scale.min ? active.scale.minLabel : v === active.scale.max ? active.scale.maxLabel : String(v);
    return (
      <>
        <div className="a-phead">
          <button className="a-back" onClick={() => go("detail")} aria-label="Back">‹</button>
          <div>
            <div className="a-pt">{active.name}</div>
            <div className="a-ps">Answer as honestly as you can — there are no right or wrong answers.</div>
          </div>
        </div>
        <div className="a-run">
          <div className="a-progress"><span style={{ width: `${pct}%` }} /></div>
          <div className="a-runmeta"><span>Question {runIdx + 1} of {n}</span><span>{answered} / {n} answered</span></div>
          <div className="a-qcard">
            <div className="a-qnum">This statement fits me</div>
            <div className="a-qtext">{it.text}</div>
            <div className="a-likert">
              {opts.map((v) => (
                <div key={v} className={`a-lopt${cur === v ? " on" : ""}`} onClick={() => setAnswers((a) => ({ ...a, [it.key]: v }))}>
                  <span className="a-lr" />{label(v)}
                </div>
              ))}
            </div>
          </div>
          <div className="a-runnav">
            <button className="btn-sec" disabled={runIdx === 0} onClick={() => setRunIdx((i) => Math.max(0, i - 1))}>‹ Back</button>
            <div className="sp" />
            {last ? (
              <button className="btn-prim" disabled={cur == null || busy} onClick={finishRun}>{busy ? "Saving…" : "See my report ›"}</button>
            ) : (
              <button className="btn-prim" disabled={cur == null} onClick={() => setRunIdx((i) => Math.min(n - 1, i + 1))}>Next ›</button>
            )}
          </div>
        </div>
        <Toast toast={toast} />
      </>
    );
  }

  // ---------- report ----------
  const cand = mode === "candidate";
  return (
    <>
      <div className="a-phead">
        <button className="a-back" onClick={() => go("detail")} aria-label="Back">‹</button>
        <div>
          <div className="a-pt">Report{sample ? " · Sample" : ""}</div>
          <div className="a-ps">{active.name} · {sample ? "Sample profile" : userName}</div>
        </div>
        <div className="a-pr">
          <button className="btn-sec" onClick={() => flash("Export coming soon")}>⤓ Export</button>
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
        <div className="a-repsec">▦ Profile</div>
        <div className="a-ttable">
          <div className="a-bandhead"><span>Dimension</span><span style={{ textAlign: "center" }}>{BANDS.join(" · ")}</span><span className="sc">{cand ? "" : "Score"}</span></div>
          {scores.map((s) => {
            const open = exp.has(s.key);
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
