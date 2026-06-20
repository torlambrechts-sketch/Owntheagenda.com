"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QuadrantPlot } from "@/components/QuadrantPlot";
import { AssessmentRunner } from "@/components/AssessmentRunner";
import { ResultsExport } from "@/components/ResultsExport";
import { ordinal } from "@/lib/util";
import {
  dimensionMeans,
  climateStrength,
  strengthItemKeys,
  type ItemStat,
  type SurveyInstrument,
} from "@/lib/survey";

// Standalone respond surface for open surveys (prerequisite mode — answer ahead
// of the workshop). Shows the form, then the aggregate behind the min-3 mask.
// Instrument definitions are resolved from the template library server-side and
// passed in as a kind → instrument map.

type OpenSurvey = { id: string; name: string; kind: string };
type Benchmark = { pool_n: number; ready: boolean; percentile: number | null };
type Results = { respondents: number; masked: boolean; items: ItemStat[]; strength_sd: number | null; composite: number | null; benchmark: Benchmark | null };

export function SurveyRespond({
  surveys,
  userId,
  instruments,
}: {
  surveys: OpenSurvey[];
  userId: string;
  instruments: Record<string, SurveyInstrument>;
}) {
  if (!surveys.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="cat-head" style={{ marginTop: 0 }}>Surveys to complete <span className="n">{surveys.length}</span></div>
      {surveys.map((s) => (
        <SurveyCard key={s.id} survey={s} userId={userId} inst={instruments[s.kind] ?? null} />
      ))}
    </div>
  );
}

function SurveyCard({ survey, userId, inst }: { survey: OpenSurvey; userId: string; inst: SurveyInstrument | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<Results | null>(null);

  const loadResults = useCallback(async () => {
    if (!inst) return;
    const { data } = await supabase.rpc("survey_results", { p_survey: survey.id, p_strength_items: strengthItemKeys(inst) });
    if (data) setResults(data as unknown as Results);
  }, [supabase, inst, survey.id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("survey_response")
        .select("respondent_id")
        .eq("survey_id", survey.id)
        .eq("respondent_id", userId)
        .maybeSingle();
      if (data) setSubmitted(true);
      loadResults();
    })();
  }, [supabase, survey.id, userId, loadResults]);

  async function submit(scores: Record<string, number>) {
    if (!inst) return;
    const { error } = await supabase.rpc("submit_survey_response", { p_survey: survey.id, p_scores: scores });
    if (error) throw error;
    setSubmitted(true);
    loadResults();
  }

  if (!inst) return null;
  const dims = results && !results.masked ? dimensionMeans(inst, results.items) : null;
  const strength = results && !results.masked ? climateStrength(results.strength_sd) : null;
  const strengthLabel = inst.dimensions.find((d) => d.key === inst.strengthDimension)?.label.toLowerCase() ?? "agreement";
  const max = inst.scale.max;
  const respondents = results?.respondents ?? 0;

  return (
    <div className="svcard">
      <div className="svcard-h"><b>{survey.name}</b><span className="src">{inst.name}</span></div>
      {!submitted ? (
        <AssessmentRunner
          instrument={{ name: inst.name, scale: inst.scale, dimensions: inst.dimensions, items: inst.items }}
          draftKey={`otaa:survey:${survey.id}`}
          privacyNote="Anonymous in aggregate — individual answers are never shown."
          submitLabel="Submit my read ›"
          onSubmit={submit}
        />
      ) : (
        <>
          <div className="assess-done">✓ Your read is in. Results reveal once at least 3 people respond.</div>
          <div className="assess-agg" style={{ boxShadow: "none", border: "none", padding: "10px 0 0" }}>
            <div className="aa-h">
              Team reading
              {respondents < 3 ? <span className="aa-mask">· hidden until 3 respond ({respondents}/3)</span> : null}
              {strength ? <span className={`svchip ${strength.tone}`}>{strength.label} on {strengthLabel}</span> : null}
            </div>
            {results && !results.masked && results.composite != null ? (
              <div className="svcomposite">
                <span className="svc-num">{results.composite}</span>
                <span className="svc-den">/ 100</span>
                <span className="svc-lab">overall index</span>
                {results.benchmark?.ready && results.benchmark.percentile != null ? (
                  <span className="svc-bench" title={`vs ${results.benchmark.pool_n} teams who've run this`}>{ordinal(results.benchmark.percentile)} pct</span>
                ) : null}
              </div>
            ) : null}
            {dims ? <QuadrantPlot inst={inst} dims={dims} /> : null}
            {dims ? dims.map((d) => {
              const pct = d.mean == null ? 0 : Math.round((d.mean / max) * 100);
              return (
                <div className="svdim" key={d.key}>
                  <div className="svdim-top"><span className="svdim-label">{d.label}</span><span className="svdim-val">{d.mean == null ? "· · ·" : `${d.mean.toFixed(1)} / ${max}`}</span></div>
                  <div className="svtrack"><div className="svfill" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            }) : null}
            {dims ? (
              <ResultsExport
                surveyName={survey.name}
                instrumentName={inst.name}
                scaleMax={max}
                respondents={respondents}
                composite={results?.composite ?? null}
                dims={dims.map((d) => ({ key: d.key, label: d.label, mean: d.mean }))}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
