# Assessments module — implementation & gaps

## What ships now (this change)

A new **Assessments library** (`AssessmentLibrary.tsx`, rendered by `/assessments`)
matching the design: **library → detail → run → report**.

- **Library** — instrument cards grouped *Personality* (individual) and *Team*,
  driven by the real `assessment_template` catalog (+ the Leadership Effectiveness
  test as an external card). Each card shows dimensions, ~time, and a "Completed"
  badge when the signed-in user has taken it.
- **Detail** — About (description) + "What it measures" (dimension chips) +
  Details facts (type, dimensions, questions, time, basis, scale, your status),
  with **View sample report** and **Run assessment** actions.
- **Run** — a real Likert run over the instrument's items (from
  `assessment_template.definition`), progress + per-question card, persisted via
  `submit_individual_response(workspace, key, scores)` (verified end-to-end).
- **Report** — a per-dimension band table (fill + score), expandable rows with the
  dimension definition and a band read, a **Full / Personal** toggle (Personal hides
  raw scores → dots), and a footer (basis, scale). **View sample report** renders an
  illustrative profile so users can see the format before taking it.

The existing **team pulse / multi-item survey** tools (aggregate, perception gap,
trends) are preserved below the library under "Team dynamics".

## Gaps (development perspective)

Ordered by impact. Each is additive — nothing here blocks the flow above.

1. **Authored per-trait report content (biggest gap).** The design's report has rich
   prose per trait — *definition, advantages, watch-outs, "others with this result
   often say…"*. We have only a one-line dimension `blurb`, so the report currently
   shows the blurb + a generated band sentence. Needs an authored content table:
   `assessment_trait_copy(template_key, dimension, band, definition, advantages[],
   risks[], statements[])`, plus an editor.

2. **Team-aggregate report not yet wired into the library.** A team instrument's run
   stores the *individual's* response. The team-combined report (≥3 respondents,
   anonymity-masked) already exists via `survey_results` / `team_dynamics`, but it is
   not surfaced in the new report view — it lives in the "Team dynamics" tools below.
   Next step: a "Team report" mode in `AssessmentLibrary` that calls `survey_results`
   for the active survey and renders the same band table from the aggregate.

3. **Assignment / invitations.** No model for "assign this instrument to these people"
   — team members are implicitly eligible through an open survey. The detail's
   "Assign people" (in the design) needs an assignment record + reminder hooks.

4. **Reference norms / percentiles for individual instruments.** Bands are raw
   position on the scale, not population-relative. Team surveys have a benchmark pool
   (`benchmark_sample`); individual instruments (working style, strengths) have none,
   so "in the top X%" isn't possible yet.

5. **Item depth + reverse scoring for catalog instruments.** `working_style` /
   `strengths_snapshot` carry ~2 items per dimension and no reverse-scored flags in
   the JSONB definition (only the relational leadership schema has `reverse_scored`).
   A defensible personality profile needs more items and reverse keys.

6. **Candidate sharing & export are stubs.** "Share with candidate" and PDF/export are
   not implemented (export shows a toast). Needs a shareable individual-report surface
   (respecting `individual_response.shared`) and a print/PDF route.

7. **Longitudinal history for individuals.** `individual_response` keeps one row per
   (user, template) — retaking overwrites. No personal trend over time (team pulses do
   have `team_dynamics_history`).

8. **Unify the Leadership test.** The 63-item leadership inventory is a separate
   run/score/report flow (`/assessments/leadership`); it's linked as an external card
   rather than run/reported inside the library.

9. **Authoring UI.** Custom instruments can only be created by inserting
   `assessment_template` rows directly — no admin UI to define dimensions/items.
