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

1. **✅ DONE — Authored per-trait report content.** Added `assessment_trait_copy`
   (`template_key, dimension_key, definition, advantages[], risks[], statements[]`,
   global reference content, RLS `select using (true)`), seeded for the catalog
   instruments, and wired into the report: each expandable dimension row now shows
   the authored *definition*, *Where it helps*, *Watch-outs* (Full view only), and
   *People with this result often recognise…* statements, falling back to the
   dimension blurb when a row is absent.

2. **✅ DONE — Team-aggregate report wired into the library.** A team instrument's run
   now contributes to the team's open survey (`submit_survey_response`) when one is
   open, else stores a personal response. `/assessments` enriches each team catalog
   item with `openSurveyId` (latest open survey of that kind) and `teamReport`
   (the anonymised aggregate from `survey_results` on the latest survey — min-3
   masked). The detail view shows a **View team report →** action (hidden while
   masked) that renders the same band table from the aggregated dimension means,
   and a contextual note (responses so far / report unlocks at 3 / open to
   contribute). Verified `survey_results` shape end-to-end against live data.

3. **Assignment / invitations.** No model for "assign this instrument to these people"
   — team members are implicitly eligible through an open survey. The detail's
   "Assign people" (in the design) needs an assignment record + reminder hooks.

4. **✅ DONE — Reference norms / percentiles for individual instruments.** Added the
   `individual_norms(template_key)` RPC (security definer): for the caller it computes a
   per-dimension percentile against the **global pool** of everyone who's taken the same
   instrument — reverse-scoring aware, entirely server-side so only the caller's own
   standing is returned (never anyone else's scores). A min-N guard (≥5 others) keeps
   tiny pools from producing noisy/identifying percentiles. The report's expanded
   dimension detail now reads "Compared with N others … you're around the Pth
   percentile" on your own report. Verified the math (top scorer → 100th, middle →
   60th, sub-threshold → null). Pools are empty until people take assessments, so it
   degrades to no-percentile gracefully.

5. **✅ DONE — Item depth + reverse scoring for catalog instruments.**
   `working_style` and `strengths_snapshot` now carry **4 items per dimension** (16
   total, up from 8), each dimension gaining one **reverse-keyed** item
   (`"reverse": true` in the JSONB definition) to blunt acquiescence bias. Scoring
   flips reverse items onto the dimension pole before averaging — in both the
   client run (`AssessmentLibrary.scoreFrom`) and the shared item→dimension reducer
   (`lib/survey.dimensionMeans`, which also feeds the team aggregate). Verified the
   arithmetic (genuinely-high → max, yes-to-all acquiescence → mid, genuinely-low →
   min). These instruments score entirely client-side, so the server composite /
   benchmark path is untouched; reverse keys remain off team instruments until
   `private.survey_composite` is made reverse-aware. `working_style.focus` was
   re-grounded on concentration/depth (matching its authored copy and "Focus"
   label) with fresh item keys so prior responses drop cleanly.

6. **✅ DONE — Sharing & export are real.** The report's **Export** now builds a
   self-contained printable document (definitions, your-read, advantages, and —
   Full view only — watch-outs) and opens the browser print dialog → Save as PDF.
   A **Share with team** toggle on your own individual report calls
   `set_individual_shared`, flipping `individual_response.shared`; the existing
   teammate-scoped RLS (`shared and private.shares_team`) then lets people who share a
   live team read it. Verified the toggle + visibility both ways (off → teammate sees
   0, on → sees 1). *Remaining extension:* a dedicated "Shared with me" gallery to
   browse teammates' shared reports inside the library (the rows are already readable
   via RLS; only the browse surface is absent).

7. **✅ DONE — Longitudinal history for individuals.** Added an append-only
   `individual_response_history` log (own-only RLS), written on every take inside the
   security-definer `submit_individual_response`. `/assessments` loads each
   instrument's take-history and the report shows a **Movement** strip — per-dimension
   change in points since the first take ("▲/▼ N pts", green up / rust down) — whenever
   you've taken it more than once. Verified the append + ordering end-to-end. (The
   single "latest" row still drives the current report; the log is additive.)

8. **Unify the Leadership test.** The 63-item leadership inventory is a separate
   run/score/report flow (`/assessments/leadership`); it's linked as an external card
   rather than run/reported inside the library.

9. **✅ DONE — Authoring UI.** A full builder already ships at `/library`
   (`TemplateBuilder.tsx`): admins set basics, scope, scale, dimensions and questions
   and save via `save_assessment_template` (admin-gated RPC); custom instruments then
   work everywhere a built-in does. Extended here with a per-question **⇄ reverse**
   toggle so authored instruments can use the reverse scoring added in Gap 5 (the flag
   rides through the definition JSONB → `instrumentFromRow` → `dimensionMeans`).
