"use client";

import { useMemo, useState, type ReactNode } from "react";

// Reusable client-side filter / sort / search for any list surface. A caller
// passes its rows and a config (what to search, which sorts, which facet
// filters); the hook returns the processed `view` plus a ready-made `controls`
// toolbar to render above the list. Facets are OR within a facet, AND across
// facets. Sorting is stable on top of the active filters.

export type SortDef<T> = { key: string; label: string; cmp: (a: T, b: T) => number };
export type FacetDef<T> = {
  key: string;
  label: string;
  multi?: boolean;
  options: { value: string; label: string; test: (row: T) => boolean }[];
};
export type TableControlsConfig<T> = {
  search?: { placeholder?: string; text: (row: T) => string };
  sorts?: SortDef<T>[];
  facets?: FacetDef<T>[];
};

export type TableControls<T> = {
  view: T[];
  controls: ReactNode;
  active: boolean; // any search/facet set, or a non-default sort
};

export function useTableControls<T>(rows: T[], cfg: TableControlsConfig<T>): TableControls<T> {
  const defaultSort = cfg.sorts?.[0]?.key ?? "";
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState(defaultSort);
  const [sel, setSel] = useState<Record<string, Set<string>>>({});

  const selCount = Object.values(sel).reduce((n, s) => n + s.size, 0);
  const active = q.trim().length > 0 || selCount > 0 || sortKey !== defaultSort;

  const view = useMemo(() => {
    let out = rows;
    if (cfg.search && q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((r) => cfg.search!.text(r).toLowerCase().includes(needle));
    }
    for (const f of cfg.facets ?? []) {
      const chosen = sel[f.key];
      if (chosen && chosen.size) {
        out = out.filter((r) =>
          f.options.some((o) => chosen.has(o.value) && o.test(r)),
        );
      }
    }
    const s = cfg.sorts?.find((x) => x.key === sortKey);
    if (s) out = [...out].sort(s.cmp);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sortKey, sel]);

  function toggle(fKey: string, val: string, multi?: boolean) {
    setSel((prev) => {
      const cur = new Set(prev[fKey] ?? []);
      if (cur.has(val)) cur.delete(val);
      else {
        if (!multi) cur.clear();
        cur.add(val);
      }
      return { ...prev, [fKey]: cur };
    });
  }
  function reset() {
    setQ("");
    setSortKey(defaultSort);
    setSel({});
  }

  const controls = (
    <div className="tctl">
      {cfg.search ? (
        <input
          className="tctl-search"
          placeholder={cfg.search.placeholder ?? "Search…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      ) : null}
      {(cfg.facets ?? []).map((f) => (
        <div className="tctl-facet" key={f.key}>
          <span className="tctl-flabel">{f.label}</span>
          {f.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`tctl-chip${sel[f.key]?.has(o.value) ? " on" : ""}`}
              onClick={() => toggle(f.key, o.value, f.multi)}
            >
              {o.label}
            </button>
          ))}
        </div>
      ))}
      {cfg.sorts && cfg.sorts.length > 1 ? (
        <label className="tctl-sort">
          <span>Sort</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {cfg.sorts.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
      ) : null}
      <span className="tctl-count">{view.length} of {rows.length}</span>
      {active ? (
        <button type="button" className="linkbtn xs tctl-reset" onClick={reset}>Reset</button>
      ) : null}
    </div>
  );

  return { view, controls, active };
}
