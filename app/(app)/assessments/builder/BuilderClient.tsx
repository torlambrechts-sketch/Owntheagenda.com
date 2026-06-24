"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTemplate } from "../../library/actions";

// In-shell Builder — the handoff's Builder gallery → single-column editor,
// rendered inside the app shell. Reuses the existing assessment_template model
// via saveTemplate; question types/threshold persist as additive fields in the
// instrument definition (existing readers treat items as Likert by default).

export type QType = "likert" | "yesno" | "single" | "multi" | "text";
type Question = { id: string; text: string; type: QType; options: string[] };
type Section = { id: string; name: string; questions: Question[] };
type Doc = { title: string; sections: Section[] };
export type StarterTemplate = {
  id?: string;
  key?: string;
  title: string;
  category: string;
  desc: string;
  builtIn: boolean;
  sections: { name: string; questions: { text: string; type: QType }[] }[];
};

const TYPE_LABEL: Record<QType, string> = {
  likert: "Likert 1–5",
  yesno: "Yes / No",
  single: "Single choice",
  multi: "Multiple choice",
  text: "Short text",
};

let _n = 0;
const uid = (p: string) => `${p}${++_n}`;
function clone<T>(d: T): T { return JSON.parse(JSON.stringify(d)); }
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function defaultOptions(t: QType): string[] {
  if (t === "yesno") return ["Yes", "No"];
  if (t === "single") return ["Yes", "Partly", "No"];
  if (t === "multi") return ["Option A", "Option B", "Option C"];
  return [];
}

// Built-in starters shown in the gallery (mirrors the handoff's set).
const STARTERS: StarterTemplate[] = [
  { title: "Team performance", category: "Team", builtIn: true, desc: "Collaboration, delivery, trust and psychological safety across a team.", sections: [
    { name: "Collaboration", questions: [ { text: "Our team communicates openly and honestly", type: "likert" }, { text: "We resolve disagreements constructively", type: "likert" }, { text: "Roles and responsibilities within the team are clear", type: "likert" } ] },
    { name: "Delivery & focus", questions: [ { text: "We consistently meet the commitments we make", type: "likert" }, { text: "We prioritise the right work", type: "likert" } ] },
    { name: "Trust & safety", questions: [ { text: "I can take risks and admit mistakes without fear of blame", type: "likert" }, { text: "Team members genuinely support one another", type: "likert" } ] },
    { name: "Open feedback", questions: [ { text: "What is one thing our team should start doing?", type: "text" } ] },
  ] },
  { title: "Psychosocial work-environment", category: "Wellbeing", builtIn: true, desc: "Maps demands, control, leadership, role clarity and open feedback.", sections: [
    { name: "Psychosocial demands", questions: [ { text: "My workload is manageable over time", type: "likert" }, { text: "I can complete my tasks within normal hours", type: "likert" }, { text: "Conflicts are handled constructively", type: "likert" } ] },
    { name: "Leadership & support", questions: [ { text: "I get support from my immediate manager", type: "likert" }, { text: "I can raise concerns without hesitation", type: "likert" } ] },
    { name: "Role clarity", questions: [ { text: "Roles and responsibilities are clear", type: "likert" } ] },
    { name: "Open", questions: [ { text: "What would most improve your working environment?", type: "text" } ] },
  ] },
  { title: "Quarterly pulse", category: "Engagement", builtIn: true, desc: "A short recurring check on workload, support and morale.", sections: [
    { name: "Workload", questions: [ { text: "My workload has been sustainable this quarter", type: "likert" }, { text: "I have had time for focused work", type: "likert" } ] },
    { name: "Support", questions: [ { text: "I get the support I need from my manager", type: "likert" }, { text: "My team helps each other out", type: "likert" } ] },
    { name: "Morale", questions: [ { text: "I feel motivated at work", type: "likert" }, { text: "Anything you want to flag for next quarter?", type: "text" } ] },
  ] },
  { title: "Psychological safety", category: "Team", builtIn: true, desc: "Can the team speak up, take risks and own decisions together?", sections: [
    { name: "Speaking up", questions: [ { text: "It is safe to take a risk on this team", type: "likert" }, { text: "I can bring up problems and tough issues", type: "likert" } ] },
    { name: "Inclusion", questions: [ { text: "My unique skills and talents are valued", type: "likert" }, { text: "No one on this team would deliberately undermine my efforts", type: "likert" } ] },
  ] },
  { title: "Onboarding check", category: "Competence", builtIn: true, desc: "Knowledge check for new hires covering routines and escalation paths.", sections: [
    { name: "Routines", questions: [ { text: "I know where to find our key procedures", type: "yesno" }, { text: "I know who to escalate an issue to", type: "yesno" } ] },
    { name: "Confidence", questions: [ { text: "I feel confident in my first weeks", type: "likert" } ] },
  ] },
];

