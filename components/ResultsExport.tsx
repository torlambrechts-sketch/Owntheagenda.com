"use client";

import { toCsv, downloadText, fileSlug } from "@/lib/exporting";

// Take an (unmasked) team assessment reading away as CSV or JSON. Only the
// anonymous aggregate is exported — never individual responses — so it's safe to
// render wherever the unmasked reading is already shown.
export type ExportDim = { key: string; label: string; mean: number | null };

export function ResultsExport({
  surveyName,
  instrumentName,
  scaleMax,
  respondents,
  composite,
  dims,
}: {
  surveyName: string;
  instrumentName: string;
  scaleMax: number;
  respondents: number;
  composite: number | null;
  dims: ExportDim[];
}) {
  const base = fileSlug(`${surveyName}-${instrumentName}`);

  function exportCsv() {
    const rows: (string | number | null)[][] = [
      ["Survey", surveyName],
      ["Instrument", instrumentName],
      ["Respondents", respondents],
      ["Overall index (0-100)", composite],
      [],
      ["Dimension", `Mean (/${scaleMax})`],
      ...dims.map((d) => [d.label, d.mean == null ? null : Number(d.mean.toFixed(2))]),
    ];
    downloadText(`${base}.csv`, "text/csv", toCsv(rows));
  }

  function exportJson() {
    const payload = {
      survey: surveyName,
      instrument: instrumentName,
      respondents,
      composite,
      scaleMax,
      dimensions: dims.map((d) => ({ key: d.key, label: d.label, mean: d.mean })),
      exportedAt: new Date().toISOString(),
    };
    downloadText(`${base}.json`, "application/json", JSON.stringify(payload, null, 2));
  }

  return (
    <div className="rxport">
      <span className="rxport-lab">Export</span>
      <button className="rxport-btn" onClick={exportCsv}>CSV</button>
      <button className="rxport-btn" onClick={exportJson}>JSON</button>
    </div>
  );
}
