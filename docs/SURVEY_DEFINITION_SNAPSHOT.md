# Survey definition snapshot — correctness fix (on top of Phases A–C)

This lands alongside the Phases A–C assessment overhaul (see
`ASSESSMENT_EXPERIENCE_RESEARCH.md` / `ASSESSMENT_EXPERIENCE_REVIEW.md`). Those phases
rebuilt the *experience* — one shared `AssessmentRunner`, a DB-backed question bank,
template versioning. This adds the one correctness guarantee they didn't cover: a survey
is **locked to the instrument definition it opened with**, so a later template edit can
never reinterpret responses already collected under its item keys.

## The fix

- **Schema** (`20260620120000_survey_definition_snapshot.sql`): `public.survey` gains a
  nullable `definition jsonb`. Additive; RLS unchanged (the existing team-read policy
  covers it — questions aren't sensitive).
- **Write**: `public.create_survey` — the single creation chokepoint that
  `ensure_block_survey` / `ensure_workshop_survey` / the Flow engine all call — snapshots
  the matching template's `definition` (workspace-custom preferred over global) onto the
  new row. Other behaviour (deadline copy, notify non-responders) unchanged.
- **Read**: `private.survey_composite` resolves from the survey's own snapshot first,
  falling back to the live template for legacy rows. The two client read sites that map
  item-means → dimensions for display (`insight/leadership-teams` → `SurveyRespond`, and
  the `assessments` landing "team reading") build the instrument from each survey's
  snapshot via `instrumentFromRow`, falling back to the live catalog by kind.
- **Backfill**: every existing survey was locked to its current template definition.

## Ordering with the Flow migrations

Main's later Flow migrations (`…150000`, `…170000`) only *call* `create_survey` (same
4-arg signature); they don't redefine it. So this migration remains the **last**
definition of both `create_survey` and `survey_composite` on a fresh `db reset`, matching
the live database (where it was applied on top of the Flow work).

## Question bank enrichment ("continue")

Phase B's bank sourced items from instruments a workspace can already read. We additionally
feed the curated **`lib/itembank.ts`** library (~60 sourced, topic-grouped items, our own
wording) into `app/(app)/library/new/page.tsx`'s `bankItems`, deduped by text — so the bank
is useful even before a workspace has authored any instruments.

## Verification (applied to project `fqeohcfkimoopwjxxcft`)

- Backfill coverage **21/21** surveys, 0 null.
- For every survey with ≥3 responses, the snapshot-based composite **equals** the
  live-template composite (no regression) and uses the snapshot branch.
- **Protection proof (rolled back)**: corrupting the `strategy_health` template to
  `scale.max = 999` inside a transaction left the survey composite unchanged at **49.3**;
  rolled back, template confirmed intact (`scale.max = 7`).
- `get_advisors(security)`: 108 findings, all WARN/INFO, **0 ERROR**; no new findings.
- `typecheck` · `lint` · `build` green; unit suite unchanged (the pre-existing `roleLabel`
  failure is unrelated).

_Residual (low risk, documented):_ run-mode `SurveyModule`'s display mapping still resolves
by kind from the live catalog — fine, because a run-mode survey is opened in-session (its
snapshot equals the live template at that moment); server scoring is snapshot-correct
regardless.