const CATS = ["All", "Wellbeing", "Engagement", "Team", "Competence", "Custom"];

function docFromStarter(t: StarterTemplate): Doc {
  return {
    title: t.builtIn ? t.title : t.title,
    sections: t.sections.map((s) => ({
      id: uid("s"), name: s.name,
      questions: s.questions.map((q) => ({ id: uid("q"), text: q.text, type: q.type, options: defaultOptions(q.type) })),
    })),
  };
}
function blankDoc(): Doc {
  return { title: "Untitled assessment", sections: [{ id: uid("s"), name: "Section 1", questions: [{ id: uid("q"), text: "", type: "likert", options: [] }] }] };
}

function buildDefinition(doc: Doc, threshold: number) {
  const used = new Set<string>();
  const filled = doc.sections.filter((s) => s.questions.length);
  const dims = filled.map((s, i) => {
    let key = slug(s.name) || `section_${i + 1}`; const base = key; let n = 2;
    while (used.has(key)) key = `${base}_${n++}`;
    used.add(key);
    return { key, label: s.name.trim() || `Section ${i + 1}`, blurb: "" };
  });
  const scale = { min: 1, max: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree" };
  const items = filled.flatMap((s, si) => {
    const dk = dims[si].key;
    return s.questions.map((q, qi) => ({
      key: `${dk}_${qi + 1}`, dimension: dk, text: q.text.trim() || "Untitled question",
      type: q.type === "yesno" ? "single" : q.type,
      ...(q.options.length ? { options: q.options } : {}),
      required: true,
    }));
  });
  return { scale, dimensions: dims, items, strengthDimension: dims[0]?.key, threshold, aggregation: "Section mean" };
}

function QPreview({ q }: { q: Question }) {
  if (q.type === "likert") {
    return <div style={{ display: "flex", gap: 8 }}>{[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid var(--line-2)", color: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>{n}</span>)}</div>;
  }
  if (q.type === "yesno") {
    return <div style={{ display: "flex", gap: 8 }}><span className="pill sm open">Yes</span><span className="pill sm reject">No</span></div>;
  }
  if (q.type === "single" || q.type === "multi") {
    return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{q.options.map((o, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--muted)", background: "var(--canvas-2)", borderRadius: q.type === "multi" ? 6 : 999, padding: "5px 11px" }}><span style={{ width: 13, height: 13, borderRadius: q.type === "multi" ? 3 : "50%", border: "1.5px solid var(--line-2)" }} />{o}</span>)}</div>;
  }
  return <div style={{ height: 32, borderRadius: 6, border: "1px dashed var(--line-2)", background: "var(--canvas)", display: "flex", alignItems: "center", padding: "0 11px", fontSize: 11.5, color: "var(--faint)" }}>Free-text response</div>;
}

export function BuilderClient({ mine, demo = false }: { mine: StarterTemplate[]; demo?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [view, setView] = useState<"gallery" | "editor">("gallery");
  const [cat, setCat] = useState("All");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [anon, setAnon] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2600); }
  function update(fn: (d: Doc) => void) { setDoc((p) => { if (!p) return p; const d = clone(p); fn(d); return d; }); }

  function openDoc(d: Doc, id: string | null) { setDoc(d); setEditId(id); setView("editor"); window.scrollTo(0, 0); }

  // "Take survey (demo)" deep-link: load a demo and show its respondent preview.
  useEffect(() => {
    if (demo) { setDoc(docFromStarter(STARTERS[0])); setEditId(null); setView("editor"); setPreviewOpen(true); }
  }, [demo]);

  const all = [...STARTERS, ...mine];
  const cards = cat === "All" ? all : all.filter((t) => (t.builtIn ? t.category : "Custom") === cat || t.category === cat);

  const totalQ = doc?.sections.reduce((a, s) => a + s.questions.length, 0) ?? 0;
  const est = Math.max(1, Math.round(totalQ * 0.4));

  function save() {
    if (!doc) return;
    setError(null);
    if (!doc.title.trim()) { setError("Give the assessment a name."); return; }
    const def = buildDefinition(doc, 3.0);
    if (!def.dimensions.length || !def.items.length) { setError("Add at least one section with a question."); return; }
    start(async () => {
      const res = await saveTemplate({ id: editId, name: doc.title.trim(), category: "custom", scope: "team", description: "", source: "", definition: def });
      if (res.error) { setError(res.error); return; }
      flash(editId ? "Saved" : "Created");
      setEditId(res.id ?? editId);
      router.refresh();
    });
  }

  // ---------------- GALLERY ----------------
  if (view === "gallery") {
    return (
      <>
        <div className="a-phead">
          <div>
            <div className="a-pt">Build an assessment</div>
            <div className="a-ps">Start from a template and tailor it, or build from scratch — define your own sections, questions and response types.</div>
          </div>
        </div>

        <div className="ab-cats" style={{ marginBottom: 18 }}>
          {CATS.map((c) => {
            const n = c === "All" ? all.length : all.filter((t) => (t.builtIn ? t.category : "Custom") === c || t.category === c).length;
            return <button key={c} className={`ab-cat${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}<span className="n">{n}</span></button>;
          })}
        </div>

        <div className="tpl-grid">
          <button className="tpl-card" style={{ cursor: "pointer", textAlign: "left", borderStyle: "dashed" }} onClick={() => openDoc(blankDoc(), null)}>
            <div className="tpl-card-h">
              <span className="tpl-card-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
              <div><div className="tpl-card-nm">Blank assessment</div><div className="tpl-card-desc">Build from scratch — add your own sections, questions and scoring.</div></div>
            </div>
            <div className="tpl-foot"><span className="meta" style={{ color: "var(--green)" }}>Start blank →</span></div>
          </button>
          {cards.map((t, i) => (
            <button key={t.id ?? `s${i}`} className="tpl-card" style={{ cursor: "pointer", textAlign: "left" }} onClick={() => openDoc(docFromStarter(t), t.id ?? null)}>
              <div className="tpl-card-h">
                <span className="tpl-card-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="tpl-card-nm">{t.title}</span>
                    <span className={`pill sm ${t.builtIn ? "draft" : "internal"}`}>{t.builtIn ? t.category : "Custom"}</span>
                  </div>
                  <div className="tpl-card-desc">{t.desc}</div>
                </div>
              </div>
              <div className="tpl-foot">
                <span className="meta" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {t.sections.length} {t.sections.length === 1 ? "section" : "sections"} · {t.sections.reduce((a, s) => a + s.questions.length, 0)} Q
                </span>
                <span className="sp" />
                <span className="meta" style={{ color: "var(--green)" }}>{t.builtIn ? "Use template →" : "Edit →"}</span>
              </div>
            </button>
          ))}
        </div>

        <div className={`toast${toast ? " show" : ""}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg><span>{toast}</span></div>
      </>
    );
  }

  // ---------------- EDITOR ----------------
  if (!doc) return null;
  return (
    <>
      <div className="a-phead" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{editId ? "Edit assessment" : "Assessment title"}</div>
          <input
            className="ab-titleinp"
            value={doc.title}
            onChange={(e) => update((d) => { d.title = e.target.value; })}
            placeholder="Untitled assessment"
          />
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12.5, color: "var(--muted)" }}>
            <span>◳ {doc.sections.length} sections</span>
            <span>☰ {totalQ} questions</span>
            <span>◷ ~{est} min to complete</span>
          </div>
        </div>
        <div className="a-pr">
          <button className="btn-sec" onClick={() => { setView("gallery"); setPreviewOpen(false); }}>Templates</button>
          <button className="btn-sec" onClick={() => setPreviewOpen(true)}>Preview</button>
          <button className="btn-prim" onClick={save} disabled={pending}>{pending ? "Saving…" : editId ? "Save" : "Create"}</button>
        </div>
      </div>
      {error ? <div className="form-err" style={{ marginBottom: 14, maxWidth: 720 }}>{error}</div> : null}

      <div className="ab2-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {doc.sections.map((sec, si) => (
            <div key={sec.id} className="tbl-card">
              <div className="ab2-sechead">
                <span className="ab2-grip">⠿</span>
                <input className="ab2-secname" value={sec.name} placeholder="Section name" onChange={(e) => update((d) => { d.sections[si].name = e.target.value; })} />
                <span className="ab2-qbadge">{sec.questions.length} Q</span>
                <button className="icon-btn danger" title="Delete section" onClick={() => update((d) => { d.sections.splice(si, 1); })}><Trash /></button>
              </div>
              {sec.questions.map((q, qi) => (
                <div key={q.id} className="ab2-q">
                  <div className="ab2-qrow">
                    <span className="ab2-qn">{qi + 1}</span>
                    <input className="inp" value={q.text} placeholder="Type your question…" onChange={(e) => update((d) => { d.sections[si].questions[qi].text = e.target.value; })} />
                  </div>
                  <div className="ab2-qctl">
                    <select className="inp" style={{ flex: "none", width: 150 }} value={q.type} onChange={(e) => update((d) => { const t = e.target.value as QType; const qq = d.sections[si].questions[qi]; qq.type = t; if (!qq.options.length) qq.options = defaultOptions(t); })}>
                      {(Object.keys(TYPE_LABEL) as QType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}><QPreview q={q} /></span>
                    <button className="icon-btn danger" title="Delete question" onClick={() => update((d) => { d.sections[si].questions.splice(qi, 1); })}><Trash /></button>
                  </div>
                </div>
              ))}
              <button className="addlink" style={{ padding: "12px 16px" }} onClick={() => update((d) => { d.sections[si].questions.push({ id: uid("q"), text: "", type: "likert", options: [] }); })}>＋ Add question</button>
            </div>
          ))}
          <button className="ab2-addsec" onClick={() => update((d) => { d.sections.push({ id: uid("s"), name: "New section", questions: [] }); })}>＋ Add section</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="a-ovcard">
            <div className="eyebrow" style={{ marginBottom: 14 }}>Assessment settings</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <button onClick={() => setAnon((a) => !a)} aria-pressed={anon} className="ab2-toggle" style={{ background: anon ? "var(--green)" : "var(--line-2)" }}>
                <span style={{ left: anon ? 19 : 2 }} />
              </button>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>Anonymous responses</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Strip identities on submit</div></div>
            </div>
            <div className="a-fact" style={{ marginTop: 12 }}><span className="k">Below-threshold flag</span><span className="v" style={{ fontVariantNumeric: "tabular-nums" }}>&lt; 3.0</span></div>
            <div className="a-fact"><span className="k">Triggers workshop</span><span className="v" style={{ color: "var(--green)" }}>On</span></div>
          </div>
          <div className="humannote" style={{ marginTop: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <div><b style={{ fontStyle: "normal" }}>How scoring works.</b> Likert questions roll up into section bands. Choice and text questions are kept as supporting context — never reduced to a single verdict. A person reviews before any workshop is triggered.</div>
          </div>
        </div>
      </div>

      {previewOpen ? (
        <div className="na-overlay2" onClick={() => setPreviewOpen(false)}>
          <div className="na-modal2" onClick={(e) => e.stopPropagation()}>
            <div className="ab2-pvhead">
              <div><div className="eyebrow" style={{ color: "rgba(255,255,255,.65)" }}>Respondent preview</div><div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, marginTop: 3 }}>{doc.title || "Untitled"}</div></div>
              <button className="icon-btn" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)", background: "transparent" }} onClick={() => setPreviewOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="ab2-pvbody">
              {doc.sections.map((s) => (
                <div key={s.id} style={{ marginBottom: 18 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginBottom: 3 }}>{s.name || "Untitled"}</div>
                  <div className="eyebrow" style={{ marginBottom: 12 }}>{s.questions.length} questions</div>
                  {s.questions.map((q, i) => (
                    <div key={q.id} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13.5, marginBottom: 10 }}>{i + 1}. {q.text || "Untitled question"}</div>
                      <QPreview q={q} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className={`toast${toast ? " show" : ""}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg><span>{toast}</span></div>
    </>
  );
}

function Trash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
}
