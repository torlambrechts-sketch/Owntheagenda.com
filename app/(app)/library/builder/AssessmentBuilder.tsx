"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveTemplate } from "../actions";

// Assessment Builder — Gallery (start from a template) → three-pane Editor
// (sections / question canvas / inspector) → respondent Preview. Adapted from
// the imported design into the app's design language and wired to the existing
// assessment_template model. Question types/options and the workshop-trigger
// threshold persist as additive fields in the instrument definition (existing
// readers treat items as Likert by default).

export type QType = "likert" | "single" | "multi" | "text";
export type Question = { id: string; text: string; type: QType; required: boolean; reverse: boolean; scale: string; options: string[] };
export type Section = { id: string; name: string; questions: Question[] };
export type Doc = { title: string; sections: Section[] };
// When editing an existing template, the route hands the parsed doc + the
// persisted metadata to preserve on save.
export type EditSeed = { id: string; doc: Doc; threshold: number; agg: string; category: string; scope: string; description: string; source: string };

const TYPES: Record<QType, { label: string; accent: string }> = {
  likert: { label: "Likert", accent: "var(--role)" },
  single: { label: "Single choice", accent: "#6d28d9" },
  multi: { label: "Multi-select", accent: "#0e7490" },
  text: { label: "Free text", accent: "var(--muted)" },
};

const CATS = ["All", "Wellbeing", "Engagement", "Team", "Competence"];
type Tpl = { id: string; name: string; type: string; cat: string; qcount: number; sections: number; desc: string };
const TEMPLATES: Tpl[] = [
  { id: "psych", name: "Psychosocial work-environment", type: "Survey", cat: "Wellbeing", qcount: 12, sections: 5, desc: "Maps demands, control, leadership, role clarity and open feedback — the classic working-environment read." },
  { id: "pulse", name: "Quarterly pulse", type: "Survey", cat: "Engagement", qcount: 8, sections: 3, desc: "A short recurring check on workload, support and morale — built for trend lines over time." },
  { id: "safety", name: "Psychological safety", type: "Survey", cat: "Team", qcount: 9, sections: 2, desc: "Can the team speak up, take risks and own decisions together? Edmondson-style items." },
  { id: "effectiveness", name: "Team effectiveness", type: "Survey", cat: "Team", qcount: 8, sections: 2, desc: "Task performance and member satisfaction for leadership teams." },
  { id: "onboard", name: "Onboarding check", type: "Quiz", cat: "Competence", qcount: 10, sections: 2, desc: "Knowledge check for new hires covering routines and escalation paths." },
];

function rid(p: string) { return p + Math.random().toString(36).slice(2, 7); }
function q(text: string, type: QType, required: boolean, reverse: boolean): Question {
  return { id: rid("q"), text, type, required, reverse, scale: "1–5", options: type === "single" ? ["Yes", "Partly", "No"] : type === "multi" ? ["Option A", "Option B", "Option C"] : [] };
}
function scaleArr(s: string): number[] {
  const m = /^(\d+)\s*[–-]\s*(\d+)$/.exec((s || "").trim());
  if (m) {
    let a = Number(m[1]); let b = Number(m[2]);
    if (b < a) { const t = a; a = b; b = t; }
    if (b - a > 20) b = a + 20; // guard against runaway ranges
    const out: number[] = [];
    for (let v = a; v <= b; v++) out.push(v);
    if (out.length >= 2) return out;
  }
  return [1, 2, 3, 4, 5];
}
const SCALE_PRESETS = ["1–4", "1–5", "1–6", "1–7", "1–10", "0–4", "0–5", "0–10"];
function clone<T>(d: T): T { return JSON.parse(JSON.stringify(d)); }
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

