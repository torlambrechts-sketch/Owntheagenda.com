# Workshop Engine Rewrite — Gap Analysis & Implementation Plan

Source design: `Workshops.dc.html` (Claude Design handoff, "Owntheagenda: Workshop").
Target: migrate the live OwnTheAgenda workshop module to match the new design **in full**,
including the new **Whiteboards** engine.

Decisions locked with the product owner:

1. **Workflow** — deliver this plan, then implement autonomously phase-by-phase (DB via MCP, code, push to `main`).
2. **Whiteboards** — build the **full** engine: standalone gallery + canvas editor + export (PNG/PPTX/JSON) + import + templates, *and* the in-run canvas block.
3. **Taxonomy** — **adopt the design's block taxonomy** as canonical (migrate the `activity_type` enum + remap existing rows/templates).
4. **Navigation** — **match the design exactly**: left nav = *Workshops · Whiteboards · Run workshop*. Templates becomes a tab inside the Workshops home; the Builder is reached via a "Build workshop" button, not a nav item.

---

## 1. What the design contains (11 views)

| Design view | Purpose |
|---|---|
| **home** | Workshops/Templates tabs · list & board views · 4 KPI stats · Build + New workshop |
| **overview** | Workshop detail · Facilitator/Participant toggle · meta strip · agenda-by-phase · seeded-from-assessment · participants · objectives |
| **builder** | Block-library sidebar (+ assessment "suggested" pool) · 4 phase columns (drag/drop) · sliding properties pane with **per-type run-content config** · preview |
| **templates** | Template manager grid (edit/duplicate/delete) — also surfaced as a home tab |
| **new-workshop** (slide-over) | Start point assessment/template/blank · assessment picker w/ **seed preview** · name/team/date |
| **run-setup** | Pick workshop · role · **dry-run** toggle · launch |
| **run** | Live cockpit: 3 cols (agenda · current-block module · actions+discussion) · per-type modules (fac/participant variants) · reactions + floating bursts · comments · presence · progress |
| **report** | Outcome report: summary stats · owned actions · captured-by-block · export |
| **prep** | Pre-workshop prep that **seeds the live agenda** · organizer/participant · eligible blocks accept pre-work |
| **whiteboards** | Board gallery: Boards/Templates tabs · search/sort/owner filter · previews · presence |
| **board** | Full canvas editor: notes, 9 shapes, 4 connector styles, pen/marker, text, per-element comments + reactions, resize, export/import |

**Block taxonomy (design):** `checkin, framing, discussion, breakout, vote, decision, actions, reflect, break, canvas`.
**Phases (design):** `open` (green) · `explore` (blue) · `decide` (amber) · `close` (violet).

---

## 2. Current implementation (fact-checked)

The live app is already substantial — much of this is **reshape + restyle**, not greenfield.

**Routes:** `app/(app)/workshops/{page,[id]/page,[id]/overview/page,builder/page,templates/page,run/page}.tsx`, live cockpit at `app/run/[id]/page.tsx`.
**Run modules (exist):** `CanvasBoard`, `IdeaModule` (brainstorm/hmw/feedback/retrospective/vote), `SurveyModule`, `CharterModule`, `AssessModule`, `ManualModule`, `PlanBoard`, `DecisionsPanel`.
**Realtime:** session, block, participant, idea/vote/reaction/comment, canvas_object, plan_task, action_item.
**DB:** `template`, `workshop`, `block`, `session`, `participant`, `canvas_object`, `canvas_snapshot`, `idea`, `idea_vote`, `idea_reaction`, `idea_comment`, `action_item`, `agreement`, `decision`, `survey`/`survey_response`, `assessment_template`. RPCs for create/start/phase/timer/end/vote/seed/survey/etc. RLS throughout.
**Enum `activity_type` (current):** `canvas, vote, discuss, checkin, outcome, brainstorm, feedback, manual, charter, assess, survey, retrospective, hmw`.
**Phases (current):** open/explore/decide/close already exist (constraint `block_phase_check`), but accent mapping differs from design.

---

## 3. Gap analysis (design → current)

### A. Taxonomy & phases
- **Add** enum values: `framing, discussion, breakout, decision, actions, reflect, break`.
- **Remap** legacy rows + template `definition.phases[].type`: `discuss→discussion`, `outcome→actions`, `brainstorm→discussion` (or `canvas` where ideation), `hmw→discussion`, `retrospective→reflect`, `feedback→discussion`, `charter→framing` (closest), `manual→checkin`.
- **Retain** `survey`/`assess` in the enum (NOT removed): the assessment integration runs assessments live in-session; the design treats assessment as a *seeding source*, but we keep these as extended (non-builder-default) types so the assessment engine keeps working. Documented deliberate deviation.
- Re-key phase accents to design: open=green, explore=blue, decide=amber, close=violet (`blocks.ts` + `visuals.tsx`).

### B. Navigation
- `Shell.tsx`: Workshops group → **Workshops / Whiteboards / Run workshop**. Drop Templates + Builder nav links (Templates → home tab; Builder → button).

### C. Home
- Add Workshops|Templates **tabs**, **stats strip**, list/board toggle (board = status columns Live/Scheduled/Completed). New-workshop slide-over already exists (restyle + add seed preview). Add "Build workshop" → blank builder.

### D. Overview
- Add **meta strip** (When/Duration/Participants/Owner), facilitator/participant toggle, seeded-from-assessment weak-area bars, objectives, how-to-prepare card. Wire buttons: Edit in builder / Preparation / Outcome / Enter run.

