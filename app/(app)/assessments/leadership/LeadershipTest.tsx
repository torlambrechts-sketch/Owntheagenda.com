"use client";

import { useMemo, useState } from "react";
import { AssessmentRunner } from "@/components/AssessmentRunner";
import { scoreLeadership, saveLeadershipResponse } from "./actions";
import { ScoreReadout, type Readout } from "./ScoreReadout";

export type Question = { key: string; ord: number; text: string; reverse: boolean };
export type Facet = { code: string; name: string; questions: Question[] };
export type Category = { code: string; name: string; facets: Facet[] };

export function LeadershipTest({
  inventory,
  teamId,
  priorResult,
}: {
  inventory: Category[];
  teamId: string | null;
  priorResult: Readout | null;
}) {
  const [results, setResults] = useState<Readout | null>(priorResult);
  const [taking, setTaking] = useState(!priorResult);
  const [err, setErr] = useState<string | null>(null);

  // Flatten the category → facet → question inventory into the shared runner's
  // flat item list (grouped by category). Scoring stays server-side and
  // reverse-aware — the runner only collects answers.
  const runnerInstrument = useMemo(
    () => ({
      name: "Leadership Effectiveness",
      scale: { min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
      dimensions: inventory.map((c) => ({ key: c.code, label: c.name })),
      items: inventory.flatMap((c) =>
        c.facets.flatMap((f) => f.questions.map((q) => ({ key: q.key, dimension: c.code, text: q.text }))),
      ),
    }),
    [inventory],
  );

  async function submit(answers: Record<string, number>) {
    setErr(null);
    const res = teamId ? await saveLeadershipResponse(teamId, answers) : await scoreLeadership(answers);
    if (res.error) { setErr(res.error); throw new Error(res.error); }
    setResults(res.result as Readout);
    setTaking(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (results && !taking) {
    return (
      <div>
        <ScoreReadout data={results} />
        <div style={{ marginTop: 16 }}>
          <button className="btn-sec" onClick={() => { setErr(null); setTaking(true); }}>Retake</button>
        </div>
        <p className="org-note" style={{ marginTop: 10 }}>
          Reverse-worded items are inverted before scoring.
          {teamId
            ? " Your answers are saved privately — only the anonymized team aggregate is shared with team leads."
            : " Results are shown to you and not saved."}
        </p>
      </div>
    );
  }

  return (
    <div className="lead-test">
      {err ? <div className="form-err">{err}</div> : null}
      <AssessmentRunner
        instrument={runnerInstrument}
        draftKey={teamId ? `otaa:leadership:${teamId}` : "otaa:leadership:self"}
        estimateMins={15}
        privacyNote={teamId ? "Saved privately — only the anonymised team aggregate is shared with leads." : "Shown to you and not saved."}
        submitLabel="See results ›"
        allowPartial
        onBack={results ? () => setTaking(false) : undefined}
        onSubmit={submit}
      />
    </div>
  );
}
