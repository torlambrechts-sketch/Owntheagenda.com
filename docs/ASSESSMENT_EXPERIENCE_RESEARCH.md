# Improving the Assessment Experience — Research & Recommendations

**Authors:** Senior engineering review · UI design · Product supervision
**Date:** 2026-06-20
**Scope:** The three assessment surfaces — **Builder** (authoring), **Question database** (the instrument catalog), and the **Test engine** (the respondent run). Goal: make the whole loop *intuitive to run*.
**Method:** Full read of the live code (files cited inline) + a competitor benchmark of Typeform, SurveyMonkey, Qualtrics, Google/Microsoft Forms, Tally/Jotform/Fillout, and people-assessment delivery (Gallup CliftonStrengths, 15Five, Lattice, Officevibe). Sources are listed in the appendix; figures the researchers could not verify against a primary source are flagged.

---

## 1. Executive summary

OwnTheAgenda already has the **hard part** of an assessment platform: a research-grounded, fully data-driven instrument model (`assessment_template` rows → `definition` JSONB → `instrumentFromRow`), reverse-scoring, anonymity masking, composites, percentiles, benchmarks, perception-gap, longitudinal history, trait copy, and an in-app authoring RPC. That is genuinely ahead of most Stage-1 products and is documented in `docs/ASSESSMENT_LIBRARY.md` and `docs/ASSESSMENT_EXTENSION_PLAN.md`.

The problem is **not capability — it is coherence.** The same job (take an assessment, build one, browse the catalog) is implemented **three or four different ways**, each with a different interaction model, and the *builder* is the thinnest, most blank-page part of the system. The experience is powerful but not yet *intuitive*.

**Three headline findings:**

1. **The respondent run is fragmented into 3 different engines.** A person taking a "personality" assessment gets a polished, paged, one-question-at-a-time card with labelled options (`AssessmentLibrary.tsx` run view). The *same person* taking a team survey, an in-workshop survey, or the 63-item leadership inventory gets a long single-scroll wall of numbered `1–7` buttons (`SurveyRespond.tsx`, `SurveyModule.tsx`, `LeadershipTest.tsx`). Same product, three different "how do I answer this?" experiences — and only one of them follows the modern best practice.

2. **Discovery is split across two overlapping libraries.** `/assessments` (`AssessmentLibrary.tsx`) and `/library` (`LibraryClient.tsx`) both list the same templates, both let you take individual assessments, and both show "your profile." Users have to learn which door to use for which job.

3. **The Builder is a blank form, not a guided tool.** `TemplateBuilder.tsx` is a competent four-card form (Basics / Scale / Dimensions / Questions), but it has **no live preview, no "start from a built-in," no reusable question bank, no AI assist, and one question type only.** Every author types every item from scratch and cannot see what respondents will experience until after they save. This is the single biggest "not intuitive to run" gap.

**Our recommendation:** Adopt one **North Star — "one engine, one catalog, one guided builder"** — and deliver it in three phases. Phase 1 (consolidation) is mostly de-duplication and yields the biggest intuitiveness win for the least new code. Phases 2–3 add the differentiators (guided builder + question bank, AI assist). Two strategic options for *how far to take the builder* are laid out in §6.

---

## 2. Current state — what the code actually does

### 2.1 The three respondent engines (the core inconsistency)

| Engine | File | Interaction model | Progress | Save/resume | Verdict |
|---|---|---|---|---|---|
| **Library run** | `app/(app)/assessments/AssessmentLibrary.tsx` (`view === "run"`, L482–528) | **One question per screen**, big tappable rows, each option **labelled** (min/max anchors), Back/Next, "See my report" | Bar + "Question x of n" + "answered/n" | ❌ React state only — refresh loses answers | **Best-in-class shape.** The model to standardise on. |
| **Survey respond / live** | `app/(app)/assessments/SurveyRespond.tsx`, `app/run/[id]/SurveyModule.tsx`, plus `LibraryClient.tsx` `TakeForm` | **Single long page**, grouped by dimension, bare numbered `1..max` buttons, one Submit at the bottom | None (or implicit) | ❌ | Dense; no anchors on the buttons; high-effort feel. |
| **Leadership inventory** | `app/(app)/assessments/leadership/LeadershipTest.tsx` | **All 63 items on one scroll**, numbered `1..7` buttons | A single `answered/total` bar | ❌ | Highest abandonment risk — a 63-item wall is the exact thing the one-question pattern exists to fix. |