const SEED_PSYCH: Section[] = [
  { id: rid("s"), name: "Psychosocial demands", questions: [
    q("My workload is manageable over time", "likert", true, false),
    q("I can complete my tasks within normal hours", "likert", true, false),
    q("Conflicts are handled constructively", "likert", true, false),
    q("I rarely feel emotionally drained after work", "likert", true, true),
  ] },
  { id: rid("s"), name: "Control & influence", questions: [
    q("I can influence decisions about my work", "likert", true, false),
    q("I have a say in how my tasks are prioritised", "likert", true, false),
  ] },
  { id: rid("s"), name: "Leadership & support", questions: [
    q("I get support from my immediate manager", "likert", true, false),
    q("My manager gives clear and timely feedback", "likert", true, false),
    q("I can raise concerns without hesitation", "likert", true, false),
  ] },
  { id: rid("s"), name: "Role clarity", questions: [
    q("Roles and responsibilities are clear", "likert", true, false),
    q("I know what is expected of me", "likert", true, false),
  ] },
  { id: rid("s"), name: "Open feedback", questions: [
    q("What would most improve your working environment?", "text", false, false),
  ] },
];

function seedDoc(t: Tpl): Doc {
  if (t.id === "psych") return { title: "Psychosocial work-environment", sections: clone(SEED_PSYCH) };
  const type: QType = t.type === "Quiz" ? "single" : "likert";
  const sections: Section[] = [];
  const per = Math.max(1, Math.round(t.qcount / t.sections));
  for (let i = 0; i < t.sections; i++) {
    const qs: Question[] = [];
    for (let j = 0; j < per; j++) qs.push(q(`Question ${j + 1} for this section`, type, true, false));
    sections.push({ id: rid("s"), name: `Section ${i + 1}`, questions: qs });
  }
  return { title: t.name, sections };
}
function blankDoc(): Doc {
  return { title: "Untitled assessment", sections: [{ id: rid("s"), name: "Section 1", questions: [q("Your first question", "likert", true, false)] }] };
}

