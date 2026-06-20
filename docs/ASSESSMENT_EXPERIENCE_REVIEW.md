# Assessment experience — external review & close-out

An outside-lens review of the assessment-experience wave (`lib/itembank.ts`, the
`TemplateBuilder` library picker + preview, and the `SurveyRespond` ergonomics) by a senior
engineer (correctness · security · performance · accessibility) and a design studio (clarity ·
consistency · craft). Everything below was verified against a clean `typecheck · lint · test ·
build`. The proposal and competitor research are in `ASSESSMENT_EXPERIENCE_PROPOSAL.md`.

## Scope reviewed

| Area | File | Change |
|---|---|---|
| Question database | `lib/itembank.ts`, `test/itembank.test.ts` | ~60 curated, sourced items + `searchBank` / `BANK_TOPICS` + 10 tests |
| Builder | `app/(app)/library/TemplateBuilder.tsx` | "Add from library" multi-select picker; Edit\|Preview test-run; `InstrumentPreview` |
| Test engine | `app/(app)/assessments/SurveyRespond.tsx` | Progress bar; sticky scale; localStorage autosave/resume; clearer mask copy |
| Styling | `app/globals.css` | Tokens-only styles for the above (no new colors) |

## Senior-developer review

**Correctness.**
- `addPicked` composes into the existing `definition` shape: it finds a dimension by
  case-insensitive label or **creates one**, skips duplicate items by text, and absorbs the blank
  starter rows so a first insert from a clean form is clean. Dimension indices stay consistent
  with how `buildDefinition` remaps them, so saved output is identical in shape to hand-authored
  instruments. The existing server-side `valid_instrument_definition()` guard still applies.
- `InstrumentPreview` is pure/read-only — it derives from current state and writes nothing, so it
  can never desync the form or the saved record. Scale buttons are `disabled`.
- **Gap found & closed during review:** a stale `localStorage` draft could linger after a survey
  was completed on another device. The mount check now clears the draft when a prior submission is
  detected, in addition to clearing on submit. Hydrate → autosave → clear ordering was traced: no
  resurrection (autosave only writes when `scores` is non-empty; the async submit-check clears
  last).
- Autosave/resume is **client-only** (`localStorage`, keyed `ota:svdraft:<surveyId>`), all I/O
  wrapped in `try/catch` so private-mode / quota / disabled storage degrade silently. No new
  network calls, no schema change.

**Security / privacy.** No new RPCs, no new reads, no new server surface — nothing crosses a
trust boundary. The draft holds only the respondent's own in-progress answers on their own device
and is removed on submit. The min-3 anonymity mask is untouched; the copy change ("2 of 3 — 1
more to reveal") exposes only the response *count*, which the surface already showed.

**Performance.** `searchBank` is a linear scan over ~60 in-memory rows behind a `useMemo` — trivial.
No new effects fire on the hot path; autosave is a single `setItem` debounced naturally by React's
state batching. Bundle impact is a small static data module.

**Accessibility.** Progress bar carries `role="progressbar"` + `aria-valuemin/max/now`. Library
items are real `<label>`-wrapped checkboxes (keyboard + screen-reader friendly). Reverse-scored
items show a marker with a `title`. *Minor, noted:* the Edit\|Preview control uses
`role="tablist"`/`tab` without paired `tabpanel`/`aria-controls` — a reasonable approximation;
tightening it is cosmetic.

## Design-studio review

Built entirely from the existing token set (`--forest`, `--green`, `--canvas`, `--line`,
`--shadow`) and shared primitives (`.inp`, `.btn-*`, `.svgroup`, `.asq`, `.assess-lead`), so the
new surfaces read as one product:

- **Library picker** — a calm in-card panel: search, topic chips, selectable rows showing the
  item, its dimension, a `· reverse` hint and the source; a clear "N selected → Add N questions"
  footer. It teaches good instrument design by example.
- **Preview** — the same layout the respondent sees, including the sticky scale and reverse marker,
  so "take it yourself" is literal.
- **Respondent** — the scale + progress now ride a sticky header; the progress fill animates; the
  mask reads as a friendly countdown rather than a locked door.

## Definition snapshotting — _shipped & verified on the live project_

The #1 correctness gap from the first review is now **closed** (migration
`20260620120000_survey_definition_snapshot.sql`, applied to project `fqeohcfkimoopwjxxcft`):

