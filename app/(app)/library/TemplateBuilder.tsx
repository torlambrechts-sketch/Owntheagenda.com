"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AssessmentRunner } from "@/components/AssessmentRunner";
import { saveTemplate } from "./actions";

type Dim = { label: string; blurb: string };
type Item = { text: string; dim: number; reverse?: boolean };

export type ExistingTemplate = {
  id: string;
  name: string;
  category: string;
  scope: string;
  source: string | null;
  description: string | null;
  definition: {
    scale?: { min?: number; max?: number; minLabel?: string; maxLabel?: string };
    dimensions?: { key: string; label: string; blurb?: string }[];
    items?: { key: string; text: string; dimension: string; reverse?: boolean }[];
    strengthDimension?: string;
  } | null;
};

// One reusable item drawn from any readable instrument, for the question bank.
export type BankItem = { text: string; instrument: string; source: string | null; dimension: string | null };

const CATEGORY_LABEL: Record<string, string> = {
  psych_safety: "Psychological safety",
  team_effectiveness: "Team effectiveness",
  team_learning: "Team learning",
  personality: "Personality & working style",
  custom: "Custom",
};
function catLabel(c: string): string { return CATEGORY_LABEL[c] ?? c; }

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Derive unique, non-empty dimension keys from labels.
function dimKeys(dims: Dim[]): string[] {
  const used = new Set<string>();
  return dims.map((d, i) => {
    let base = slug(d.label) || `dim_${i + 1}`;
    let key = base;
    let n = 2;
    while (used.has(key)) key = `${base}_${n++}`;
    used.add(key);
    return key;
  });
}