export function AssessmentBuilder({ edit, existing = [] }: { edit?: EditSeed; existing?: { id: string; name: string; category: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<"gallery" | "editor">(edit ? "editor" : "gallery");
  const [cat, setCat] = useState("All");
  const [doc, setDoc] = useState<Doc | null>(edit?.doc ?? null);
  const [curSection, setCurSection] = useState(0);
  const [selQ, setSelQ] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [threshold, setThreshold] = useState(edit?.threshold ?? 3.0);
  const [agg, setAgg] = useState(edit?.agg ?? "Section mean");
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2600); }
  function markDirty() { setSaved(false); }
  function update(fn: (d: Doc) => void) { setDoc((prev) => { if (!prev) return prev; const d = clone(prev); fn(d); return d; }); markDirty(); }

  function open(d: Doc) { setDoc(d); setCurSection(0); setSelQ(null); setSaved(true); setView("editor"); }
  function back() { if (edit) { router.push("/assessments/library"); return; } setView("gallery"); setPreviewOpen(false); }

  const cs = doc?.sections[curSection];
  const sel = cs?.questions.find((x) => x.id === selQ) ?? null;
  const totalQ = doc?.sections.reduce((a, s) => a + s.questions.length, 0) ?? 0;

  function addSection() { if (!doc) return; const n = doc.sections.length; update((d) => { d.sections.push({ id: rid("s"), name: "New section", questions: [] }); }); setCurSection(n); setSelQ(null); }
  function addQuestion() { if (!doc) return; const nq = q("New question", "likert", true, false); update((d) => { d.sections[curSection].questions.push(nq); }); setSelQ(nq.id); }
  function delQuestion(id: string, e: React.MouseEvent) { e.stopPropagation(); update((d) => { const s = d.sections[curSection]; s.questions = s.questions.filter((x) => x.id !== id); }); if (selQ === id) setSelQ(null); }
  function dupQuestion() { if (!sel) return; const nq = clone(sel); nq.id = rid("q"); update((d) => { const s = d.sections[curSection]; const i = s.questions.findIndex((x) => x.id === sel.id); s.questions.splice(i + 1, 0, nq); }); setSelQ(nq.id); }
  function setQField<K extends keyof Question>(field: K, val: Question[K]) { if (!sel) return; update((d) => { const x = d.sections[curSection].questions.find((y) => y.id === sel.id); if (x) (x[field] as Question[K]) = val; }); }
  function setQType(type: QType) { if (!sel) return; update((d) => { const x = d.sections[curSection].questions.find((y) => y.id === sel.id); if (!x) return; x.type = type; if ((type === "single" || type === "multi") && (!x.options || !x.options.length)) x.options = type === "single" ? ["Yes", "Partly", "No"] : ["Option A", "Option B", "Option C"]; }); }

  function buildDefinition(d: Doc) {
    const usedDim = new Set<string>();
    const dims = d.sections.filter((s) => s.questions.length).map((s, i) => {
      let key = slug(s.name) || `section_${i + 1}`; let n = 2; const base = key;
      while (usedDim.has(key)) key = `${base}_${n++}`;
      usedDim.add(key);
      return { key, label: s.name.trim() || `Section ${i + 1}`, blurb: "" };
    });
    const firstLikert = d.sections.flatMap((s) => s.questions).find((x) => x.type === "likert");
    const sc = firstLikert ? firstLikert.scale : "1–5";
    const arr = scaleArr(sc);
    const zero = arr[0] === 0;
    const scale = { min: arr[0], max: arr[arr.length - 1], minLabel: zero ? "Not at all" : "Strongly disagree", maxLabel: zero ? "Completely" : "Strongly agree" };
    const items = d.sections.filter((s) => s.questions.length).flatMap((s, si) => {
      const dimKey = dims[si].key;
      return s.questions.map((x, qi) => ({
        key: `${dimKey}_${qi + 1}`, dimension: dimKey, text: x.text.trim() || "Untitled question",
        ...(x.reverse ? { reverse: true } : {}),
        type: x.type, ...(x.options.length ? { options: x.options } : {}), required: x.required, qScale: x.scale,
      }));
    });
    return { scale, dimensions: dims, items, strengthDimension: dims[0]?.key, threshold, aggregation: agg };
  }

  function publish() {
    if (!doc) return;
    setError(null);
    const def = buildDefinition(doc);
    if (!doc.title.trim()) { setError("Give the assessment a name."); return; }
    if (!def.dimensions.length || !def.items.length) { setError("Add at least one section with a question."); return; }
    startTransition(async () => {
      const res = await saveTemplate({
        id: edit?.id ?? null,
        name: doc.title.trim(),
        category: edit?.category ?? "custom",
        scope: edit?.scope ?? "team",
        description: edit?.description ?? "",
        source: edit?.source ?? "",
        definition: def,
      });
      if (res.error) { setError(res.error); return; }
      flash(edit ? "Saved — your changes are live" : "Published — your assessment is in the library");
      setTimeout(() => router.push("/assessments/library"), 700);
    });
  }

  // ---------------- GALLERY ----------------
  if (view === "gallery") {
    const cards = TEMPLATES.filter((t) => cat === "All" || t.cat === cat);
    return (
      <div className="ab">
        <div className="ab-top">
          <Wordmark />
          <span style={{ width: 1, height: 20, background: "rgba(255,255,255,.18)" }} />
          <span className="ab-crumb">Assessment builder</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div className="ab-gallery">
            <div className="a-ps" style={{ marginBottom: 13 }}><Link href="/assessments/library" className="linkbtn">Assessments</Link> › New from template</div>
            <div style={{ maxWidth: 660, marginBottom: 22 }}>
              <div className="a-pt" style={{ fontSize: 28 }}>Start from a template</div>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted)", margin: "6px 0 0" }}>
                Pick a starting point or build blank. Every template ships with sections, scoring and a threshold that can trigger a follow-up workshop. You can edit everything after.
              </p>
            </div>
            {existing.length ? (
              <div style={{ marginBottom: 26 }}>
                <div className="ab-insp-lbl" style={{ marginBottom: 10 }}>Your assessments</div>
                <div className="ab-grid">
                  {existing.map((t) => (
                    <button key={t.id} className="ab-card" onClick={() => router.push(`/builder?id=${t.id}`)}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                        <span className="ab-card-ic"><Icon n="doc" /></span>
                        <span className="pill sm internal">Edit</span>
                      </div>
                      <span className="ab-card-nm">{t.name}</span>
                      <span className="ab-card-desc">Workspace assessment · {t.category}</span>
                      <span className="ab-card-meta"><span>Open in the builder →</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="ab-cats">
              {CATS.map((c) => (
                <button key={c} className={`ab-cat${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>
                  {c}<span className="n">{c === "All" ? TEMPLATES.length : TEMPLATES.filter((t) => t.cat === c).length}</span>
                </button>
              ))}
            </div>
            <div className="ab-grid">
              <button className="ab-card blank" onClick={() => open(blankDoc())}>
                <span className="ab-card-ic"><Icon n="plus" /></span>
                <span className="ab-card-nm">Blank assessment</span>
                <span className="ab-card-desc">Build from scratch — add your own sections, questions and scoring.</span>
                <span style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--green)" }}>Start blank →</span>
              </button>
              {cards.map((t) => (
                <button key={t.id} className="ab-card" onClick={() => open(seedDoc(t))}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                    <span className="ab-card-ic"><Icon n="doc" /></span>
                    <span className="pill sm internal">{t.type}</span>
                  </div>
                  <span className="ab-card-nm">{t.name}</span>
                  <span className="ab-card-desc">{t.desc}</span>
                  <span className="ab-card-meta"><span><Icon n="list" size={13} /> {t.qcount} questions</span><span><Icon n="layers" size={13} /> {t.sections} sections</span></span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <Toast toast={toast} />
      </div>
    );
  }

  // ---------------- EDITOR ----------------
  if (!doc) return null;
  return (
    <div className="ab">
      <div className="ab-top">
        <Wordmark />
        <span style={{ width: 1, height: 20, background: "rgba(255,255,255,.18)" }} />
        <span className="ab-crumb">Assessment builder</span>
      </div>

      <div className="ab-ebar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="ab-title" value={doc.title} onChange={(e) => update((d) => { d.title = e.target.value; })} placeholder="Assessment name" />
          <div className="ab-emeta">
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{totalQ} questions · {doc.sections.length} sections</span>
            <span style={{ color: "var(--line-2)" }}>·</span>
            <span className={`ab-save${saved ? "" : " saving"}`}><span className="dot" />{saved ? "All changes saved" : "Unsaved changes"}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button className="btn-sec" onClick={back}>Close</button>
          <button className="btn-sec" onClick={() => setPreviewOpen(true)}>Preview</button>
          <button className="btn-prim" disabled={pending} onClick={publish}>{pending ? "Publishing…" : "Publish"}</button>
        </div>
      </div>
      {error ? <div className="form-err" style={{ margin: "10px 22px 0" }}>{error}</div> : null}

      <div className="ab-panes">
        {/* section rail */}
        <div className="ab-rail">
          <div className="ab-rail-h">Sections</div>
          <div className="ab-rail-list">
            {doc.sections.map((s, i) => (
              <button key={s.id} className={`ab-sec${i === curSection ? " on" : ""}`} onClick={() => { setCurSection(i); setSelQ(null); }}>
                <span className="ab-sec-n">{i + 1}</span>
                <span className="ab-sec-nm"><b>{s.name || "Untitled"}</b><small>{s.questions.length} questions</small></span>
              </button>
            ))}
          </div>
          <div className="ab-rail-foot">
            <button className="ab-addq" onClick={addSection}><Icon n="plus" size={14} /> Add section</button>
          </div>
        </div>

        {/* question canvas */}
        <div className="ab-canvas">
          <div className="ab-canvas-in">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <input className="ab-secname" value={cs?.name ?? ""} onChange={(e) => update((d) => { d.sections[curSection].name = e.target.value; })} />
              <span style={{ fontSize: 12, color: "var(--faint)", whiteSpace: "nowrap" }}>{cs?.questions.length ?? 0} questions · section {curSection + 1}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>Click a question to configure its type and scoring on the right.</div>

            {(cs?.questions ?? []).map((qq, i) => {
              const tc = TYPES[qq.type]; const isSel = selQ === qq.id;
              return (
                <div key={qq.id} className={`ab-qcard${isSel ? " sel" : ""}`} onClick={() => setSelQ(qq.id)}>
                  <div className="ab-q-row">
                    <span className="ab-q-n">{i + 1}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="ab-q-text">{qq.text || "Untitled question"}</div>
                      <div className="ab-q-tags">
                        <span className="pill sm" style={{ color: tc.accent, background: "var(--canvas-2)" }}>{tc.label}</span>
                        {qq.required ? <span className="pill sm draft">Required</span> : null}
                        {qq.reverse ? <span className="pill sm internal">Reverse-scored</span> : null}
                      </div>
                      {qq.type === "likert" ? (
                        <div className="ab-likert">{scaleArr(qq.scale).map((d) => <span key={d}>{d}</span>)}</div>
                      ) : qq.type === "single" || qq.type === "multi" ? (
                        <div className="ab-opts">{qq.options.map((o, oi) => <span key={oi}><span className="ab-opt-dot" style={{ borderRadius: qq.type === "multi" ? 4 : "50%" }} />{o}</span>)}</div>
                      ) : (
                        <div className="ab-text-ph" />
                      )}
                    </div>
                    <button className="ab-q-del" onClick={(e) => delQuestion(qq.id, e)} aria-label="Delete question"><Icon n="trash" size={14} /></button>
                  </div>
                </div>
              );
            })}
            <button className="ab-addq" onClick={addQuestion}><Icon n="plus" size={14} /> Add question</button>
          </div>
        </div>

        {/* inspector */}
        <div className="ab-inspector">
          {sel ? (
            <div className="ab-insp-in">
              <div className="ab-insp-h"><span>Question {(cs?.questions.findIndex((x) => x.id === sel.id) ?? 0) + 1}</span><button className="ab-q-del" onClick={() => setSelQ(null)} aria-label="Deselect"><Icon n="x" size={14} /></button></div>
              <div style={{ marginBottom: 14 }}>
                <div className="ab-insp-lbl">Question text</div>
                <textarea className="inp" rows={3} value={sel.text} onChange={(e) => setQField("text", e.target.value)} style={{ resize: "vertical", lineHeight: 1.45 }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div className="ab-insp-lbl">Answer type</div>
                <div className="ab-types">
                  {(Object.keys(TYPES) as QType[]).map((k) => (
                    <button key={k} className={`ab-type${sel.type === k ? " on" : ""}`} onClick={() => setQType(k)}>{TYPES[k].label}</button>
                  ))}
                </div>
              </div>
              {sel.type === "likert" ? (
                <div style={{ marginBottom: 14 }}>
                  <div className="ab-insp-lbl">Scale</div>
                  <select className="inp" value={sel.scale} onChange={(e) => setQField("scale", e.target.value)}>
                    {(SCALE_PRESETS.includes(sel.scale) ? SCALE_PRESETS : [sel.scale, ...SCALE_PRESETS]).map((s) => (
                      <option key={s} value={s}>{s}{s === "1–5" ? " (Likert)" : s === "0–10" ? " (NPS-style)" : ""}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                <button className="ab-toggle" onClick={() => setQField("required", !sel.required)}>Required<span className={`ab-sw${sel.required ? " on" : ""}`}><i /></span></button>
                <button className="ab-toggle" onClick={() => setQField("reverse", !sel.reverse)}>Reverse-scored<span className={`ab-sw${sel.reverse ? " on" : ""}`}><i /></span></button>
              </div>
              <button className="btn-sec" style={{ width: "100%", justifyContent: "center" }} onClick={dupQuestion}>Duplicate question</button>
            </div>
          ) : (
            <div className="ab-insp-in">
              <div className="ab-insp-h"><span>Scoring &amp; trigger</span></div>
              <div style={{ marginBottom: 14 }}>
                <div className="ab-insp-lbl">Aggregation</div>
                <select className="inp" value={agg} onChange={(e) => { setAgg(e.target.value); markDirty(); }}>
                  <option>Section mean</option><option>Lowest section</option><option>Weighted total</option>
                </select>
              </div>
              <div className="ab-trigger">
                <div className="ab-trigger-h"><Icon n="split" size={14} /> Workshop trigger</div>
                <div style={{ fontSize: 12.5, color: "var(--amber)", lineHeight: 1.5, marginBottom: 12 }}>When a section mean drops below the threshold, a follow-up workshop is recommended automatically.</div>
                <div className="ab-thr-row"><span style={{ fontSize: 12, color: "var(--amber)" }}>Threshold</span><span className="ab-thr-val">{threshold.toFixed(1)}</span></div>
                <input type="range" min={0} max={5} step={0.1} value={threshold} onChange={(e) => { setThreshold(Number(e.target.value)); markDirty(); }} style={{ width: "100%", accentColor: "var(--amber)", cursor: "pointer" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--faint)", marginTop: 2 }}><span>0.0</span><span>5.0</span></div>
              </div>
              <div className="a-note" style={{ margin: 0 }}>Distribution (channel, anonymity, reminders) is set when you send the assessment to a team.</div>
            </div>
          )}
        </div>
      </div>

      {previewOpen ? (
        <div className="ab-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ab-modal-h">
              <div><div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "rgba(255,255,255,.6)" }}>Respondent preview</div><div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, marginTop: 3 }}>{doc.title}</div></div>
              <button className="ab-q-del" style={{ color: "#fff" }} onClick={() => setPreviewOpen(false)} aria-label="Close"><Icon n="x" size={15} /></button>
            </div>
            <div className="ab-modal-b">
              {doc.sections.map((s) => (
                <div key={s.id} style={{ marginBottom: 18 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 3 }}>{s.name || "Untitled"}</div>
                  <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 13, textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600 }}>{s.questions.length} questions</div>
                  {s.questions.map((qq, i) => (
                    <div key={qq.id} className="ab-pv-q">
                      <div style={{ fontSize: 13.5, color: "var(--ink)", marginBottom: 11 }}>{i + 1}. {qq.text}</div>
                      {qq.type === "likert" ? (
                        <div className="ab-pv-scale">{scaleArr(qq.scale).map((d) => <span key={d}>{d}</span>)}</div>
                      ) : qq.type === "single" || qq.type === "multi" ? (
                        <div className="ab-opts" style={{ marginTop: 0 }}>{qq.options.map((o, oi) => <span key={oi} style={{ fontSize: 13.5, color: "var(--ink)" }}><span className="ab-opt-dot" style={{ borderRadius: qq.type === "multi" ? 4 : "50%" }} />{o}</span>)}</div>
                      ) : (
                        <div style={{ height: 52, border: "1px solid var(--line-2)", borderRadius: 8, background: "var(--surface)" }} />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <Toast toast={toast} />
    </div>
  );
}

function Wordmark() {
  return (
    <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700 }}>
      <span style={{ color: "#fff" }}>Own</span><span style={{ color: "rgba(255,255,255,.6)" }}>theagenda</span>
    </span>
  );
}
function Toast({ toast }: { toast: string | null }) {
  return (
    <div className={`toast${toast ? " show" : ""}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
      <span>{toast}</span>
    </div>
  );
}
function Icon({ n, size = 16 }: { n: string; size?: number }) {
  const p: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>,
    doc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
    layers: <path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />,
    split: <path d="M16 3h5v5M8 3H3v5M21 3l-7 7M3 3l7 7M12 12v9" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{p[n]}</svg>;
}