So the product contains the modern pattern (paged, labelled, progress) **and** the anti-pattern (long scroll, bare numbers) side by side. None of the three autosaves.

### 2.2 The two discovery surfaces (the overlap)

- **`/library`** (`LibraryClient.tsx`): card grid with thumbnails, search + facet filters (`useTableControls`), "Your profile" strip, take/launch/view modals, admin **New template** → `/library/new`, edit/delete custom templates.
- **`/assessments`** (`AssessmentLibrary.tsx`, wired in `page.tsx`): a richer **library → detail → run → report** flow with tabs (Assessments / Sessions / Responses), assignment, sample report, norms/percentiles, longitudinal movement, PDF export.

Both read the **same** `assessment_template` catalog and both let an individual take an individual instrument. The richer reporting lives in `/assessments`; the better catalog browsing (search/facets) and the builder entry live in `/library`. Neither is a complete home.

### 2.3 The builder

`app/(app)/library/TemplateBuilder.tsx` (admin-only, saves via `save_assessment_template`):

- Four stacked cards: **Basics** (name, scope, free-text category, description, source), **Scale** (min/max + labels), **Dimensions** (label + blurb rows), **Questions** (text + dimension dropdown + `⇄` reverse toggle).
- Validation runs **only on save** (`validate()`, L88).
- **No live preview** of the respondent view.
- **No "duplicate a built-in to start"** — you cannot clone Psych Safety and tweak it.
- **No question bank** — items exist only inside one instrument; you cannot search, tag, reuse, or import an item.
- **One item type** (anchored Likert agree/disagree). No forced-choice, no per-item scale override.
- `category` is a free-text input → taxonomy drift.
- No drag-to-reorder for dimensions or items.

### 2.4 The question "database"

The data model (`docs/ASSESSMENT_LIBRARY.md`, `lib/survey.ts`, `lib/assessments.ts`) is a real strength: instruments are rows, resolved at runtime, so "add a row → it works everywhere." **But there is no atomic *item* bank** — the smallest reusable unit is a whole instrument. There is no item tagging/search, no instrument **versioning** (editing a live instrument mutates it in place; prior takes can drift semantically), and a custom row cannot reuse a validated item from a built-in.

---

## 3. What best-in-class looks like — Builder

Synthesised from the competitor benchmark (sources in appendix).