### E. Builder
- Reshape to: **library sidebar** (+ suggested-from-assessment pool) · 4 phase columns · **properties pane** with per-type **run-content config** (the `renderBlockProps` equivalent that writes `block.config`). Drag/drop already partially present.

### F. Run cockpit
- Reshape `app/run/[id]` to the **3-column** design and **per-type modules** matching the design's `renderRunModule` (checkin/framing/discussion/breakout/vote/decision/actions/reflect/break/canvas), each with **facilitator + participant** variants. Add **reaction bar + floating bursts**, **block comments**, **presence**, **progress bar**, **action panel**. Reuse existing realtime + idea/vote/comment/action tables; add tables only where the new modules need them (breakout findings, decisions-in-block, reflections, per-block reactions/bursts).

### G. Run setup / Prep / Report
- Run-setup exists → restyle. **Prep**: new page; pre-work contributions seed the live agenda (discussion points, vote options, canvas notes, reflections, framing questions). **Report**: new outcome page (summary stats, owned actions, captured-by-block, export).

### H. Whiteboards (new product surface)
- **DB**: standalone `whiteboard` table (not session-bound) + `whiteboard_object` (or reuse a board-scoped variant of canvas geometry) + element comments/reactions + templates. Persistence independent of a live session.
- **Routes**: `/workshops/whiteboards` (gallery) + `/workshops/whiteboards/[id]` (editor).
- **Engine**: shapes (9), connectors (4 styles), pen/marker, text, per-element comments + reactions, resize handles. Extend the existing `CanvasBoard` into a shared engine used by both standalone boards and the in-run canvas block.
- **Export/Import**: PNG (SVG→canvas), **PPTX** (hand-rolled OOXML zip per the design's `buildPptx`), JSON; import JSON.
- **Templates**: blank, brainstorm, retro, mind map, flowchart, 2×2 matrix.

---

## 4. Phased implementation

Each phase: implement → `tsc --noEmit` + `next build` → DB verify under RLS (begin/set jwt/rollback) → commit → push `mergetmp:main` → keep E2E green.

- **Phase 0 — Taxonomy & tokens (DB + data).** Enum add + row/template remap migration; `blocks.ts`/`visuals.tsx`/`lib/util.ts` to design taxonomy, labels, icons, phase accents. Regenerate types.
- **Phase 1 — Nav.** `Shell.tsx` → Workshops/Whiteboards/Run.
- **Phase 2 — Home.** Tabs, stats, list/board, slide-over seed preview, Build workshop.
- **Phase 3 — Overview.** Meta strip, fac/participant, seeded card, objectives, prepare card.
- **Phase 4 — Builder.** Library + suggested pool, phase columns, properties pane w/ per-type config.
- **Phase 5 — Run cockpit.** 3-col, per-type modules (fac+participant), reactions/bursts, comments, presence, progress, actions. New tables for breakout/decision/reflect as needed.
- **Phase 6 — Run-setup / Prep / Report.** Restyle setup; build prep (seeds agenda); build report.
- **Phase 7 — Whiteboards.** DB + gallery + editor + export/import + templates.
- **Phase 8 — Wire-through & hardening.** Builder config → run seeds; assessment seeding end-to-end; security/scale review; E2E coverage for new surfaces.

### Deliberate deviations from the prototype
- The prototype is in-memory React; we keep everything **server + Supabase + RLS**.
- **survey/assess/manual/charter** stay supported (assessment integration) even though they're not first-class in the design's builder picker.
- Norwegian seed names/avatars in the prototype are illustrative; we use real workspace data.

---

## 5. Status log
- **Phase 0 — Taxonomy & tokens ✅** Migration `activity_type_design_taxonomy` adds enum values framing/discussion/breakout/decision/actions/reflect/break (additive; legacy rows remapped at end of Phase 5). `types/database.types.ts` enum union patched surgically (full CLI regen drifts from the committed file — do NOT wholesale-replace). `blocks.ts` rebuilt to the design taxonomy (LIBRARY of 10 buildable types, PALETTE derived from LIBRARY, ACTIVITY_PHASE/DEFAULT_MINUTES cover design+legacy, `minutesFor`/`DESIGN_TYPES` added). `visuals.tsx` PHASE_VIS re-keyed to design accents (open=green/explore=blue/decide=amber/close=violet) + new icons (MessageCircle/Coffee/Scale/Vote/SquarePen) + ACT_ICON for new types. `lib/util.ts` ACTIVITY labels cover design+legacy. tsc + build green.
- **Phase 1 — Nav ✅** `Shell.tsx` Workshops group → Workshops/Whiteboards/Run workshop; Templates+Builder dropped as nav items (routes retained, owned by the Workshops landing for active state). Whiteboard icon + placeholder `/workshops/whiteboards` route. Nav E2E updated.
- **Phase 2 — Home ✅** Home tabs are now **Workshops | Templates** (was Workshops/Sessions/Canvas). Templates folds the existing `TemplatesClient` inline (page builds `TemplateVM[]` with usage counts); the inline template gallery + orphaned preview slide-over removed from the workshops tab. Assessment seed-blocks updated to the design taxonomy (checkin/discussion/actions, Open/Explore/Close). Stats strip, grounded recommendation, list/board, and the New-workshop slide-over (with assessment seed preview) retained. tsc + build green.
- _Phase 3…8 appended as each ships._
