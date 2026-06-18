# Assessment module extension — shipped

Driven by the Strategium audit + market map (June 2026 research). The module
already had the research's "moat" fundamentals — multi-rater, anchored Likert,
radar output, alignment-as-climate-strength, longitudinal re-measure, transparent
scoring. This extension closed the named gaps. All phases shipped and verified
(rolled-back DB tests + typecheck/lint/tests/build; security advisors 0 errors).

## What shipped

### 1. Composite 0–100 score
`private.survey_composite(survey)` is the single source of truth: reads the
instrument definition (item→dimension map, scale, optional per-dimension
`weights`), computes the weighted mean of dimension means, normalizes to 0–100.
Null when masked (<3) or instrument unknown. Surfaced via `survey_results.composite`
and shown as "NN / 100 overall index". `lib/survey.compositeScore()` mirrors it
exactly for the individual immediate result (which never hits `survey_results`).

### 2. New instruments (pure data — `assessment_template` rows)
- **Strategy Health** (team) — Strategy Quality (Rumelt) vs Execution Readiness
  (Speculand/BSC); carries the 2×2 quadrant config.
- **Strategy Kernel Check** (solo) — Rumelt's kernel: diagnosis / guiding policy
  / coherent action.
- **Manager Skills Self-Check** (solo) — direction, coaching, communication,
  accountability.

### 3. 2×2 quadrant output
`definition.quadrant {x, y, xLabel, yLabel, q:{ll,hl,lh,hh}}`. `QuadrantPlot`
plots the two named dimension means and names the landed quadrant. Only
instruments that define one render it (Strategy Health).

### 4. Perception gap (self vs team)
`survey.subject_user_id` + `set_survey_subject` (lead/admin; subject must be on
the team) + `survey_perception_gap`. Contrasts a designated subject's view vs the
rest of the team, per dimension + composite. **Anonymity:** the subject is named
(their own self-score is theirs to see); the rest stay aggregated behind the min-3
mask, so individual raters are never identified. Visible to a team manager OR the
subject themselves.

### 5. Benchmark percentile
`benchmark_sample` — one composite per closed survey, by instrument kind, with **no
team/workspace/identity** stored. RLS on with **no policies** (API-unreadable;
only definer functions touch it — this is intentional, flagged as INFO by the
linter). A trigger records a sample on the open→closed transition (any close path)
when the composite is computable (≥3). `private.benchmark_rank` returns a percentile
gated by a **minimum pool of 8**, so a thin pool never shows a misleading number.
No fabricated baseline — it builds honestly as teams complete each instrument.

## Invariants to preserve
- Nothing un-masks below 3 respondents (composite, benchmark, gap-others all null <3).
- For a survey with a designated subject, the protected unit is the **non-subject
  group**: `survey_results` masks until ≥3 others, matching the gap's others-mask,
  so the aggregate + the named subject's score can't back out the others' mean.
- The subject may read their own gap only while still a **current team member**.
- The benchmark pool stores only `(kind, composite)` — never anything identifying.
- The composite formula lives once on the server; the client helper must match it.

## Known minor caveats
- **Benchmark self-inclusion:** a closed survey's own composite is in the pool when
  its `survey_results` ranks it, biasing that percentile up by one sample (≤~12 pts
  at the pool-8 floor, shrinking as the pool grows). Not identity-revealing;
  excluding self would require storing a survey id in the pool, which we won't do
  (it must stay anonymous). Accepted; self-corrects with pool size.

## Not built (bigger bets, deferred)
- A full 360 with subject-relative item wording (the gap reuses team-worded items).
- Per-workspace benchmark cohorts / industry filters.
