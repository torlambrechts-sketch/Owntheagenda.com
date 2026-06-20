# Improving the assessment experience — research, proposal & build

**Brief.** Make OwnTheAgenda's assessment experience *intuitive to run* end-to-end — the
**builder** (authoring an instrument), the **question database** (where the items come from),
and the **test engine** (taking and reading the result). Worked as a trio: a senior
engineering team (Claude Code), a senior UI designer, and a supervisor. We audited the code,
benchmarked leading assessment/survey tools, proposed, and **implemented the first wave** with
verification at each step. The accompanying close-out is in `ASSESSMENT_EXPERIENCE_REVIEW.md`.

> **TL;DR.** The engine is genuinely strong already — a data-driven instrument model
> (`assessment_template.definition` → live survey, no code change), reverse-scoring, min-3
> anonymity masking, composite + climate-strength, benchmarks, and a working authoring UI with
> client-side validation. The intuitiveness gaps were narrower than they first looked, and three
> were high-leverage: **(1)** authors type every question from a blank page (no library to draw
> on), **(2)** there's no way to *take your own instrument* before publishing it, and **(3)** the
> respondent has no progress signal, no resume, and the scale scrolls out of view. This wave
> ships fixes for all three, entirely client-side and fully verified (typecheck · lint · test ·
> build all green).

---

## 1. Where the assessment experience stands (grounded in the code)

| Layer | Lives in | Already strong | The intuitiveness gap |
|---|---|---|---|
| **Builder** | `app/(app)/library/TemplateBuilder.tsx`, `actions.ts` | Dimensions + items, human-readable validation, a reverse-scoring toggle with tooltip, derived dimension keys, scale config | No **question library** to draw from (blank-page authoring); no **preview / test-run**; category is free text |
| **Question database** | *(did not exist)* — items were embedded per-template in `definition.items` | The data-driven `definition` shape is a clean target to compose into | Nothing reusable; every instrument re-types its questions from scratch |
| **Test engine** | `app/(app)/assessments/SurveyRespond.tsx`, `SurveyModule`, `AssessmentLibrary`, `lib/survey.ts` | Scoring (`dimensionMeans`, `compositeScore`, `climateStrength`), reverse-aware, min-3 mask, benchmark percentile | No **progress** indicator; no **save / resume**; **scale legend scrolls away**; the mask read was terse |

The scoring core (`lib/survey.ts`) and the RLS/anonymity posture are mature, so this proposal
**builds on the machinery** — composing into the existing `definition` shape and reusing the
existing respond layout — rather than re-platforming.

---

## 2. What the market does (and what we borrowed)

| Tool | Known for | Pattern borrowed |
|---|---|---|
| **Gallup Access** | The Q12 + a **library of ~400 validated pulse questions** | A curated, reusable **question database** you compose instruments from. |
| **Culture Amp** | Science-backed templates + benchmarks | Items carry a construct/source; benchmark context on the read. |
| **Qualtrics** | Enterprise survey rigor | **Auto-save partial responses** so a respondent can leave and resume. |
| **SurveyMonkey / Typeform** | Frictionless taking | **Progress bar**, "one question at a time," partial-save points. |
| **CliftonStrengths / 16Personalities** | Mass-market self-tests | Clear progress, calm one-thing-at-a-time pacing, a readable report. |

Two signals shaped the build: **(1)** a validated question library is the defining feature of a
serious assessment platform (and exactly the "question database" in the brief); **(2)** the
taking experience is won on **progress + resume + never losing the scale**, not on more options.

---

## 3. The proposal — three tracks (and what shipped now)

Effort key: **S** ≈ hours · **M** ≈ 1–2 days · **L** ≈ multi-day. ✅ = shipped this wave.

### Track A · Question database — give authors proven items to start from
- **A1 ✅ A curated, sourced, searchable item library** (`lib/itembank.ts`): ~60 items across 16
  team-health topics (psychological safety, trust, healthy conflict, role clarity,
  decision-making, accountability, alignment, communication, collaboration, learning, belonging,
  recognition, wellbeing, manager effectiveness, autonomy, change readiness). Each item carries a
  suggested dimension, a `reverse` flag where it blunts acquiescence bias, and an attribution to
  the construct it draws on (Edmondson, Lencioni, Bang & Midelfart, Gallup-style, SDT, ADKAR…).
  Wording is our own, so no third-party text travels. *(M.)*
