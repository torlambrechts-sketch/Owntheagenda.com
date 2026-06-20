"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveTemplate } from "./actions";
import { ITEM_BANK, BANK_TOPICS, searchBank, type BankItem } from "@/lib/itembank";

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

export function TemplateBuilder({ existing }: { existing: ExistingTemplate | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const seed = existing?.definition ?? null;
  const seedDims: Dim[] = seed?.dimensions?.length
    ? seed.dimensions.map((d) => ({ label: d.label, blurb: d.blurb ?? "" }))
    : [{ label: "", blurb: "" }];
  const keyToIdx = new Map((seed?.dimensions ?? []).map((d, i) => [d.key, i]));
  const seedItems: Item[] = seed?.items?.length
    ? seed.items.map((it) => ({ text: it.text, dim: keyToIdx.get(it.dimension) ?? 0, reverse: it.reverse }))
    : [{ text: "", dim: 0 }];

  const [name, setName] = useState(existing?.name ?? "");
  const [scope, setScope] = useState(existing?.scope ?? "team");
  const [category, setCategory] = useState(existing?.category ?? "custom");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [source, setSource] = useState(existing?.source ?? "");
  const [scaleMin, setScaleMin] = useState(seed?.scale?.min ?? 1);
  const [scaleMax, setScaleMax] = useState(seed?.scale?.max ?? 7);
  const [minLabel, setMinLabel] = useState(seed?.scale?.minLabel ?? "Strongly disagree");
  const [maxLabel, setMaxLabel] = useState(seed?.scale?.maxLabel ?? "Strongly agree");
  const [dims, setDims] = useState<Dim[]>(seedDims);
  const [items, setItems] = useState<Item[]>(seedItems);
  const [strengthIdx, setStrengthIdx] = useState(() => {
    const k = seed?.strengthDimension;
    return k ? keyToIdx.get(k) ?? 0 : 0;
  });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libQuery, setLibQuery] = useState("");
  const [libTopic, setLibTopic] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const keys = useMemo(() => dimKeys(dims), [dims]);
  const libResults = useMemo(() => searchBank(libQuery, libTopic), [libQuery, libTopic]);

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

  function togglePick(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Insert the picked library items, creating a dimension per item's suggested
  // label when one doesn't already exist. Drops the blank starter rows so the
  // first insert from a clean form lands cleanly. Skips duplicates by text.
  function addPicked() {
    const selected: BankItem[] = ITEM_BANK.filter((i) => picked.has(i.id));
    if (!selected.length) { setShowLibrary(false); return; }
    const baseDims = dims.some((d) => d.label.trim()) ? [...dims] : [];
    const baseItems = items.some((it) => it.text.trim()) ? [...items] : [];
    const seen = new Set(baseItems.map((it) => it.text.trim().toLowerCase()));
    const findDim = (label: string) =>
      baseDims.findIndex((d) => d.label.trim().toLowerCase() === label.trim().toLowerCase());
    for (const bi of selected) {
      if (seen.has(bi.text.trim().toLowerCase())) continue;
      let di = findDim(bi.dimension);
      if (di < 0) { baseDims.push({ label: bi.dimension, blurb: "" }); di = baseDims.length - 1; }
      baseItems.push({ text: bi.text, dim: di, reverse: bi.reverse });
      seen.add(bi.text.trim().toLowerCase());
    }
    setDims(baseDims);
    setItems(baseItems);
    setPicked(new Set());
    setShowLibrary(false);
  }

  function validate(): string | null {
    if (!name.trim()) return "Give the assessment a name.";
    if (!Number.isInteger(scaleMin) || !Number.isInteger(scaleMax)) return "The scale min and max must be whole numbers.";
    if (!(scaleMax > scaleMin)) return "The scale max must be greater than the min.";
    if (scaleMax - scaleMin > 10) return "Keep the scale to at most 11 points.";
    const cleanDims = dims.filter((d) => d.label.trim());
    if (cleanDims.length === 0) return "Add at least one dimension.";
    const cleanItems = items.filter((it) => it.text.trim());
    if (cleanItems.length === 0) return "Add at least one question.";
    if (cleanItems.some((it) => !dims[it.dim]?.label.trim())) return "Every question must map to a named dimension.";
    return null;
  }

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

    const def: Record<string, unknown> = {
      scale: { min: Math.round(scaleMin), max: Math.round(scaleMax), minLabel: minLabel.trim(), maxLabel: maxLabel.trim() },
      dimensions: outDims,
      items: outItems,
    };
    if (scope === "team") {
      const sIdx = remap.get(strengthIdx) ?? 0;
      def.strengthDimension = outDims[sIdx]?.key ?? outDims[0].key;
    }
    return def;
  }

  function save() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    startTransition(async () => {
      const res = await saveTemplate({
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

  return (
    <div>
      <Link href="/assessments" className="linkbtn" style={{ fontSize: 12 }}>‹ Assessments</Link>
      <h1 className="page-title" style={{ marginTop: 6 }}>{existing ? "Edit assessment" : "New assessment"}</h1>
      <p className="page-sub">Custom instruments work everywhere a built-in does — the picker, the library and any survey block.</p>

      <div className="qseg" role="tablist" aria-label="Edit or preview" style={{ marginBottom: 16 }}>
        <button className={!preview ? "on" : ""} onClick={() => setPreview(false)} role="tab" aria-selected={!preview}>Edit</button>
        <button className={preview ? "on" : ""} onClick={() => setPreview(true)} role="tab" aria-selected={preview}>Preview</button>
      </div>

      {preview ? (
        <InstrumentPreview
          name={name}
          scale={{ min: Math.round(scaleMin), max: Math.round(scaleMax), minLabel, maxLabel }}
          dims={dims}
          items={items}
        />
      ) : (
      <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cat-head" style={{ marginTop: 0, fontSize: 15 }}>Basics</div>
        <div className="field">
          <label>Name</label>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Onboarding Health Check" />
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
            <input className="inp" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="custom" />
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
            <input className="inp" type="number" step={1} value={scaleMin} onChange={(e) => setScaleMin(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Max</label>
            <input className="inp" type="number" step={1} value={scaleMax} onChange={(e) => setScaleMax(Number(e.target.value))} />
          </div>
        </div>
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
        <div className="cat-head" style={{ marginTop: 0, fontSize: 15 }}>Questions <span className="n">{items.length}</span></div>
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
        <div className="builder-actions">
          <button className="btn-ghost" style={{ flex: "none" }} onClick={() => setItems((x) => [...x, { text: "", dim: namedDims[0]?.i ?? 0 }])}>+ Add question</button>
          <button className="btn-ghost" style={{ flex: "none" }} onClick={() => { setShowLibrary((s) => !s); setPicked(new Set()); }} aria-expanded={showLibrary}>{showLibrary ? "Close library" : "+ Add from library"}</button>
        </div>
        {showLibrary ? (
          <div className="qlib">
            <p className="page-sub" style={{ marginTop: 0 }}>Proven items you can drop in and edit. Each lands under its suggested dimension — created if it doesn’t exist yet.</p>
            <input className="inp" value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="Search the question library…" aria-label="Search question library" />
            <div className="qlib-topics">
              <button className={libTopic === null ? "on" : ""} onClick={() => setLibTopic(null)}>All</button>
              {BANK_TOPICS.map((t) => (
                <button key={t} className={libTopic === t ? "on" : ""} onClick={() => setLibTopic(t)}>{t}</button>
              ))}
            </div>
            <div className="qlib-list">
              {libResults.length === 0 ? <div className="qlib-empty">No questions match.</div> : null}
              {libResults.map((bi) => (
                <label key={bi.id} className={`qlib-item${picked.has(bi.id) ? " on" : ""}`}>
                  <input type="checkbox" checked={picked.has(bi.id)} onChange={() => togglePick(bi.id)} />
                  <span className="qlib-text">{bi.text}</span>
                  <span className="qlib-meta">{bi.dimension}{bi.reverse ? " · reverse" : ""} · {bi.source}</span>
                </label>
              ))}
            </div>
            <div className="qlib-foot">
              <span className="qlib-count">{picked.size} selected</span>
              <button className="btn-prim sm" disabled={picked.size === 0} onClick={addPicked}>Add {picked.size || ""} {picked.size === 1 ? "question" : "questions"}</button>
            </div>
          </div>
        ) : null}
      </div>
      </>
      )}

      {error ? <div className="formerr">{error}</div> : null}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Link href="/assessments" className="btn-ghost" style={{ flex: "none" }}>Cancel</Link>
        <button className="btn-prim" disabled={pending} onClick={save}>{pending ? "Saving…" : existing ? "Save changes" : "Create assessment"}</button>
      </div>
    </div>
  );
}

// Read-only respondent-eye view of the instrument as it's being built — a quick
// "take it yourself" sanity check before saving. Mirrors the SurveyRespond
// layout so what the author sees here is what the team will see.
function InstrumentPreview({
  name,
  scale,
  dims,
  items,
}: {
  name: string;
  scale: { min: number; max: number; minLabel: string; maxLabel: string };
  dims: Dim[];
  items: Item[];
}) {
  const named = dims.map((d, i) => ({ ...d, i })).filter((d) => d.label.trim());
  const has = named.length > 0 && items.some((it) => it.text.trim());
  const opts =
    Number.isFinite(scale.max) && Number.isFinite(scale.min) && scale.max > scale.min
      ? Array.from({ length: scale.max - scale.min + 1 }, (_, k) => scale.min + k)
      : [];
  return (
    <div className="svcard">
      <div className="svcard-h"><b>{name.trim() || "Untitled assessment"}</b><span className="src">Preview</span></div>
      {!has ? (
        <p className="assess-lead">Add a dimension and a question to see the respondent preview.</p>
      ) : (
        <>
          <p className="assess-lead qprev-scale">{scale.min} = {scale.minLabel || "low"} · {scale.max} = {scale.maxLabel || "high"}. Anonymous in aggregate.</p>
          {named.map((d) => (
            <div className="svgroup" key={d.i}>
              <div className="svgroup-h">{d.label}</div>
              {items.filter((it) => it.dim === d.i && it.text.trim()).map((it, j) => (
                <div className="asq" key={j}>
                  <div className="asq-q"><span>{it.text}{it.reverse ? <em className="qprev-rev" title="Reverse-scored: a high answer counts as low on this dimension"> ⇄</em> : null}</span></div>
                  <div className="asopts sv7">{opts.map((v) => <button key={v} disabled>{v}</button>)}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