- **Schema.** `public.survey` gains a nullable `definition jsonb`. Additive; RLS unchanged (the
  existing team-read select policy now also covers the column — questions aren't sensitive).
- **Write.** `public.create_survey` (the single creation chokepoint that `ensure_block_survey` /
  `ensure_workshop_survey` / `sendSurvey` all funnel through) snapshots the matching template's
  `definition` (workspace-custom preferred over global) onto the new row. All other behaviour
  (deadline body, notify non-responders) preserved.
- **Read.** `private.survey_composite` resolves from the survey's own snapshot first, falling back
  to the live template for legacy rows. The two client read sites that map item-means →
  dimensions for display (`insight/leadership-teams` → `SurveyRespond`, and the
  `assessments` landing "team reading") now build the instrument from the survey's snapshot via
  `instrumentFromRow`, falling back to the live catalog by kind.
- **Backfill.** Every existing survey was locked to its current template definition.

**Verification on the live DB (read-only + rolled-back):**
- Backfill coverage **21/21** surveys, 0 null.
- For every survey with ≥3 responses, the snapshot-based composite **equals** the live-template
  composite (no regression) and uses the snapshot branch.
- **Protection proof (rolled back):** inside a transaction, corrupting the `strategy_health`
  template to `scale.max = 999` left the survey's composite unchanged at **49.3** (it read the
  snapshot, not the edited template); the transaction was rolled back and the template confirmed
  intact (`scale.max = 7`).
- `get_advisors(security)`: 108 findings, all WARN/INFO, **0 ERROR**; the only `survey`-related
  ones are the project's intentional `authenticated_security_definer_function_executable` notices.
  No new findings.

_Residual (low risk, documented):_ run-mode `SurveyModule`'s **display** mapping still resolves by
kind from the live catalog — acceptable because a run-mode survey is opened in-session, so its
snapshot equals the live template at that moment; server scoring is snapshot-correct regardless.

## Open gaps (deferred — with the exact next step)

These are clean follow-ons. Each needs the house DB cadence (migration → `get_advisors` →
rolled-back RLS role test → typecheck/test/build → commit/merge).

1. **DB-backed, workspace-extensible question bank (A2).** Promote `lib/itembank.ts` into an
   `assessment_item` table (workspace-null = global) with `select`-for-all RLS and an admin-gated
   upsert; the picker reads global + workspace rows. The curated set seeds the globals.
2. **Server-side resume + CSV/JSON export + team longitudinal trend (C5).** Persist partial
   responses server-side (cross-device resume), add a results export beside print, and a
   re-measure trend for team aggregates (individual history already exists).

## Pre-existing items (not introduced here)

- `test/util.test.ts` → `roleLabel("member")` fails at baseline; `ROLE_LABEL` maps `member` to a
  non-"Member" label. Out of assessment scope — flagged, not changed.
- `TemplateBuilder` carries an unused `keys = useMemo(dimKeys(dims))` from before this work; lint
  tolerates it. Left untouched to keep the diff scoped (safe to remove in a cleanup pass).
- Respondent `allRated`/`answered` use a truthy check on scores, so a custom scale whose **min is
  0** would mis-count a `0` answer as unrated. Built-in instruments are 1–7; consistent with the
  pre-existing `allRated`. Worth normalizing to `!= null` if 0-based scales are ever offered.

## Verification

- `tsc --noEmit` — clean
- `next lint` — no warnings or errors
- `vitest run` — 52 passed (10 new), 1 pre-existing failure (`roleLabel`) unrelated to this work
- `next build` — success

## Verdict

No open correctness or security gaps in what shipped. The three intuitiveness gaps the brief
named are closed for the live path: authors now **start from proven questions** and can **take
their own instrument before publishing**; respondents get **progress, a sticky scale, and
resume**, and the top correctness gap — **definition snapshotting** — is now shipped and verified
on the live project. The remaining bets (DB-backed bank, server-side resume/export/trend) are
schema-bound and sequenced.
