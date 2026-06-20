"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ordinal } from "@/lib/util";
import { QuadrantPlot } from "@/components/QuadrantPlot";
import { AssessmentRunner } from "@/components/AssessmentRunner";
import { ResultsExport } from "@/components/ResultsExport";
import {
  dimensionMeans,
  climateStrength,
  strengthItemKeys,
  instrumentFromRow,
  type ItemStat,
  type SurveyInstrument,
} from "@/lib/survey";

// Dual-mode multi-item survey (Bang psychological safety). Same module whether
// run live in the room or completed as a scheduled prerequisite; aggregates show
// per-dimension means + the climate-strength read, behind the min-3 mask.

type Benchmark = { pool_n: number; ready: boolean; percentile: number | null };
type Results = { respondents: number; masked: boolean; items: ItemStat[]; strength_sd: number | null; composite: number | null; benchmark: Benchmark | null };

export function SurveyModule({
  blockId,
  isFacilitator,
  initialSurveyId,
  instrument,
  timing,
  userId,
  title,
  prompt,
  stepLabel,
  showReady,
  ready,
  onToggleReady,
}: {
  blockId: string;
  isFacilitator: boolean;
  initialSurveyId: string | null;
  instrument: SurveyInstrument | null;
  timing: string;
  userId: string;
  title: string;
  prompt: string | null;
  stepLabel: string;
  showReady: boolean;
  ready: boolean;
  onToggleReady: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [surveyId, setSurveyId] = useState<string | null>(initialSurveyId);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapInst, setSnapInst] = useState<SurveyInstrument | null>(null);
  const [initialAnswers, setInitialAnswers] = useState<Record<string, number>>({});
  const [draftReady, setDraftReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prefer the survey's own snapshot definition (locked at open) over the live
  // catalog instrument, so a later template edit can't reinterpret responses.
  const inst = snapInst ?? instrument;

  const loadResults = useCallback(
    async (sid: string) => {
      if (!inst) return;
      const { data } = await supabase.rpc("survey_results", { p_survey: sid, p_strength_items: strengthItemKeys(inst) });
      if (data) setResults(data as unknown as Results);
    },
    [supabase, inst],
  );
  const loadMine = useCallback(
    async (sid: string) => {
      const { data } = await supabase.from("survey_response").select("respondent_id").eq("survey_id", sid).eq("respondent_id", userId).maybeSingle();
      if (data) setSubmitted(true);
    },
    [supabase, userId],
  );

  // Self-heal from the block's current binding on (re)mount: initialSurveyId is
  // an SSR snapshot, so navigating away from this survey step and back (which
  // remounts the module) would otherwise re-seed a stale null and strand
  // participants on "Waiting…" for an already-opened survey.
  useEffect(() => {
    let active = true;
    supabase.from("block").select("survey_id").eq("id", blockId).maybeSingle().then(({ data }) => {
      if (active && data?.survey_id) setSurveyId(data.survey_id as string);
    });
    return () => { active = false; };
  }, [blockId, supabase]);

  useEffect(() => {
    if (surveyId) { loadResults(surveyId); loadMine(surveyId); }
  }, [surveyId, loadResults, loadMine]);

  // Resolve the instrument from the bound survey's snapshot definition (falls
  // back to the catalog instrument for legacy rows / non-team readers).
  useEffect(() => {
    if (!surveyId) return;
    let active = true;
    supabase.from("survey").select("kind, name, definition").eq("id", surveyId).maybeSingle().then(({ data }) => {
      if (!active || !data) return;
      const i = instrumentFromRow({ key: data.kind as string, name: data.name as string, definition: (data as { definition?: unknown }).definition });
      if (i) setSnapInst(i);
    });
    return () => { active = false; };
  }, [surveyId, supabase]);

  // Load + debounce-save a server-side draft for cross-device resume.
  useEffect(() => {
    if (!surveyId) { setDraftReady(true); return; }
    let active = true;
    supabase.rpc("get_survey_draft", { p_survey: surveyId }).then(({ data }) => {
      if (!active) return;
      if (data && typeof data === "object") setInitialAnswers(data as Record<string, number>);
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [surveyId, supabase]);
  const saveDraft = useCallback((scores: Record<string, number>) => {
    if (!surveyId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void supabase.rpc("save_survey_draft", { p_survey: surveyId, p_scores: scores }); }, 600);
  }, [supabase, surveyId]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  useEffect(() => {
    const ch = supabase
      .channel(`survey:${blockId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "block", filter: `id=eq.${blockId}` }, (p) => {
        const sid = (p.new as any)?.survey_id;
        if (sid && sid !== surveyId) setSurveyId(sid);
      })
      .subscribe();
    const poll = setInterval(() => { if (surveyId) loadResults(surveyId); }, 6000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, surveyId]);

  async function openSurvey() {
    setBusy(true);
    const { data, error } = await supabase.rpc("ensure_block_survey", { p_block: blockId });
    setBusy(false);
    if (!error && data) setSurveyId(data as string);
  }
  async function submit(scores: Record<string, number>) {
    if (!surveyId) return;
    const { error } = await supabase.rpc("submit_survey_response", { p_survey: surveyId, p_scores: scores });
    if (error) throw error;
    setSubmitted(true);
    loadResults(surveyId);
  }

  if (!inst) return <div className="assess-empty">Unknown instrument.</div>;

  const dims = results && !results.masked ? dimensionMeans(inst, results.items) : null;
  const strength = results && !results.masked ? climateStrength(results.strength_sd) : null;
  const strengthLabel = inst.dimensions.find((d) => d.key === inst.strengthDimension)?.label.toLowerCase() ?? "agreement";
  const max = inst.scale.max;
  const respondents = results?.respondents ?? 0;

  return (
    <div className="assesswrap">
      <div className="canvashead">
        <div>
          <div className="pact">{stepLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="cright">
          {surveyId ? <span className="pill sm" style={{ background: "var(--canvas-2)", color: "var(--muted)" }}>{respondents} responded</span> : null}
          {showReady ? (
            <button className={`ready${ready ? " on" : ""}`} onClick={onToggleReady}>{ready ? "✓ You're ready" : "I'm ready"}</button>
          ) : null}
        </div>
      </div>
      {prompt ? <div className="canvasprompt">{prompt}</div> : null}

      <div className="assessbody">
        {!surveyId ? (
          <div className="assess-empty">
            {isFacilitator ? (
              <>
                <p>{timing === "prerequisite" ? "No pre-session survey is linked yet." : `A short, anonymous read — ${inst.items.length} items, ~2 minutes.`}</p>
                <button className="btn-prim" disabled={busy} onClick={openSurvey}>{busy ? "Opening…" : "Open the survey"}</button>
              </>
            ) : (
              <p>Waiting for the facilitator to open the survey…</p>
            )}
          </div>
        ) : (
          <>
            {!submitted ? (
              <div className="assess-form">
                {draftReady ? (
                  <AssessmentRunner
                    instrument={{ name: inst.name, scale: inst.scale, dimensions: inst.dimensions, items: inst.items }}
                    initialAnswers={initialAnswers}
                    draftKey={`otaa:block:${blockId}:${surveyId}`}
                    onChange={saveDraft}
                    privacyNote="Anonymous in aggregate — individual answers are never shown."
                    estimateMins={2}
                    submitLabel="Submit my read ›"
                    onSubmit={submit}
                  />
                ) : null}
              </div>
            ) : (
              <div className="assess-done">✓ Your read is in. Results reveal once at least 3 people respond.</div>
            )}

            <div className="assess-agg">
              <div className="aa-h">
                Team reading
                {respondents < 3 ? <span className="aa-mask">· hidden until 3 respond ({respondents}/3)</span> : null}
                {strength ? <span className={`svchip ${strength.tone}`} title={`How much the team agrees on ${strengthLabel}`}>{strength.label} on {strengthLabel}</span> : null}
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
                    <div className="svdim-top">
                      <span className="svdim-label">{d.label}</span>
                      <span className="svdim-val">{d.mean == null ? "· · ·" : `${d.mean.toFixed(1)} / ${max}`}</span>
                    </div>
                    <div className="svtrack"><div className="svfill" style={{ width: `${pct}%` }} /></div>
                    <div className="svdim-blurb">{d.blurb}</div>
                  </div>
                );
              }) : (
                <div className="svdim-blurb">Results appear once at least 3 people respond.</div>
              )}
              {dims ? (
                <ResultsExport
                  surveyName={title}
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
    </div>
  );
}
