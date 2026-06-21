# Workflow / Flow design — gap analysis & later actions

Compares the Claude Design handoff (`Assessment and workshop flow builder`) workflow
surfaces against the current implementation, and parks the deferred recommendations
from earlier review rounds as a backlog.

Design files in scope:
- `Flow Builder.dc.html` / `Flow Builder Table.dc.html` — flow **overview** (list) + **detail** (builder).
- `Workflow Builder.dc.html` — workshop **agenda builder** (module library → agenda canvas → inspector → Run/Publish).
- The **runner** = the live run experience.

Status legend: ✅ done · 🟡 partial · ⛔ missing. Percentages are rough effort estimates.

## Implemented since this analysis (2026-06-21)

- ✅ **Flow node kinds `score` + `report`** — constraint + `program_add_step`, rendered in FlowViews.
- ✅ **On-canvas flow editing** — add / delete step + inline branch-routing editor on the `/workflow/[id]` Map (admins), via the existing add/remove/branch RPCs.
- ✅ **In-place template editing** — `/builder?id=` loads an existing definition into the three-pane editor and saves in place; gallery lists "Your assessments".
- ✅ **Non-Likert question types end-to-end** — the shared runner renders single/multi/text, optional questions gate on *required* items, and answers persist (team + individual paths) in a dedicated `answers` jsonb while `scores` stays numeric (scoring untouched). Replaces the earlier "Publish guard" P2.
- 🟡 **Workshop builder** — module picker phase-grouped (Open/Diverge/Converge/Decide/Close); agenda canvas now has a phase-coloured connector rail + end-of-workshop marker (time rail already existed). New module *types* remain deferred (each needs a run-side renderer); the inspector "live preview" of a module is also still open.
- ✅ **Flow Map keyboard reorder** — per-node ↑/↓ buttons alongside drag (a11y).
- ✅ **Runner 0–10 keyboard** — digit buffering makes two-digit values reachable.
- ✅ **Favicon** — `app/icon.svg` (the gold mark) wired as the app icon.
- ✅ **Branch dynamics dedup** — shared `workflow/dynamics.ts` (markup stays local).

## Implemented since (round 2)

- ✅ **New workshop modules — Retrospective + How-might-we** — authorable + runnable end-to-end (enum + allow-lists, builder phase/hint/config/preview, run dispatch reusing IdeaModule, session readout, types). Reuse the proven Feedback/Brainstorm renderers, so no new real-time code.
- ✅ **Module live-preview** — the builder inspector renders a compact visual mock of each module reflecting the live config.
- ✅ **Generic Likert scales** — the Assessment Builder authors any `a–b` range (presets 1–4…0–10 + preserves loaded exotic scales); editing no longer normalises an exotic scale.

### Known residual limitations (from the post-implementation review)
- 1–10 assessment scales still show generic "Strongly disagree/agree" anchors (the builder has no custom-anchor field yet) — a separate, small feature.
- A retrospective/how-might-we block created via the live-add/quick-start RPCs lands with empty config (→ a single "Notes" lane for retro), the same as every other live-added module; unreachable from the shipped UI (the builder always sets full config, and neither type is in the quick-start palette).
- Remaining large items unchanged: free-form flow canvas; further new module *types* needing bespoke renderers (mind map, affinity, ranking); app-wide table-row a11y sweep.
- The Assessment Builder only authors three Likert scales (1–5 / 1–7 / 0–10); editing a template stored with an exotic scale (e.g. 1–6) normalises it to 1–5 on save. Acceptable while the builder's scale model is fixed; revisit if arbitrary scales are needed.
- Likert keyboard entry can't reach the max of a 0–10 scale (single-digit only) — pre-existing; mouse/keyboard-arrow selection works.
- `FlowViews.BranchEditor` duplicates `FlowBuilder.BranchConfig` (same `program_set_branch` contract + dynamics list). Candidate for a shared component; left as-is to avoid churn across two working surfaces.

---

## 1. Flow overview (list) — ~85% 🟡

Design: a list of flows (name, scope, status, steps, owner, edited) with search + status filters.

Implemented (`app/(app)/workflow/page.tsx`, `FlowsTable.tsx`, `Plays.tsx`, `FlowComposer.tsx`):
- ✅ Tabbed status filters (All / Ongoing / Completed / Archived), expandable rows, per-flow tasks.
- ✅ One-click Plays grid + quick FlowComposer (presets, step strip).
- ✅ "Views" link into the per-flow detail.

Gaps:
- ⛔ Design's explicit **"scope"** column and the exact card/table layout of the list view.
- 🟡 No dedicated full-page flow **gallery**; creation is the inline composer.

## 2. Flow detail / builder — ~60% 🟡

Design: one canvas editor with sub-views **Canvas / Outline / Timeline / Table**, node types
`start / survey / score / branch / report / task / workshop`, on-canvas add-node, branch-condition
editing, node inspector, and **Preview run**.

Implemented (`app/(app)/workflow/[id]/page.tsx`, `FlowViews.tsx`; editing in `FlowBuilder.tsx`):
- ✅ **Outline / Timeline / Table / Map** views over a flow's steps.
- ✅ **Preview run** (plain-language).
- ✅ **Drag-to-reorder** nodes on the Map (`program_reorder_steps` RPC).
- ✅ Branch routing visualised (condition + then/else templates).

