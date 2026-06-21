"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssessmentRunner, splitAnswers, type AnswerValue } from "@/components/AssessmentRunner";
import type { SurveyInstrument } from "@/lib/survey";

// The anonymous public responder. No account, no identity — answers post via
// the SECURITY DEFINER submit_public_survey_response RPC keyed off the link
// token. After submitting we show a thank-you, never an aggregate (the read is
// for the team, not the public).
export function PublicSurveyForm({ token, instrument }: { token: string; instrument: SurveyInstrument }) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"welcome" | "questions" | "done">("welcome");

  async function submit(all: Record<string, AnswerValue>) {
    setError(null);
    const supabase = createClient();
    const { scores, answers } = splitAnswers(all);
    const trimmed = comment.trim();
    const { error } = await supabase.rpc("submit_public_survey_response", {
      p_token: token,
      p_scores: scores,
      p_comments: trimmed ? { general: trimmed } : {},
      p_answers: answers,
    });
    if (error) { setError(error.message); throw error; }
  }

  return (
    <div className="narrow-card">
      <AssessmentRunner
        instrument={{ name: instrument.name, scale: instrument.scale, dimensions: instrument.dimensions, items: instrument.items }}
        privacyNote="Fully anonymous — your answers are never tied to you."
        submitLabel="Submit my read ›"
        onSubmit={submit}
        onStageChange={setStage}
        welcome={{
          title: instrument.name,
          blurb: "Your honest answers help improve the working environment. It takes a few minutes, and your responses are fully anonymous — no answer can be traced back to you.",
          facts: [`${instrument.items.length} questions`, "A few minutes", "Anonymous"],
          startLabel: "Start assessment",
          footnote: "Results are reported only as group aggregates of 5 or more.",
        }}
        done={{
          title: "Thank you",
          blurb: "Your responses have been recorded anonymously. You can close this tab — your individual answers are never shown to anyone.",
          nextSteps: [
            { title: "Results aggregated", sub: "Anonymised once 5+ have answered" },
            { title: "Team review", sub: "Findings are shared with the team" },
            { title: "Workshop if triggered", sub: "Scheduled where a section falls below threshold" },
          ],
        }}
      />
      {stage === "questions" ? (
        <div className="svcomment">
          <label className="dlabel" htmlFor="pub-cmt">Add a comment <span className="opt">(optional)</span></label>
          <textarea
            id="pub-cmt"
            className="inp"
            rows={2}
            placeholder="Anything you want the team to know in your own words…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <p className="src" style={{ marginTop: 4 }}>Shown without your name, and only once at least 3 people respond.</p>
        </div>
      ) : null}
      {error ? <p className="src" style={{ color: "var(--rust)" }}>{error}</p> : null}
    </div>
  );
}
