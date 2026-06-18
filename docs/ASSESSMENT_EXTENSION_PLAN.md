# Assessment module extension — build plan

Driven by the Strategium audit + market map (June 2026 research). The module
already implements the research's "moat" fundamentals: multi-rater, anchored
Likert, radar output, alignment-as-climate-strength, longitudinal re-measure,
transparent scoring. This plan closes the named gaps.

## Phases
1. **Composite 0–100 score** — transparent headline index per instrument.
   `private.survey_composite` (single source of truth, reads the instrument
   definition; equal dimension weight unless `definition.weights`), surfaced in
   `survey_results.composite` + client display. ✅
2. **Instruments (data)** — Strategy Health (team, Quality vs Readiness, quadrant
   + weights), Strategy Kernel (solo, Rumelt kernel), Manager Skills (solo).
3. **2×2 quadrant output** — `definition.quadrant {x,y,labels}`; render Quality ×
   Readiness as a quadrant for Strategy Health.
4. **Perception gap** — `survey.subject_user_id` + `survey_response.rater_role`;
   `survey_perception_gap` (subject self vs raters' aggregate, raters min-3
   masked). Manager 360 mode.
5. **Benchmark percentile** — global anonymized pool of composites per kind;
   `survey_benchmark` percentile with a minimum pool gate.
6. **Review + docs + merge.**

Each phase: apply migration → rolled-back role/logic test → repo migration +
types → UI → gate (typecheck/lint/test/build) → commit.