| Pattern | Who does it | Why it matters |
|---|---|---|
| **Question-type palette / "Add content" menu** | Typeform "Add content", SurveyMonkey Build menu, Google "+ Add" | Makes the full vocabulary discoverable in one place; common types first, long tail one click away. |
| **Live preview, as the respondent, desktop+mobile toggle** | Qualtrics Preview, Typeform Preview | Authors validate flow/readability before publishing — kills the "I can't see what I'm making" problem (our #1 builder gap). |
| **Inline / direct-manipulation editing** | Qualtrics (click text to edit in place) | Keeps authors in flow vs. context-switching into forms. |
| **Duplicate question / Make a copy / Import questions** | SurveyMonkey "Make a copy", Google "Import questions", Qualtrics block reuse | Template-ize a proven instrument; never rebuild from scratch. **The cheapest high-value builder feature.** |
| **Blocks / sections / question groups** | Qualtrics Blocks, Typeform Question Groups, Google Sections | Modular structure = group, reuse, pace. Maps cleanly onto our **dimensions**. |
| **AI generate (describe → draft) + human-in-the-loop insert** | SurveyMonkey "Build with AI", MS Copilot "Draft with Copilot", Google Gemini "Suggest questions → Insert suggestions", Typeform AI | Collapses blank-page-to-draft to ~30s; the *select-which-to-insert* review step keeps the author in control. AI generation is now **table stakes**, not a differentiator. |
| **AI rewrite-in-place & document import** | MS "Rewrite with Copilot", Jotform/Copilot file-grounded generation | Improve wording inline; turn an existing doc/instrument into items. |
| **Reusable themes / brand kits / accessible-by-default themes** | Typeform Brand Kits, Qualtrics Look & Feel (WCAG 2.1) | On-brand + accessible without restyling each time. |

---

## 4. What best-in-class looks like — Question database / library

| Pattern | Who | Why |
|---|---|---|
| **Methodologist-certified Question Bank** | SurveyMonkey Question Bank, 15Five Question Bank | Pre-written, bias-reduced, validated items let non-experts assemble good instruments fast. We already *own* validated items — they're just trapped inside instruments. |
| **Item-level reuse / "add from library"** | SurveyMonkey, Qualtrics library | Reuse one item across many instruments; one edit propagates. |
| **Tagging, search & filter on items** | Qualtrics library, SurveyMonkey | Find "a psychological-safety item on a 1–7 scale" in seconds. |
| **Versioning** | Qualtrics library versions | Editing a live instrument shouldn't silently change the meaning of historical scores. |
| **Templates / starter gallery** | Google Template Gallery, all | A running start + a model for good phrasing. |
| **Controlled taxonomy (categories as enums, not free text)** | Lattice/CultureAmp driver models | Consistent grouping, filterable, no drift (`category` is free-text today). |

---

## 5. What best-in-class looks like — Test / survey engine (the run)

| Pattern | Who (verified) | Why |
|---|---|---|
| **One question at a time / conversational** | Typeform (origin), SurveyMonkey "Conversation" | Lowers cognitive load and the "wall of questions" abandonment trigger. **We already have this in the library run — just not everywhere.** |
| **Progress bar — visual-only, bottom-placed** | SurveyMonkey's own A/B study | Verified: bottom visual-only bar improved completion; a **top percent-complete bar reduced it below no bar at all**. Hide the bar when skip-logic is on. |
| **Autosave + save-and-resume on navigation** | Qualtrics partial completion (7-day default), Gallup "RESUME" | Long/interruptible instruments lose people at disconnect points; saving progress protects completion. **None of our engines do this.** |
| **Keyboard shortcuts to advance** | Typeform (Enter, 1–0, A/B, Y/N) | Fast, fluid desktop runs; reinforces the conversational pace. |
| **Explicit time estimate up front** | Gallup "~30 min", 15Five "15 min", Officevibe "<2 min" | A bounded, known cost reduces abandonment and sets the right mode. We show `~N min` on the card; reinforce it at run start. |
| **Anchored scale with labelled endpoints + neutral midpoint** | Gallup, Officevibe labelled 0–10 | Self-explanatory, comparable; prevents flattening. Our library run does this; the numbered-button engines don't. |
| **Precise privacy copy — *anonymous* vs *confidential*** | 15Five (explicit distinction), Lattice, Officevibe | Candor depends on perceived safety; vague promises erode trust. We mask at min-3 already — say it crisply at the point of answering. |
| **Mobile-first, full-screen, touch targets** | Typeform modal-on-mobile | A large share answer on phones. |
| **Accessible classic fallback** | SurveyMonkey/Qualtrics WCAG | ⚠️ Trade-off the researchers flagged: the one-question/conversation format is *not* fully screen-reader friendly — offer an accessible single-page fallback. |
| **A distinct, rewarding results reveal** | Gallup Signature-Themes reveal | Turns raw scores into perceived value and drives follow-through. Our report view is already strong here — keep it as the shared payoff. |
| **Deliver where people work + auto-reminders** | Lattice (homepage task + "2 days before" reminder), 15Five/Officevibe (Slack/Teams/email/SMS) | In-flow delivery + proactive nudges drive response rates far above "log into a portal." Our assignment exists; reminders are noted as not-yet-wired in `ASSESSMENTS_GAPS.md`. |

---

## 6. Recommendations

### North Star: **One engine · One catalog · One guided builder**

One way to take any assessment, one place to find them, one tool to build them. Everything below ladders up to that.

### Phase 1 — Consolidate (highest intuitiveness-per-effort; mostly de-duplication)

**1A. Unify the respondent run into a single `<AssessmentRunner>` component.**
Promote the `AssessmentLibrary` run view (paged, labelled, progress) into a shared component and have **all** callers use it — `SurveyRespond`, `SurveyModule` (live + pre-work), `LibraryClient` `TakeForm`, and ideally the leadership inventory. One answer-experience everywhere. The scoring already shares `lib/survey.ts` (`dimensionMeans`, reverse-aware), so this is a presentation merge, not a maths change.
- *Leadership 63-item:* keep its specialised scoring engine (per `ASSESSMENTS_GAPS.md` gap 8) but render it **paged/section-by-section** through the same runner instead of one scroll.

**1B. Add autosave + resume to the runner.** Persist in-progress answers (localStorage immediately; a `*_response_draft` row on navigation for cross-device, mirroring Qualtrics' page-navigation autosave). This is the single biggest completion-rate protector and currently absent everywhere.

**1C. Pick one home for discovery.** Make `/assessments` the canonical catalog (it has detail→run→report, assignment, reporting) and fold `/library`'s **search/facets** and **builder entry** into it; reduce `/library` to the builder route or redirect it. Removes the "which door?" confusion.

**1D. Tighten the run polish to the verified evidence:** progress bar **visual-only at the bottom**; a one-line time-estimate + precise privacy line ("Anonymous in aggregate — your individual answers are never shown") at run start; keyboard shortcuts (number keys + Enter) in the runner.

### Phase 2 — A guided Builder + a real Question Bank (the biggest "intuitive to build" win)

**2A. Live preview pane.** Split the builder: edit on the left, a live **respondent preview** (the Phase-1 runner, desktop/mobile toggle) on the right. Authors finally see what they're making.

**2B. "Start from a template."** Let an author **duplicate any built-in or custom instrument** as the seed for a new one (`save_assessment_template` already accepts a full definition — this is a clone-into-builder action). Cheapest high-value feature; kills the blank page.

**2C. Promote items to a reusable, tagged Question Bank.** Introduce an `assessment_item` concept (or a tag/index over existing definition items) so authors can **search and "add from library"** validated items, filtered by scale/dimension/source. We already own research-grounded items (Bang, Edmondson, Fyhn) — surface them as an asset instead of leaving them locked inside instruments.

**2D. Controlled taxonomy + inline validation.** Make `category` a managed enum (with an "add new" affordance) and validate per-field on blur, not only on save.

**2E. Instrument versioning.** When a live instrument is edited, version the definition so historical takes keep their original semantics (protects `individual_response_history` trends and benchmarks).

### Phase 3 — AI assist & in-flow delivery (the differentiators)

**3A. AI "Draft an assessment."** Describe the goal → generate dimensions + anchored items the author reviews and **multi-selects to insert** (the Gemini/Copilot human-in-the-loop pattern), plus **AI rewrite-in-place** for wording and a **reverse-item suggester**. Use the latest Claude models server-side (off the request path). This is now table-stakes among competitors and pairs naturally with our existing trait-copy authoring.

**3B. Wire reminders + in-flow delivery.** Close the `ASSESSMENTS_GAPS.md` reminder hook: homepage task + an automatic nudge a couple of days before a due date (Lattice's pattern); later, Slack/Teams/email delivery (we have an `integration` table and a `due-reminders` edge function to build on).

### Two strategic options for how far to take the Builder

- **Option A — "Curated, guided builder" (recommended).** Phases 1–2 + AI draft (3A). Position the product as *opinionated, research-grounded assessments that are easy to assemble and effortless to run.* Plays to our moat (validated science + the workshop loop) without trying to out-feature Qualtrics. Best ROI.
- **Option B — "Power authoring."** Add branching/skip logic, randomization, multiple item types, quotas (the Qualtrics/Typeform feature set). Only worth it if customers demand bespoke survey power; it's a large surface and pulls away from the leadership-team focus. **Recommend deferring** — most of it is unnecessary for anchored-Likert leadership instruments.

---

## 7. UI-design notes (concrete)

- **The runner card:** keep the current `a-qcard` (statement + labelled options + Back/Next), add (a) a thin **bottom** progress bar, (b) number-key hints on each option, (c) a persistent "~8 min · answers saved automatically" caption, (d) larger touch targets and a single-column mobile layout.
- **Accessible fallback:** a "Show all questions on one page" link from the runner for screen-reader/keyboard users — reuse the existing grouped `SurveyRespond` layout, which is the accessible single-page form.
- **Builder split-view:** left = the four existing cards; right = live preview with Desktop/Mobile toggle and a "Preview as respondent" mode. Add a sticky top bar: `Template ▸ Duplicate · Preview · Save`.
- **Question Bank drawer:** a right-side drawer in the Questions card — search box, scale/dimension/source filters, each result with a "＋ Add" and a "use & edit" affordance.
- **Results reveal:** keep the report view as the shared, rewarding payoff for *every* engine (today only the library run reaches it cleanly) — it's already the strongest screen.

## 8. Supervisor notes — sequencing, risk, effort

- **Sequence:** 1A→1B→1C→1D, then 2A→2B (quick wins) → 2C/2E (data model), then 3A→3B. Phase 1 ships visible intuitiveness fast and de-risks everything after it by giving one engine to improve.
- **Effort (directional T-shirt):** 1A **M**, 1B **M**, 1C **S–M**, 1D **S** · 2A **M**, 2B **S**, 2C **M–L**, 2D **S**, 2E **M** · 3A **M–L**, 3B **M**.
- **Risk to protect:** the privacy/anonymity invariants (min-3 mask, composite/benchmark/gap nulling) and reverse-scoring must survive the engine merge — they live in `lib/survey.ts` and the SQL `private.*` functions and are well-tested; the merge is presentational, but add runner-level tests. Versioning (2E) must land *before or with* any "edit live instrument" expansion to avoid corrupting longitudinal trends.
- **Don't rebuild the moat:** the data-driven catalog, scoring, masking, norms, and trait copy are assets — this plan *consolidates and surfaces* them, it does not replace them.

---

## Appendix — sources

**Builder / authoring:** SurveyMonkey question types & Question Bank (`help.surveymonkey.com/.../question-types/`), Build with AI (`/create/build-with-ai/`), copy/move & make-a-copy (`/create/copying-moving-questions/`, `/manage/copying-surveys/`), paste-to-create (`/create/copy-paste-questions/`); Qualtrics survey builder & preview (`qualtrics.com/support/survey-platform/survey-module/survey-module-overview/`), Blocks, Survey Flow, randomization, Look & Feel; Typeform question types, Question Groups, Logic Map, Themes/Brand Kits, Typeform AI, Formless; Google Forms editing (`support.google.com/docs/answer/2839737`), Gemini "Suggest questions" (`/answer/16363314`); Microsoft Copilot in Forms (`support.microsoft.com/.../6a21bfbd-...`) Draft/Rewrite/Add/Theme; Tally `/logic` & formulas; Jotform AI Form Builder; Fillout page logic.

**Engine / delivery:** Typeform one-question-at-a-time, keyboard shortcuts, Recall, End Screens, embed types; SurveyMonkey progress-bar A/B study (`surveymonkey.com/curiosity/progress-bars-good-bad-survey-survey-says/`) and progress-bar+skip-logic caveat; Qualtrics partial completion / autosave (`/survey-options/partial-completion/`, 7-day default), Timing question, accessibility checker (WCAG 2.0 AA / 2.2); Baymard inline validation; Gallup CliftonStrengths timed forced-choice + RESUME + tiered reveal (`gallup.com/cliftonstrengths/en/253676/`, `support.gallup.com/.../360050438894`); 15Five Check-in & confidential-vs-anonymous + min-5 threshold (`success.15five.com/.../8359259684507`); Lattice anonymity tiers + task delivery + reminders (`help.lattice.com/.../360061207493`); Officevibe micro-pulse + anonymous two-way chat + multi-channel (`help.workleap.com/.../10281707`).

**Verification flags (do not cite as hard fact):** Typeform "47%/57% completion" and any "+X% vs traditional forms" figures (third-party only); "86% vs 34% mobile" contrast (secondary; the verified 86.8% is a short-survey median); exact Gallup per-item timer (20 vs 40s); Qualtrics generative survey-authoring UI (corroborated, exact UI unverified). Several vendor help pages (Typeform, some Gallup/Lattice) returned 403 to automated fetch and were corroborated via search/secondary sources.