export function TemplateBuilder({
  existing,
  seed = null,
  bankItems = [],
  categories = [],
}: {
  existing: ExistingTemplate | null;
  seed?: ExistingTemplate | null;
  bankItems?: BankItem[];
  categories?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Prefill from the row being edited, else from a clone seed, else blank.
  const base = existing ?? seed;
  const isClone = !existing && !!seed;
  const def = base?.definition ?? null;
  const seedDims: Dim[] = def?.dimensions?.length
    ? def.dimensions.map((d) => ({ label: d.label, blurb: d.blurb ?? "" }))
    : [{ label: "", blurb: "" }];
  const keyToIdx = new Map((def?.dimensions ?? []).map((d, i) => [d.key, i]));
  const seedItems: Item[] = def?.items?.length
    ? def.items.map((it) => ({ text: it.text, dim: keyToIdx.get(it.dimension) ?? 0, reverse: it.reverse }))
    : [{ text: "", dim: 0 }];

  const [name, setName] = useState(existing?.name ?? (seed ? `Copy of ${seed.name}` : ""));
  const [scope, setScope] = useState(base?.scope ?? "team");
  const [category, setCategory] = useState(base?.category ?? "custom");
  const [description, setDescription] = useState(base?.description ?? "");
  const [source, setSource] = useState(base?.source ?? "");
  const [scaleMin, setScaleMin] = useState(def?.scale?.min ?? 1);
  const [scaleMax, setScaleMax] = useState(def?.scale?.max ?? 7);
  const [minLabel, setMinLabel] = useState(def?.scale?.minLabel ?? "Strongly disagree");
  const [maxLabel, setMaxLabel] = useState(def?.scale?.maxLabel ?? "Strongly agree");
  const [dims, setDims] = useState<Dim[]>(seedDims);
  const [items, setItems] = useState<Item[]>(seedItems);
  const [strengthIdx, setStrengthIdx] = useState(() => {
    const k = def?.strengthDimension;
    return k ? keyToIdx.get(k) ?? 0 : 0;
  });
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [bankOpen, setBankOpen] = useState(false);
  const [bankQ, setBankQ] = useState("");
  const [newCat, setNewCat] = useState(false);

  const catList = useMemo(
    () => Array.from(new Set([...categories, category].filter(Boolean))).sort(),
    [categories, category],
  );

  function touch(k: string) { setTouched((t) => new Set(t).add(k)); }
  function setDim(i: number, patch: Partial<Dim>) {
    setDims((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function setItem(i: number, patch: Partial<Item>) {
    setItems((it) => it.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function removeDim(i: number) {
    setDims((d) => d.filter((_, j) => j !== i));
    // re-point items off the removed dimension
    setItems((it) => it.map((x) => ({ ...x, dim: x.dim === i ? 0 : x.dim > i ? x.dim - 1 : x.dim })));
    setStrengthIdx((s) => (s === i ? 0 : s > i ? s - 1 : s));
  }
  function addQuestion(text = "") {
    setItems((x) => [...x, { text, dim: namedDims[0]?.i ?? 0 }]);
  }

  // ---- validation (inline + on save) ----
  const cleanDims = dims.filter((d) => d.label.trim());
  const cleanItems = items.filter((it) => it.text.trim());
  function validate(): string | null {
    if (!name.trim()) return "Give the assessment a name.";
    if (!Number.isInteger(scaleMin) || !Number.isInteger(scaleMax)) return "The scale min and max must be whole numbers.";
    if (!(scaleMax > scaleMin)) return "The scale max must be greater than the min.";
    if (scaleMax - scaleMin > 10) return "Keep the scale to at most 11 points.";
    if (cleanDims.length === 0) return "Add at least one dimension.";
    if (cleanItems.length === 0) return "Add at least one question.";
    if (cleanItems.some((it) => !dims[it.dim]?.label.trim())) return "Every question must map to a named dimension.";
    return null;
  }
  const nameErr = touched.has("name") && !name.trim() ? "A name is required." : null;
  const scaleErr = touched.has("scale") && !(scaleMax > scaleMin) ? "Max must be greater than min." : null;

  function buildDefinition() {
    // Keep only named dimensions; remap item dim indices accordingly.
    const keep: number[] = [];
    dims.forEach((d, i) => { if (d.label.trim()) keep.push(i); });
    const remap = new Map(keep.map((origIdx, newIdx) => [origIdx, newIdx]));
    const keptDims = keep.map((i) => dims[i]);
    const kDimKeys = dimKeys(keptDims);
    const outDims = keptDims.map((d, i) => ({ key: kDimKeys[i], label: d.label.trim(), blurb: d.blurb.trim() }));

    const counts: Record<number, number> = {};
    const outItems = items
      .filter((it) => it.text.trim() && remap.has(it.dim))
      .map((it) => {
        const di = remap.get(it.dim)!;
        counts[di] = (counts[di] ?? 0) + 1;
        const out: { key: string; dimension: string; text: string; reverse?: boolean } = { key: `${kDimKeys[di]}_${counts[di]}`, dimension: kDimKeys[di], text: it.text.trim() };
        if (it.reverse) out.reverse = true;
        return out;
      });

    const d: Record<string, unknown> = {
      scale: { min: Math.round(scaleMin), max: Math.round(scaleMax), minLabel: minLabel.trim(), maxLabel: maxLabel.trim() },
      dimensions: outDims,
      items: outItems,
    };
    if (scope === "team") {
      const sIdx = remap.get(strengthIdx) ?? 0;
      d.strengthDimension = outDims[sIdx]?.key ?? outDims[0].key;
    }
    return d;
  }

  function save() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    startTransition(async () => {
      const res = await saveTemplate({
        // A clone saves as a brand-new instrument (no id).
        id: existing?.id ?? null,
        name: name.trim(),
        category: category.trim() || "custom",
        scope,
        description,
        source,
        definition: buildDefinition(),
      });
      if (res.error) setError(res.error);
      else { router.push("/assessments"); router.refresh(); }
    });
  }

  const namedDims = dims.map((d, i) => ({ i, label: d.label.trim() })).filter((d) => d.label);

  // Live preview instrument from the current draft.
  const previewInstrument = useMemo(() => {
    const builtKeys = dimKeys(cleanDims);
    const keepIdx = dims.map((d, i) => ({ d, i })).filter((x) => x.d.label.trim());
    const idxToKey = new Map(keepIdx.map((x, n) => [x.i, builtKeys[n]]));
    const counter: Record<string, number> = {};
    return {
      name: name.trim() || "Untitled assessment",
      scale: { min: Math.round(scaleMin), max: Math.round(scaleMax), minLabel: minLabel.trim() || "Low", maxLabel: maxLabel.trim() || "High" },
      dimensions: keepIdx.map((x, n) => ({ key: builtKeys[n], label: x.d.label.trim() })),
      items: items
        .filter((it) => it.text.trim() && idxToKey.has(it.dim))
        .map((it) => {
          const dk = idxToKey.get(it.dim)!;
          counter[dk] = (counter[dk] ?? 0) + 1;
          return { key: `${dk}_${counter[dk]}`, dimension: dk, text: it.text.trim() };
        }),
    };
  }, [name, scaleMin, scaleMax, minLabel, maxLabel, dims, items, cleanDims]);
  const canPreview = previewInstrument.items.length > 0;

  const bankResults = useMemo(() => {
    const q = bankQ.trim().toLowerCase();
    const existingText = new Set(items.map((it) => it.text.trim().toLowerCase()).filter(Boolean));
    return bankItems
      .filter((b) => !existingText.has(b.text.toLowerCase()))
      .filter((b) => !q || b.text.toLowerCase().includes(q) || (b.dimension ?? "").toLowerCase().includes(q) || b.instrument.toLowerCase().includes(q))
      .slice(0, 40);
  }, [bankItems, bankQ, items]);

  return (
    <div>
      <Link href="/assessments" className="linkbtn" style={{ fontSize: 12 }}>‹ Assessments</Link>
      <div className="bld-head">
        <div>
          <h1 className="page-title" style={{ marginTop: 6 }}>{existing ? "Edit assessment" : isClone ? "New assessment (from a copy)" : "New assessment"}</h1>
          <p className="page-sub">Custom instruments work everywhere a built-in does — the picker, the library and any survey block.{isClone ? " Starting from a copy of an existing instrument." : ""}</p>
        </div>
        <div className="bld-headactions">
          <button className={`btn-sec${preview ? " on" : ""}`} onClick={() => setPreview((p) => !p)} disabled={!canPreview} title={canPreview ? "" : "Add a question to preview"}>{preview ? "✓ Preview" : "▷ Preview"}</button>
        </div>
      </div>

      <div className={`bld-split${preview ? " withpreview" : ""}`}>
        <div className="bld-form">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cat-head" style={{ marginTop: 0, fontSize: 15 }}>Basics</div>
        <div className="field">
          <label>Name</label>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => touch("name")} placeholder="e.g. Onboarding Health Check" />
          {nameErr ? <div className="fielderr">{nameErr}</div> : null}
        </div>
        <div className="two">
          <div className="field">
            <label>Scope</label>
            <select className="inp" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="team">Team — anonymous group read</option>
              <option value="individual">Individual — private self-assessment</option>
            </select>
          </div>
          <div className="field">
            <label>Category</label>
            {newCat ? (
              <input className="inp" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="new category" autoFocus onBlur={() => { if (!category.trim()) setNewCat(false); }} />
            ) : (
              <select
                className="inp"
                value={category}
                onChange={(e) => { if (e.target.value === "__new") { setCategory(""); setNewCat(true); } else setCategory(e.target.value); }}
              >
                {catList.map((c) => (<option key={c} value={c}>{catLabel(c)}</option>))}
                <option value="__new">＋ New category…</option>
              </select>
            )}
          </div>
        </div>
        <div className="field">
          <label>Description <span className="opt">(optional)</span></label>
          <input className="inp" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Source / attribution <span className="opt">(optional)</span></label>
          <input className="inp" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cat-head" style={{ marginTop: 0, fontSize: 15 }}>Scale</div>
        <div className="two">
          <div className="field">
            <label>Min</label>
            <input className="inp" type="number" step={1} value={scaleMin} onChange={(e) => setScaleMin(Number(e.target.value))} onBlur={() => touch("scale")} />
          </div>
          <div className="field">
            <label>Max</label>
            <input className="inp" type="number" step={1} value={scaleMax} onChange={(e) => setScaleMax(Number(e.target.value))} onBlur={() => touch("scale")} />
          </div>
        </div>
        {scaleErr ? <div className="fielderr">{scaleErr}</div> : null}
        <div className="two">
          <div className="field">
            <label>Low label</label>
            <input className="inp" value={minLabel} onChange={(e) => setMinLabel(e.target.value)} />
          </div>
          <div className="field">
            <label>High label</label>
            <input className="inp" value={maxLabel} onChange={(e) => setMaxLabel(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cat-head" style={{ marginTop: 0, fontSize: 15 }}>Dimensions <span className="n">{dims.length}</span></div>
        <p className="page-sub" style={{ marginTop: -4 }}>The themes you’re measuring. Each question belongs to one.</p>
        {dims.map((d, i) => (
          <div className="builder-row" key={i}>
            <input className="inp" value={d.label} onChange={(e) => setDim(i, { label: e.target.value })} placeholder="Dimension name" />
            <input className="inp" value={d.blurb} onChange={(e) => setDim(i, { blurb: e.target.value })} placeholder="Short blurb (optional)" />
            <button className="rowdel" onClick={() => removeDim(i)} disabled={dims.length === 1} aria-label="Remove dimension">✕</button>
          </div>
        ))}
        <button className="btn-ghost" style={{ flex: "none", marginTop: 8 }} onClick={() => setDims((d) => [...d, { label: "", blurb: "" }])}>+ Add dimension</button>
        {scope === "team" && namedDims.length > 1 ? (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Climate-strength dimension <span className="opt">(which theme drives the “how much we agree” read)</span></label>
            <select className="inp" value={strengthIdx} onChange={(e) => setStrengthIdx(Number(e.target.value))}>
              {namedDims.map((d) => (<option key={d.i} value={d.i}>{d.label}</option>))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cat-head" style={{ marginTop: 0, fontSize: 15, display: "flex", alignItems: "center" }}>
          Questions <span className="n">{items.length}</span>
          <button className="btn-ghost" style={{ flex: "none", marginLeft: "auto" }} onClick={() => setBankOpen(true)}>⌕ Add from library</button>
        </div>
        <p className="page-sub" style={{ marginTop: -4 }}>Each is rated on the scale above. Use <span style={{ fontWeight: 600 }}>⇄</span> to reverse-score a question (a high answer counts as low on its dimension) — a couple per dimension reduces yes-to-everything bias.</p>
        {items.map((it, i) => (
          <div className="builder-row" key={i}>
            <input className="inp" value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} placeholder="Question text" style={{ flex: 2 }} />
            <select className="inp" value={it.dim} onChange={(e) => setItem(i, { dim: Number(e.target.value) })}>
              {namedDims.length ? namedDims.map((d) => (<option key={d.i} value={d.i}>{d.label}</option>)) : <option value={0}>—</option>}
            </select>
            <button
              className={`revtog${it.reverse ? " on" : ""}`}
              onClick={() => setItem(i, { reverse: !it.reverse })}
              title={it.reverse ? "Reverse-scored: a high answer counts as low on this dimension. Click to make normal." : "Normal scoring. Click to reverse-score (a high answer counts as low)."}
              aria-pressed={it.reverse ? true : false}
            >⇄</button>
            <button className="rowdel" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label="Remove question">✕</button>
          </div>
        ))}
        <button className="btn-ghost" style={{ flex: "none", marginTop: 8 }} onClick={() => addQuestion()}>+ Add question</button>
      </div>

      {error ? <div className="formerr">{error}</div> : null}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Link href="/assessments" className="btn-ghost" style={{ flex: "none" }}>Cancel</Link>
        <button className="btn-prim" disabled={pending} onClick={save}>{pending ? "Saving…" : existing ? "Save changes" : "Create assessment"}</button>
      </div>
        </div>

        {preview ? (
          <div className="bld-preview">
            <div className="bld-preview-h">
              <span>Respondent preview</span>
              <div className="a-seg">
                <button className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")}>Desktop</button>
                <button className={device === "mobile" ? "on" : ""} onClick={() => setDevice("mobile")}>Mobile</button>
              </div>
            </div>
            <div className={`bld-preview-frame ${device}`}>
              {canPreview ? (
                <AssessmentRunner
                  key={`${previewInstrument.items.length}:${device}`}
                  instrument={previewInstrument}
                  submitLabel="Finish (preview)"
                  privacyNote={scope === "team" ? "Anonymous in aggregate." : "Private to you."}
                  onSubmit={() => { /* preview only — no save */ }}
                />
              ) : (
                <p className="page-sub">Add a named dimension and a question to preview the respondent experience.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {bankOpen ? (
        <div className="libpanel-backdrop" onClick={() => setBankOpen(false)}>
          <div className="libpanel" onClick={(e) => e.stopPropagation()}>
            <div className="libpanel-h">
              <div>
                <div className="pact">Question bank</div>
                <h2>Add from library</h2>
              </div>
              <button className="xbtn" onClick={() => setBankOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="libpanel-body">
              <input className="inp" placeholder="Search validated questions…" value={bankQ} onChange={(e) => setBankQ(e.target.value)} autoFocus />
              <p className="page-sub" style={{ marginTop: 6 }}>{bankResults.length} {bankResults.length === 1 ? "match" : "matches"} from your readable instruments. Adding inserts the wording into a new question you can edit and map to a dimension.</p>
              <div className="bank-list">
                {bankResults.map((b) => (
                  <div className="bank-row" key={`${b.instrument}:${b.text}`}>
                    <div className="bank-text">
                      <span>{b.text}</span>
                      <small>{b.instrument}{b.dimension ? ` · ${b.dimension}` : ""}{b.source ? ` · ${b.source}` : ""}</small>
                    </div>
                    <button className="btn-sec" onClick={() => addQuestion(b.text)}>＋ Add</button>
                  </div>
                ))}
                {bankResults.length === 0 ? <p className="page-sub">No matching questions.</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