Gaps:
- ⛔ **On-canvas editing in the detail view**: add node, edit title/config, edit branch condition all
  live on the Map. Today add/remove/branch editing lives in `FlowBuilder` on the list page, not the detail.
- ⛔ Node kinds **`score`** and **`report`** are not modelled (app uses `interpret`/`commit`/`repulse`).
- 🟡 **Free-form canvas** (x/y node positions, hand-drawn connectors). App Map is auto-laid-out vertical
  + drag-reorder — deliberate, since the flow engine is sequence-based.

## 3. Workshop agenda builder (`Workflow Builder.dc.html`) — ~50% 🟡

Design: three panes — **Module library** (phases Input/Diverge/Converge/Decide/Close, ~18 modules each
with an icon + blurb + default duration) → **Agenda canvas** (time-rail timeline with start times,
up/down reorder, delete) → **Inspector** (title/duration/facilitator + per-module **settings schema** +
**live preview**), with **Run** + Publish and a workflow-summary (per-phase counts/minutes).

Implemented (`app/(app)/workshops/[id]/BuilderClient.tsx`, `WorkshopsClient.tsx`):
- ✅ Add / edit / reorder / delete modules; objective; schedule; assessment binding; Start session.
- ✅ Workshop overview (`/workshops/[id]/overview`) — read-only hub (separate work).

Gaps:
- ⛔ **Phase-grouped module library** (Input/Diverge/Converge/Decide/Close). App `QUICK_MODULES` is a
  flat set of 8 (canvas/brainstorm/vote/discuss/feedback/checkin/outcome/manual).
- ⛔ Richer module set: mind map, How-might-we, affinity grouping, ranking, research/sources, pre-read
  document, retrospective, output summary, sign-off — not authorable as distinct modules.
- ⛔ **Time-rail agenda canvas** with computed start times in the builder.
- ⛔ Inspector **per-module settings schema** (e.g. brainstorm: prompt/anon/silent-timer; voting:
  dots/anon; decision: method) + **live preview** panel.
- 🟡 Layout differs (app builder is not the 3-pane library/canvas/inspector).

## 4. Runner — ~90% ✅ (richer than the design)

Design: a "Run" entry executing the workflow; simpler than the app.

Implemented (`app/run/[id]/*`):
- ✅ Real-time run: canvas, idea/brainstorm, vote, decisions (DACI), plan board, survey/assess modules,
  run-of-show, timer, **presentational module rail** (added this session), end-session + sign-off.

Gaps:
- 🟡 Design-only modules not represented in the run: mind map, HMW, affinity, ranking, retrospective.
- 🟡 The design's literal module-rail visual (Results→Whiteboard→Discussion→Voting→Output→Next-steps)
  vs. the app's richer, different module set.

---

## Later actions (consolidated backlog)

Carried from this and earlier review rounds. Priority: **P1** high-value/low-risk · **P2** medium · **P3** large/uncertain.

### Assessments
- **P1 — Non-Likert question types end-to-end.** The Assessment Builder authors Likert/single/multi/text,
  but the run (`SurveyModule`) renders every item as Likert. Add response collection + scoring for
  single/multi/text so the builder's full type palette is runnable. *(Builder: done; run/scoring: open.)*
- **P2 — In-place template editing in the new builder.** `/builder` is create-focused; editing an
  existing template still uses the form at `/library/new?id=`. Load an existing definition into the
  three-pane builder.
- **P3 — Participant "Competence / Certificates".** The design's Participant screen has a certs section;
  no data model exists. Needs a `certificate`/`competence` schema before it can be built.

### Flow / workflow
- **P1 — On-canvas flow editing in the detail view.** Add-node, edit title/config, and branch-condition
  editing directly on `/workflow/[id]` (Map), folding in what `FlowBuilder` does on the list page.
- **P2 — Workshop agenda builder redesign.** Adopt the `Workflow Builder` three-pane layout:
  phase-grouped module library, time-rail agenda canvas, inspector with per-module settings schema +
  live preview. Expand the module set (mind map, HMW, affinity, ranking, retro, output, sign-off).
- **P2 — Flow node kinds `score` + `report`.** Model and render them (today: `interpret`/`commit`).
- **P3 — Free-form flow canvas.** x/y node positioning + hand-drawn connectors (needs a graph lib;
  lower value while the engine is sequence-based).
- **P3 — Keyboard-accessible reorder on the Map.** Drag is pointer-only; keep parity with the up/down
  reorder in `FlowBuilder`.

### Run / runner
- **P3 — Additional run modules.** Mind map, HMW, affinity grouping, ranking, retrospective as
  first-class run modules.

### Branding / polish
- **P3 — Wire the gold `FaviconMark` into `<head>` / web manifest.** Variant exists in `components/Logo.tsx`;
  not adopted as the app icon.

### Cross-cutting
- **P3 — Table-row click a11y.** Several tables use `<tr onClick>` (app-wide pattern). Convert to
  focusable links/buttons in one pass rather than per-surface.
- **P2 — Non-Likert run rendering guard.** Until the P1 above lands, consider gating Publish or flagging
  when an assessment contains single/multi/text questions, so they don't silently render as Likert.

---

*Generated as a living backlog — update statuses as items land. The design system itself
(Klarert/NewAMU forest+cream) and the Norwegian HMS/ROS domain remain intentionally not adopted per
the "adapt to current app, no ROS" decision.*
