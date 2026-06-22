# Design implementation

This file tracks how the **Claude Design** handoffs (the *“Assessment and workshop
flow builder”* project) have been implemented in this codebase.

**Principle:** the design mocks are reproduced *functionally and visually* but
**adapted to the app's own design system** — the app's tokens, components and
English copy — rather than copying the handoff's Klarert palette or its Norwegian
HMS/AML/ROS domain framing. Each design file maps to one or more real surfaces.

Detailed gap analyses + backlog live in:
- [`docs/ASSESSMENT_ENGINE_GAP_ANALYSIS.md`](docs/ASSESSMENT_ENGINE_GAP_ANALYSIS.md)
- [`docs/WORKFLOW_DESIGN_GAP_ANALYSIS.md`](docs/WORKFLOW_DESIGN_GAP_ANALYSIS.md)

Status: ✅ done · 🟡 partial · ⛔ not started.

---

## Design language

The handoffs use a forest-green + cream system; the app already had a compatible
palette, so surfaces use the app tokens in `app/globals.css` (`--forest`,
`--green`, `--canvas`, `--surface`, `--ink`, `--muted`, `--line`, `--amber`,
`--rust`, `--role`, `--font-display`, …) and shared classes (`.pill`, `.btn-prim`,
`.btn-sec`, `.inp`, `.a-ovcard`, `.a-pt/.a-ps`, `.toast`, …). The gold mark from
the handoff is the app favicon (`app/icon.svg`).

---

## Surfaces by handoff

### Assessment Builder — `Assessment Builder.dc.html` → `/builder` ✅
- Gallery (start from a template / blank, curated set), three-pane editor
  (section rail · question canvas · inspector), respondent preview.
- Question types: Likert / single / multi / free-text; required + reverse;
  generic Likert scales (any `a–b` range); per-section + workshop-trigger threshold.
- In-place editing of existing workspace templates (`/builder?id=`), an
  "Add section" affordance in both the rail and the canvas.
- Persists via `save_assessment_template`; admin-only; full-screen route.

### Assessment Suite (overview) — `Assessment Suite.dc.html` → `/assessments` ✅
- Org-wide hub over assessment instances: KPIs, instance list, 6-tab detail.
- **Start flow:** `＋ New assessment` (admins + team leads) → pick instrument +
  team → opens an instance (idempotent per team+kind) → routes to the engine.
- Direct **"Live status →"** on open/paused rows (scoped to manageable teams).

### Assessment Engine — `Assessment Engine.dc.html` 🟡
- **Taking engine (runner)** — `components/AssessmentRunner.tsx` ✅: opt-in
  welcome + thank-you ("what happens next") stages, item- or section-paged modes
  with progress dots, full Likert labels, all four question types, autosave/resume,
  accessible single-page fallback + keyboard radios.
- **Run status (live monitoring)** — `/assessments/status/[id]` ✅: KPIs,
  response-rate ring, responses-over-time chart, section scores, activity feed,
  **distribute** (public link create/copy/revoke), remind, pause/resume, close.
- **Trigger watch** ✅: flags sections below the template threshold; `close_survey`
  emits threshold-alert + closed-&-report notifications; one-click mitigation-workshop CTA.
- **Lifecycle notifications** 🟡: invite-on-launch, reminders, threshold, closed —
  in-app (email partially wired). A per-type management/prefs UI + web-push are
  not built (see backlog).
- Respondent take-path: launch/reminder notifications + dashboard "Take" deep-link
  to the take surface (`/assessments/library`).

### Flow Builder — `Flow Builder.dc.html` / `Flow Builder Table.dc.html` ✅
- **Overview (list)** — `/workflow` ✅: status tabs, plays (top + expanded),
  collapsible composer, summary KPI row, per-row **View** → side-window mini-map.
- **Detail/builder** — `/workflow/[id]` ✅: Outline / Timeline / Table / Map
  views. The **Table** sub-view matches the handoff: "Flow steps" header card,
  grouped **Add step** palette, Name + sub-line, Configuration column, "Connects
  to" chips with if/else branch tags, per-row delete (locked when done), branch
  footnote. On-canvas editing (add/delete/reorder, inline branch routing); drag +
  keyboard reorder; node kinds incl. `score` + `report`; Preview run.
- Free-form x/y canvas remains a non-goal (the engine is sequence-based).

### Assessment & Workshop Flow Builder — `Assessment and workshop flow builder` handoff ✅
- Adapted **in place** to the app's Next.js paradigm (no invented `ui_configurations`
  / DB-driven UI layer; copy lives in code). Strictly Supabase.
- **Quick Start wizard** — `/start` ✅ (full-screen, admin-gated): Team → Focus →
  Cadence → Invite, mapped onto existing primitives — team insert, curated **Play**
  (focus → instrument + workshop), cadence in the launched flow's title, and
  `create_invitation` per email. No new schema.
- **Dashboard** — `/dashboard` ✅ (enhanced in place, real data only): KPI row,
  per-team health bars (Insight rollup), derived "Suggested next step" nudge,
  Active assessments (collection progress via `program_status`), Recent activity
  (`audit_log`, admins), plus the existing personal to-do.

### Workflow / Workshop Builder — `Workflow Builder.dc.html` 🟡
- Workshop builder (`/workshops/[id]`): phase-grouped module picker
  (Open/Diverge/Converge/Decide/Close), time-rail agenda canvas with connector,
  inspector live-preview, runnable **Retrospective** + **How-might-we** modules
  (reusing the proven Idea/Feedback renderers).
- Further bespoke module types (mind map, affinity, ranking) remain on the backlog
  (each needs a run-side renderer).

### Organisation & Security — `Organisation & Security.dc.html` ⛔
- Not yet adopted from this handoff.

---

## Remaining (see the gap-analysis docs)
- Notification management/prefs UI + web-push channel.
- By-unit distribution for the run-status view (needs a cross-unit model).
- Additional workshop module types; free-form flow canvas.
- `Organisation & Security` surface.

## Verification
Every shipped surface is kept green: `tsc --noEmit`, `next lint`, `next build`,
and the `vitest` suite all pass on `main`; SQL changes are applied as
`supabase/migrations/*` and grant posture is checked after each.
