# Assessment Experience — Implementation Review (Phases A–C)

**Reviewers:** External senior engineer + design agency (independent pass)
**Date:** 2026-06-20
**Scope:** Implementation of the Phase A/B/C recommendations from
`docs/ASSESSMENT_EXPERIENCE_RESEARCH.md` (the AI authoring engine, Phase 3A, was
intentionally **not** built — kept manual per instruction).
**Verification standard:** `typecheck` + `lint` + production `build` green and the
unit suite unchanged on every commit. The pre-existing `roleLabel` test failure
(42/43) is unrelated to this work and predates it.

---

## 1. What shipped

### Phase A — One shared run engine
- **`components/AssessmentRunner.tsx`** (new): a single paged, one-question-at-a-time
  respondent experience with a bottom visual-only progress bar, per-item keyboard
  shortcuts, an up-front time estimate + precise privacy line, **local autosave/
  resume**, and an **accessible "show all on one page" fallback**.
- Adopted by **every** surface, replacing three divergent answer UIs and the 63-item
  single-scroll wall:
  - `app/(app)/assessments/AssessmentLibrary.tsx` (library run)
  - `app/(app)/assessments/SurveyRespond.tsx` (standalone team survey)
  - `app/run/[id]/SurveyModule.tsx` (live + pre-work workshop survey)
  - `app/(app)/library/LibraryClient.tsx` (`TakeForm`, individual self-assessment)
  - `app/(app)/assessments/leadership/LeadershipTest.tsx` (63-item inventory)
- Scoring stays in `lib/survey.ts` — the runner only collects answers and calls
  `onSubmit`, so masking/composite/reverse-scoring logic is untouched.

### Phase B — Guided builder + question bank
- **Live respondent Preview** pane in `TemplateBuilder.tsx` (Desktop/Mobile toggle),
  reusing the runner — authors see exactly what respondents get before saving.
- **Start from a copy:** `/library/new?from=<id>` clones any readable instrument
  (built-in or custom) into a fresh draft; a **Duplicate** action on every library
  card (admins).
- **Question bank:** an "Add from library" drawer searches every item across all
  readable instruments and inserts validated wording.
- **Controlled taxonomy:** Category is a picker with an inline "New category…"
  escape hatch (was free text).
- **Inline validation** on name/scale (was save-time only).

### Phase C — Manual in-app delivery + integrity
- **Dashboard "Assigned to you":** assignments you haven't completed, sorted by due
  date with overdue / due-soon nudges and a Take action (Lattice's in-app homepage-
  task pattern; completion derived from `individual_response`, never stored).
- **Versioning migration** `supabase/migrations/20260620000000_assessment_template_version.sql`:
  append-only snapshot of a custom instrument's definition on every save, so editing a
  live instrument can't silently change the meaning of historical responses.

---

## 2. Review findings (and fixes)

