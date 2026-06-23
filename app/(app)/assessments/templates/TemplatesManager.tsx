"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteTemplate } from "../../library/actions";

export type TemplateCard = {
  id: string;
  key: string;
  name: string;
  category: string;
  scope: "team" | "individual";
  source: string | null;
  description: string | null;
  sections: number;
  questions: number;
  sectionNames: string[];
  scale: string | null;
  owned: boolean;
  builtIn: boolean;
};

// Tidy a raw category slug (e.g. "team_effectiveness") into a label.
function catLabel(c: string) {
  return c.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

export function TemplatesManager({ cards, isAdmin }: { cards: TemplateCard[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Category filter, derived from the live rows (never hardcoded).
  const cats = useMemo(() => {
    const set = new Map<string, number>();
    for (const c of cards) set.set(c.category, (set.get(c.category) ?? 0) + 1);
    return [{ key: "all", label: "All", n: cards.length }, ...Array.from(set.entries()).sort().map(([key, n]) => ({ key, label: catLabel(key), n }))];
  }, [cards]);
  const [cat, setCat] = useState("all");
  const shown = cat === "all" ? cards : cards.filter((c) => c.category === cat);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2600); }

  function onDelete(c: TemplateCard) {
    if (!c.owned || c.builtIn) return;
    if (!confirm(`Delete “${c.name}”? This removes the template for the whole workspace. Surveys already sent keep their own snapshot.`)) return;
    setError(null);
    setBusyId(c.id);
    start(async () => {
      const res = await deleteTemplate(c.id);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      flash("Template deleted");
      router.refresh();
    });
  }

  return (
    <>
      <div className="a-phead">
        <div>
          <div className="a-pt">Templates</div>
          <div className="a-ps">Reusable assessment blueprints — the built-in library plus your workspace&rsquo;s own. View their structure, edit them, or start a new one from a copy.</div>
        </div>
        <div className="a-pr">
          <Link className="btn-sec" href="/assessments">Back to suite</Link>
          {isAdmin ? <Link className="btn-prim" href="/library/new">＋ New template</Link> : null}
        </div>
      </div>

      {error ? <div className="a-note" style={{ marginBottom: 14 }}>{error}</div> : null}

      {cats.length > 1 ? (
        <div className="ab-cats" style={{ marginBottom: 18 }}>
          {cats.map((c) => (
            <button key={c.key} className={`ab-cat${cat === c.key ? " on" : ""}`} onClick={() => setCat(c.key)}>
              {c.label}<span className="n">{c.n}</span>
            </button>
          ))}
        </div>
      ) : null}

      {shown.length ? (
        <div className="tpl-grid">
          {shown.map((c) => (
            <div className="tpl-card" key={c.id}>
              <div className="tpl-card-h">
                <span className="tpl-card-ic"><DocIcon /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="tpl-card-nm">{c.name}</span>
                    <span className={`pill sm ${c.scope === "individual" ? "interview" : "open"}`}>{c.scope === "individual" ? "Individual" : "Team"}</span>
                    {c.builtIn ? <span className="pill sm draft">Built-in</span> : <span className="pill sm internal">Custom</span>}
                  </div>
                  <div className="tpl-card-desc">{c.description || `${catLabel(c.category)} assessment.`}</div>
                </div>
              </div>

              {c.sectionNames.length ? (
                <div className="tpl-chips">
                  {c.sectionNames.map((s, i) => <span className="a-dimchip" key={i}>{s}</span>)}
                  {c.sections > c.sectionNames.length ? <span className="a-dimchip">+{c.sections - c.sectionNames.length}</span> : null}
                </div>
              ) : null}

              <div className="tpl-foot">
                <span className="meta" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {c.sections} {c.sections === 1 ? "section" : "sections"} · {c.questions} Q{c.scale ? ` · ${c.scale}` : ""}
                </span>
                <span className="sp" />
                {isAdmin ? (
                  <>
                    <Link className="btn-sec" href={`/library/new?from=${c.id}`} title="Start a new template from a copy">Use</Link>
                    {c.owned && !c.builtIn ? (
                      <>
                        <Link className="btn-sec" href={`/library/new?id=${c.id}`}>Edit</Link>
                        <button className="icon-btn danger" onClick={() => onDelete(c)} disabled={pending && busyId === c.id} title="Delete template" aria-label={`Delete ${c.name}`}>
                          <TrashIcon />
                        </button>
                      </>
                    ) : null}
                  </>
                ) : (
                  <Link className="btn-sec" href="/assessments/library">View in library</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">No templates in this category.</div>
      )}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
