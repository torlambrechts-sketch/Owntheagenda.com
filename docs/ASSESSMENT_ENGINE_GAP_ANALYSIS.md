# Assessment Engine design — gap analysis & later actions

Compares the Claude Design handoff `Assessment Engine.dc.html` (plus `Assessment Suite`)
against the current implementation of the assessment surfaces — **overview**, **runner**,
the **run-status / live-monitoring detail**, and the **notification lifecycle** — and parks
the recommendations as a prioritised backlog.

Design surfaces in `Assessment Engine.dc.html`:
- **Taking engine** (respondent runner): welcome → section-paged questions → thank-you.
- **Run status** (coordinator live-monitoring detail for one instance).
- **Push notifications** (lifecycle messaging management).

Status legend: ✅ done · 🟡 partial · ⛔ missing. Percentages are rough effort estimates.

---

## 1. Overview — `/assessments` (Assessment Suite) — ✅ ~90%

Design: org-wide hub over assessment instances (the `Assessment Suite` design — already built).

Implemented (`app/(app)/assessments/page.tsx`, `suite/AssessmentSuite.tsx`):
- ✅ 4 KPIs, instance list (name/type/status/responses/team), and a 6-tab detail
  (Info / Questions / Responses / Results / Workshop / Activity).
- ✅ Results tab shows section means with band colouring; Workshop tab prompts a follow-up
  when sections sit below the band.