A high-effort two-finder review of the diff surfaced three issues; all fixed in the
final commit.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **Correctness** | On a **retake**, server `initialAnswers` overrode the locally-saved draft on resume, so editing a retake and reloading before submit reverted to the old scores. | The draft (newer, user's own in-progress work, cleared on submit) now **wins** the merge; resume indicator shows whenever a draft is restored. |
| 2 | UX | Leadership inventory: the stale submit error wasn't cleared on **Retake**; the retake also lost its "back to results" affordance. | Retake clears the error; `onBack` wired to return to results. |
| 3 | Cleanup | Question-bank list used the array index as its React key in a filtered list. | Keyed by `instrument:text` for stable reconciliation. |

Items the review explicitly **cleared** (not bugs): falsy-zero handling (uses `!= null`,
so a scale value of 0 is a valid answer); empty-dimension preview (guarded by
`canPreview`); error swallowing in `doSubmit` (every caller surfaces its own error before
throwing, and the draft is correctly preserved on failure); dashboard completion
derivation; `onSubmit` `void`/`Promise<void>` typing (runner accepts both).

---

## 3. Design-agency audit

**Consistency — strong.** The runner reuses the established design tokens and the
existing `.a-*` run classes; the builder preview reuses the report's `.a-seg`
segmented control. New `.arun-*` / `.bld-*` classes follow the same token system
(forest/green/canvas, the display/body type pairing). No new color or type primitives
were introduced.

**Respondent experience — materially improved.** One mental model everywhere
(paged, labelled options, bottom progress, keyboard, "answers saved automatically"),
matching the verified best practice (Typeform one-at-a-time; SurveyMonkey's bottom
visual-only bar; Qualtrics-style autosave). The 63-item wall is gone.

**Builder experience — materially improved.** Split edit/preview, clone-to-start, and
the bank turn a blank form into a guided tool.

**Accessibility — improved, with a known ceiling.** The single-page fallback uses
`role="radiogroup"` + `aria-checked` and is the screen-reader-friendly path (matching
the research's flagged trade-off that one-at-a-time formats aren't fully AT-friendly).
The **paged** options expose `role="radio"`/`aria-checked` and Space-to-select, but do
not implement full arrow-key roving focus within the group — the fast path there is the
number-key shortcut. This is acceptable but is the next a11y refinement (see §4).

---

## 4. Remaining gaps (closed-off with recommendations)

These are deliberately scoped out of A–C or require steps outside this environment.
None blocks what shipped.

1. **Versioning migration needs `supabase db push` + the project's rolled-back
   role-test.** The SQL is additive (the save body is unchanged but for the snapshot
   write) and mirrors the existing function exactly, but it was **not** applied to or
   verified against the live database here. Apply it and run the standard role test +
   `get_advisors` before relying on it. *Owner: backend.* **Low risk.**
   - Minor known caveat (matches the project's existing "known caveats" style): two
     admins saving the *same* custom instrument simultaneously can collide on the
     `(template_id, version)` unique key; one save errors and retries. Acceptable;
     a `select … for update` or advisory lock would remove it if ever observed.
   - **Surface the history** (a "Versions" list on a custom instrument's card) — the
     data is captured but not yet shown.

2. **Navigation consolidation (research item 1C) — DONE (on `main`).** `/library`
   now redirects to `/assessments` (the canonical take/browse/report home),
   `LibraryClient` was removed, and the builder stays at `/library/new`. This
   branch reconciled its run-engine + guided-builder work with that change.

3. **Reminders transport (research item 3B) — partial.** The in-app to-do + due nudge
   shipped; **email/Slack/Teams delivery** did not. A `due-reminders` edge function and
   `reminder_email_dispatch`/`integration` tables already exist to build on. *Owner:
   backend/infra.*

4. **AI authoring (research 3A) — intentionally deferred.** "Draft an assessment",
   rewrite-in-place, reverse-item suggester. Kept manual per instruction. When picked
   up, use the human-in-the-loop *select-which-to-insert* pattern and the latest Claude
   models server-side, off the request path.

5. **Leadership inventory now requires completion before submit.** This is a
   **deliberate behaviour change** (was: partial "See results (n/total)"). Requiring a
   complete 63-item set yields sounder facet scores, and the single-page fallback
   preserves the old scroll. If product wants provisional partial results back, add an
   `allowPartial` prop to the runner — confirm the intent.

6. **A11y refinement — DONE.** The paged options are now a proper `radiogroup` with
   roving tabindex and Up/Down/Home/End selection, a visible focus ring, and the
   progress-bar transition honours `prefers-reduced-motion`. (Number-key and
   Left/Right question navigation are unchanged.)

7. **Cross-device resume:** autosave is `localStorage` (per-device). A
   `*_response_draft` row written on navigation would extend resume across devices
   (research item 1B's stretch). *Owner: backend.*

---

## 5. Verdict

The core intent — *make the assessment experience intuitive to run* — is met:
**one engine, one guided builder, one in-app delivery surface**, all on the existing
research-grounded data model, verified green at every step, with the one correctness
defect the review found now fixed. The remaining gaps are sequenced, owned, and
low-risk; the only item requiring care before production is applying the versioning
migration through the project's normal DB workflow.