- **A2 · DB-backed, workspace-extensible bank** — promote the curated library into a table so
  teams can save their own items and reuse across instruments. *(L — deferred; see review.)*

### Track B · Builder — make authoring confident
- **B1 ✅ "Add from library."** A searchable, topic-filtered picker in the builder; multi-select
  items and insert them in one action. Each item lands under its suggested dimension — **created
  automatically if it doesn't exist** — and duplicates (by text) are skipped. Blank starter rows
  are absorbed so the first insert from a clean form lands cleanly. *(M.)*
- **B2 ✅ Live preview / test-run.** An **Edit | Preview** toggle renders the instrument exactly
  as a respondent will see it (sticky scale, dimension groups, disabled scale buttons, a marker
  on reverse-scored items) — *take it yourself before you publish*. *(M.)*
- **B3 · Category as a typed picker** (vs. free text) to stop near-duplicate categories. *(S — deferred.)*

### Track C · Test engine — make taking it effortless
- **C1 ✅ Progress indicator.** A live "N of M answered" bar on the respond surface, with
  `role="progressbar"` and aria values. *(S.)*
- **C2 ✅ Sticky scale legend.** The "1 = strongly disagree … 7 = strongly agree" header and the
  progress bar stick to the top while answering, so the scale never scrolls out of reach. *(S.)*
- **C3 ✅ Autosave & resume.** The in-progress read is persisted client-side
  (`localStorage`, keyed per survey) and rehydrated after a refresh or navigation; cleared on
  submit. No schema change, no server round-trip. *(S.)*
- **C4 ✅ Clearer reveal-progress.** The min-3 mask now reads **"2 of 3 — 1 more to reveal"**
  instead of a terse "hidden until 3 respond." *(S.)*
- **C5 · Server-side resume + CSV export + team longitudinal trend** — the heavier reader/respondent
  bets that need schema or new aggregates. *(M–L — deferred; see review.)*

---

## 4. What we deliberately deferred (and why)

Each is a clean follow-on, not a loose end — scoped out to keep this wave **client-only and
fully verifiable in-repo** without mutating the shared Supabase project:

- **Definition snapshotting at survey open (correctness).** Editing an `assessment_template`
  while a survey is open desyncs items from already-submitted responses. The fix — snapshot
  `definition` onto the `survey` row at open time — needs a migration + the standard remote
  `apply_migration` + rolled-back RLS role test. **This is the top recommended next step.**
- **DB-backed question bank (A2)** and **server-side draft resume / CSV export / team trend (C5)** —
  all need schema and the DB-connected cadence (migration → advisors → RLS tests).

See `ASSESSMENT_EXPERIENCE_REVIEW.md` §"Open gaps" for the exact migration sketches.

---

## 5. Verification (house cadence, in-repo)

Every step was gated before moving on. Final state:

- `tsc --noEmit` — **clean**
- `next lint` — **no warnings or errors**
- `vitest run` — **52 passed**, 10 of them new (`test/itembank.test.ts`); 1 **pre-existing**
  failure (`roleLabel` in `util.test.ts`) untouched by this work
- `next build` — **success**

What couldn't run here (no DB connection): remote migration apply + rolled-back RLS role tests.
Not needed for this wave (no schema change); required for the deferred items.

---

## Sources

- Gallup Access — library of ~400 validated questions: https://www.gallup.com/access/709166/gallup-access-culture-amp.aspx
- Qualtrics — partial/incomplete responses (auto-save & resume): https://www.qualtrics.com/support/survey-platform/survey-module/survey-options/partial-completion/
- SurveyMonkey — progress bar: https://help.surveymonkey.com/en/surveymonkey/create/progress-bar/
- Typeform / Qualtrics / SurveyMonkey resume comparison: https://www.opinionx.co/blog/incomplete-surveys-partial-submissions-survey-tools
