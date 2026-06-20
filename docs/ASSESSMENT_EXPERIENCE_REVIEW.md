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

## Open gaps (deferred — with the exact next step)

These are clean follow-ons, deferred to keep this wave client-only and verifiable without mutating
the shared Supabase project. Each needs the house DB cadence (migration → `get_advisors` →
rolled-back RLS role test → typecheck/test/build → commit/merge).

1. **Definition snapshotting at survey open — _correctness, do this first._** Editing an
   `assessment_template` while a survey is open desyncs items from already-submitted responses.
   *Sketch:* add `definition jsonb` to `survey`; in the open/create RPC, copy the template's
   current `definition` onto the survey row; resolve the runtime instrument from the **survey's**
   snapshot (fallback to the template) so an open survey is immutable.
2. **DB-backed, workspace-extensible question bank (A2).** Promote `lib/itembank.ts` into an
   `assessment_item` table (workspace-null = global) with `select`-for-all RLS and an admin-gated
   upsert; the picker reads global + workspace rows. The curated set seeds the globals.
3. **Server-side resume + CSV/JSON export + team longitudinal trend (C5).** Persist partial
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
resume**. The remaining bets are schema-bound and sequenced — with definition snapshotting as the
clear next step because it's a correctness fix, not a feature.
