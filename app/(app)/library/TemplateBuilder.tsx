"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveTemplate } from "./actions";

type Dim = { label: string; blurb: string };
type Item = { text: string; dim: number };

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
    items?: { key: string; text: string; dimension: string }[];
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
    ? seed.items.map((it) => ({ text: it.text, dim: keyToIdx.get(it.dimension) ?? 0 }))
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

  const keys = useMemo(() => dimKeys(dims), [dims]);

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
        return { key: `${kDimKeys[di]}_${counts[di]}`, dimension: kDimKeys[di], text: it.text.trim() };
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
      else { router.push("/library"); router.refresh(); }
    });
  }

  const namedDims = dims.map((d, i) => ({ i, label: d.label.trim() })).filter((d) => d.label);

  return (
    <div>
      <Link href="/library" className="linkbtn" style={{ fontSize: 12 }}>‹ Library</Link>
      <h1 className="page-title" style={{ marginTop: 6 }}>{existing ? "Edit assessment" : "New assessment"}</h1>
      <p className="page-sub">Custom instruments work everywhere a built-in does — the picker, the library and any survey block.</p>

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
        <p className="page-sub" style={{ marginTop: -4 }}>Each is rated on the scale above.</p>
        {items.map((it, i) => (
          <div className="builder-row" key={i}>
            <input className="inp" value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} placeholder="Question text" style={{ flex: 2 }} />
            <select className="inp" value={it.dim} onChange={(e) => setItem(i, { dim: Number(e.target.value) })}>
              {namedDims.length ? namedDims.map((d) => (<option key={d.i} value={d.i}>{d.label}</option>)) : <option value={0}>—</option>}
            </select>
            <button className="rowdel" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label="Remove question">✕</button>
          </div>
        ))}
        <button className="btn-ghost" style={{ flex: "none", marginTop: 8 }} onClick={() => setItems((x) => [...x, { text: "", dim: namedDims[0]?.i ?? 0 }])}>+ Add question</button>
      </div>

      {error ? <div className="formerr">{error}</div> : null}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Link href="/library" className="btn-ghost" style={{ flex: "none" }}>Cancel</Link>
        <button className="btn-prim" disabled={pending} onClick={save}>{pending ? "Saving…" : existing ? "Save changes" : "Create assessment"}</button>
      </div>
    </div>
  );
}
