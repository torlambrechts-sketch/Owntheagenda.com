// Presentational readout for a leadership score (personal or team aggregate).
// No client hooks, so it renders on the server or inside a client component.

export type Readout = {
  overall: number | string;
  respondents?: number;
  categories: { code: string; name: string; mean: number | string }[];
  facets: { code: string; name: string; category: string; mean: number | string }[];
};

export function ScoreReadout({ data, lowestN = 3 }: { data: Readout; lowestN?: number }) {
  const facets = (data.facets ?? []).map((f) => ({ ...f, mean: Number(f.mean) }));
  const lowest = [...facets].sort((a, b) => a.mean - b.mean).slice(0, lowestN);
  return (
    <div className="lead-results">
      <div className="lead-overall">
        <div className="lead-score">{Number(data.overall).toFixed(2)}<small>/7</small></div>
        <div className="lead-overall-l">
          Overall leadership effectiveness{data.respondents ? ` · ${data.respondents} respondents` : ""}
        </div>
      </div>

      <h3 className="lead-h">By category</h3>
      <div className="lead-cats">
        {(data.categories ?? []).map((c) => (
          <div className="lead-cat" key={c.code}>
            <div className="lead-cat-h"><span>{c.name}</span><b>{Number(c.mean).toFixed(2)}</b></div>
            <div className="lead-bar"><span style={{ width: `${(Number(c.mean) / 7) * 100}%` }} /></div>
          </div>
        ))}
      </div>

      <h3 className="lead-h">Lowest facets — start here</h3>
      <ul className="lead-low">
        {lowest.map((f) => <li key={f.code}><b>{f.name}</b><span>{f.mean.toFixed(2)}</span></li>)}
      </ul>

      <details className="lead-allfacets">
        <summary>All 21 facets</summary>
        <ul>{facets.map((f) => <li key={f.code}><span>{f.name}</span><b>{f.mean.toFixed(2)}</b></li>)}</ul>
      </details>
    </div>
  );
}