Gaps: none material for the overview itself (the new design doesn't change it).

## 2. Runner — `AssessmentRunner` (Taking engine) — 🟡 ~70%

Design: a respondent flow with three stages — a **Welcome** card (title, ~time, anonymity
facts, "Start assessment", legal basis), **section-paged questions** (one *section* per page,
multiple question cards, "Section X of Y" + section name, progress bar + per-section dots,
"~N min left", "Anonymous" pill, autosave line), and a **Thank-you** card ("What happens next":
results aggregated → AMU review → workshop if triggered). Likert renders as 5 **labelled**
buttons (number + "Strongly disagree"…"Strongly agree"); choice as radios; free-text as a box.

Implemented (`components/AssessmentRunner.tsx`):
- ✅ Likert / single / multi / free-text rendering; required-vs-optional gating; keyboard entry;
  local + server autosave/resume; an accessible "show all on one page" fallback.
- ✅ Progress bar + "answered / N" + scale legend + privacy note (the `intro`).
- 🟡 **Paged one-question-at-a-time, not section-paged.** No "Section X of Y" header or
  per-section progress dots; questions are a flat list, not grouped by dimension/section.
- 🟡 **Likert labels only on the endpoints** (1 and max); the design labels every point
  (Disagree / Neutral / Agree …).
- ⛔ **No Welcome/intro card** — the runner starts on Q1. (Callers add some framing.)
- ⛔ **No Thank-you / "What happens next" screen** in the runner — it delegates to `onSubmit`;
  `PublicSurveyForm` shows a basic thank-you, `SurveyRespond` shows results, but neither has the
  "results → AMU review → workshop if triggered" next-steps panel.

## 3. Run status / live monitoring detail — 🟡 ~30%

Design: a dedicated live page for ONE running assessment — breadcrumb, "… — live" + a
**Collecting** pill, **Pause** + **Send reminder**; **4 KPI cards** (Responses, Response rate,
Outstanding, Closes in); a **responses-over-time** cumulative chart; a **by-unit table**
(rate + progress bar + Nudge / On-track); an **overall response-rate ring**; a **live activity
feed**; and a **Trigger watch** (sections trending below threshold → auto-schedule a mitigation
workshop for the affected units).

Implemented (`app/(app)/assessments/SendSurvey.tsx` — folded into `/assessments`, no dedicated route):
- ✅ Per-survey `responded / total` pill + expandable participant roster (`survey_participation`).
- ✅ Free-text comments (masked < 3), perception-gap card (subject vs team), manual **remind**,
  close, share-token toggle.
- ⛔ Dedicated `/assessments/[id]/status` route; KPI cards; responses-over-time chart; response-rate
  ring/gauge; **by-unit breakdown** (today it's single-team); live activity feed; **Pause** control;
  **Trigger watch** (threshold → auto-schedule).

## 4. Push notifications / lifecycle — 🟡 ~40%

Design: a lifecycle-messaging surface — phone lock-screen preview + per-type cards
(Invitation / Reminder / Manager nudge / Threshold alert / Closed & report), each with a trigger,
audience, **channels (push / email / in-app)**, an on/off toggle, and a message preview.

Implemented (`notification` table; `app/(app)/layout.tsx` badge; reminder RPCs):
- ✅ In-app notification infra (table, badge, mark-read); survey/pulse **reminder** (manual +
  auto-on-due); `flow_overdue` nudge; `session_scheduled`.
- 🟡 Email is half-wired (`emailed_at` column + dispatch migration) with no UX.
- ⛔ **No management UI** (per-type toggles, audience, channel matrix); **no push channel**;
  **no Invitation / Threshold-alert / Closed+report** lifecycle messages; no per-user preferences.

## Cross-cutting: the threshold "Trigger watch" — ⛔ ~5%

The Assessment Builder writes a per-template `threshold` into the definition and the route parses
it back, **but nothing reads it to act** (`grep threshold` finds only the builder + an unrelated
`surveyFocus` default). The suite's "below band → schedule workshop" is a *separate, manual* band
mechanism (45 % / 62 % of scale), not the builder threshold, and it doesn't auto-schedule. The
design's Trigger watch (live "2 sections trending below 3.0 → auto-schedule for Warehouse &
Production") is absent end-to-end.

---

## Later actions (prioritised backlog)

Priority: **P1** high-value / lower-risk · **P2** medium · **P3** large / lower-value.

### Runner (Taking engine)
- **P1 — Welcome + Thank-you stages.** Add an optional intro card (title, ~time, anonymity facts,
  Start) and a done card with a "What happens next" panel to `AssessmentRunner` (props-driven so
  every caller — `SurveyRespond`, `SurveyModule`, `PublicSurveyForm`, library — opts in). Closes the
  biggest respondent-experience gap with no schema change.
- **P2 — Section-paged mode + per-section dots.** Add a "by section" paging option (one dimension per
  page, "Section X of Y" header, section dots) alongside the current one-at-a-time mode, driven off
  `instrument.dimensions`.
- **P2 — Full Likert labels.** Label every scale point (not just endpoints) when labels are available.

### Run status / live monitoring
- **P1 — Dedicated live-status view** for one instance: KPI cards (responses, rate, outstanding,
  closes-in), an overall response-rate ring, and the existing roster/remind — reusing
  `survey_participation` / `survey_results`. Mostly a presentational lift over data we already have.
- **P2 — Responses-over-time chart + live activity feed.** Needs a per-response timestamp series
  (`survey_response.created_at` already exists) and a recent-events read.
- **P2 — By-unit breakdown + per-unit nudge.** Generalise the single-team roster to multiple units
  with per-unit response rate + targeted reminder.
- **P3 — Pause / resume controls** for a collecting survey.

### Threshold trigger watch (the headline missing feature)
- **P1 — Act on the builder `threshold`.** When a section/dimension mean falls below the template's
  `threshold` at close (and/or trends below live), surface a **Trigger watch** and offer / auto-create
  a mitigation workshop for the affected team — wiring the dormant builder field into the existing
  flow/workshop machinery. This is the through-line the design keeps promising ("workshop if triggered").

### Notifications
- **P2 — Threshold-alert + Closed-&-report lifecycle messages** (reuse the `notification` table).
- **P2 — Notification management UI** (per-type toggles + channel matrix) and surfaced email delivery.
- **P3 — Push channel** (web push / device) as a third channel.

---

*Living backlog — update as items land. The design's Norwegian HSE/AML framing (e.g.
"Behandlingsgrunnlag: AML § 7-2") stays adapted to the app's generic English copy per the earlier
"adapt to current app, no ROS/HMS" decision.*
