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

**Accessibility — closed.** The single-page fallback and the paged view are both
proper `radiogroup`s with `aria-checked`. The paged options now implement roving
tabindex with Up/Down/Home/End selection and a visible focus ring (Space still
selects; number keys and Left/Right question nav unchanged), and the progress-bar
transition honours `prefers-reduced-motion`. The one-at-a-time format remains the
research-flagged trade-off, but the accessible single-page path is always one click away.

---

## 4. Remaining gaps (closed-off with recommendations)

These are deliberately scoped out of A–C or require steps outside this environment.
None blocks what shipped.

1. **Two migrations need `supabase db push` (the only remaining live-DB step).**
   `assessment_template_version` (versioning) and `assessment_due_reminders` were
   **dry-run-verified against the live schema** in a rolled-back transaction — the
   tables/policies/functions compile and bind to real columns, and the reminder
   generator executed (returned 0, nothing currently due). They were **not** persisted;
   apply them with `db push` and re-run `get_advisors` per the project's discipline.
   *Owner: backend.* **Low risk.**
   - Minor known caveat: two admins saving the *same* custom instrument simultaneously
     can collide on `(template_id, version)`; one save errors and retries. Acceptable;
     an advisory lock would remove it if ever observed.
   - **Version-history UI — DONE.** The builder's edit mode lists prior versions from
     `assessment_template_version` (degrades to nothing until the migration is applied).

2. **Navigation consolidation (research item 1C) — DONE (on `main`).** `/library`
   now redirects to `/assessments` (the canonical take/browse/report home),
   `LibraryClient` was removed, and the builder stays at `/library/new`.

3. **Reminders (research item 3B) — DONE in-app; email wired, dormant.** Beyond the
   dashboard to-do, a `private.generate_assessment_reminders()` generator now creates
   in-app due-soon/overdue notifications for assigned assessments, and the
   `due-reminders` email digest includes the two new kinds. **Email sends once
   `RESEND_API_KEY` is set** on the function (same dormancy as the existing reminders).
   Slack/Teams delivery remains future work. *Owner: backend/infra.*

4. **AI authoring (research 3A) — intentionally deferred.** "Draft an assessment",
   rewrite-in-place, reverse-item suggester. Kept manual per instruction. When picked
   up, use the human-in-the-loop *select-which-to-insert* pattern and the latest Claude
   models server-side, off the request path.

5. **Leadership partial submit — RESTORED.** The runner gained an `allowPartial` mode
   (a "See results (n/total)" submit mid-flow and at the end, mirrored in the single-page
   fallback); the leadership inventory enables it. All other instruments keep
   require-complete. This closes the behaviour-change flag from the first review.

6. **A11y refinement — DONE.** The paged options are a proper `radiogroup` with roving
   tabindex and Up/Down/Home/End selection, a visible focus ring, and the progress-bar
   transition honours `prefers-reduced-motion`.

7. **Cross-device resume — deliberate non-goal.** Autosave is `localStorage`
   (per-device), which already covers the real failure modes (reload, tab crash, browser
   restart on the same device). Mid-assessment resume on a *different* device for a
   5–15-minute instrument is rare, and a server-draft table + RPC + async runner rework
   is disproportionate to that value and adds surface area. Re-open only if usage data
   shows cross-device drop-off. *Engineering decision, not an oversight.*

---

## 5. Verdict

The core intent — *make the assessment experience intuitive to run* — is met:
**one engine, one guided builder, one in-app delivery surface**, all on the existing
research-grounded data model, verified green at every step, with the one correctness
defect the first review found now fixed.

**Round 2** closed the rest of the backlog: navigation consolidation (via `main`),
the a11y refinement, version-history UI, leadership partial-submit, and the assessment
due-reminder generator + email digest — with both new migrations dry-run-verified
against the live schema (rolled back, nothing persisted). The **only** remaining
production step is `supabase db push` for the two committed migrations (plus setting
`RESEND_API_KEY` if/when email reminders are wanted); AI authoring is the sole feature
intentionally left for a later cycle, and cross-device resume is a documented non-goal.
No open correctness or design gaps remain in scope.
