# Improving the workshop experience — research & proposal

**Brief.** Make OwnTheAgenda's workshop experience *intuitive to run* end-to-end — the
**builder**, the **live workshop elements** (voting and the rest of the run), and the
**test/assessment engine**. Worked as a trio: a senior engineering team (Claude Code), a
senior UI designer, and a supervisor. We audited the current code, read the prior P1–P10
work, and benchmarked how leading workshop tools solve the same problems.

> **TL;DR.** The product is already *feature-rich* — divergence/convergence, dot-voting,
> impact/effort 2×2, fist-of-five, DACI decisions, pre-work, a shareable readout, a pulse
> engine, and durable charter/manual artifacts all ship today. The gap is **intuitiveness**,
> not capability. We frame the fix around the three moments a leader actually lives through —
> **Build it → Run it live → Measure it** — and propose **three solution tracks** plus a
> recommended sequence. The single highest-leverage move is Track A (a confident builder with
> an AI "draft my agenda" assist), because that is where every competitor has pulled ahead and
> where a self-serve leader either gains or loses confidence before the room even gathers.

---

## 1. Where we are today (grounded in the code)

| Moment | Lives in | Already strong | The intuitiveness gap |
|---|---|---|---|
| **Build** | `app/(app)/workshops/[id]/BuilderClient.tsx`, `actions.ts`, `library/` | 11 activity types, JSON templates, time budget, step preview, objective, schedule | Reorder is up/down buttons only; no duplicate; no AI/quick-draft; assessment binding is a 2nd side-window; thin validation |
| **Run live** | `app/run/[id]/RunClient.tsx` + 12 modules | Realtime, per-participant "what to do now", active timer, keyboard shortcuts, in-run guide, reveal gating | Dense control surface; silent/poll dead-air; no "summon"/attention control; transient vote feedback; a11y + mobile gaps |
| **Measure** | `app/(app)/assessments/*`, `lib/survey.ts`, `lib/assessments.ts` | Data-driven instruments, reverse-scoring, min-3 mask, composite + climate-strength, benchmarks, pre/post pulse delta | No respondent progress / save-draft; live edits mutate open surveys; binary mask; no team trend; print-only export |

The bones are excellent and the security/RLS posture is mature (every new RPC is
`SECURITY DEFINER` + `set search_path=''` + min-3 masking). So this proposal deliberately
**builds on the existing machinery** rather than re-platforming. Almost everything below is
"surface what already exists more clearly" or "add one well-scoped primitive," not a rewrite.

---

## 2. What the market does (and what we should borrow)

| Tool | The thing they're known for | Pattern worth borrowing |
|---|---|---|
| **SessionLab** | The agenda planner | **Drag-drop blocks with auto-recalculated timing**, duplicate-on-Alt-drag, a 1000+ activity library, and an **AI assistant that generates a full timed agenda from a goal** or a rough brief. |
| **Mural** | "Facilitation Superpowers®" | **Summon** (pull everyone's view to the active step), **Take control / follow-me**, **Private Mode** (hide others' input to beat groupthink), timer with an audible end. |
| **Miro** | Workshop canvas | Private mode → reveal for honest input; a "how-to" frame onboarding first-timers; one-click voting sessions. |
| **Mentimeter / Slido** | Dead-simple live interaction | **Zero-friction participant join + voting**; clear "your vote is in" feedback; upvoted Q&A so the room self-prioritizes. |
| **Stormz / Klaxoon** | Decision rigor | **Multi-criteria / weighted decision matrices**, custom scales, and **hidden ratings during voting** to prevent anchoring. |
| **Butter / Howspace** | Run-the-room ergonomics | Agenda pre-loaded with tools, a **hands-up queue**, reactions; async + sync in one space. |

Two clear signals: (1) **AI agenda generation is now table stakes** in the builder; (2) the
live experience is won by **facilitator "superpowers" (attention control + private mode)** and
**ruthless participant clarity**, not by more widgets. We already have the widgets.

---

## 3. The proposal — three tracks

Effort key: **S** ≈ hours · **M** ≈ 1–2 days · **L** ≈ multi-day. Each item names the file(s)
it touches so it's costable.

### Track A · "Confident Builder" — make designing a session feel effortless
*Why first: this is the largest gap vs. the market and it's where a self-serve leader's
confidence is won or lost before anyone joins.*

- **A1 · Drag-drop reorder with live time recalculation.** Replace the up/down `move(i,dir)`
  buttons in `BuilderClient.tsx` with real drag handles; re-sum the time budget as you drag
  (data already in `block.duration`, reorder RPC already exists). *(M, low risk — SessionLab's
  signature.)*
- **A2 · Duplicate a step + a "saved blocks" shelf.** A one-click **Duplicate** on each block
  (clone `activity_type` + `config` + `prompt`), and let a power user pin a configured block to
  reuse across workshops. *(S–M.)*
- **A3 · One unified "Add element" flow that includes assessments.** Today you add a `survey`
  block, save, then open a *second* side-window to bind the actual instrument. Collapse this:
  pick the assessment (and live-vs-prerequisite timing) inline in the same add step via
  `setBlockSurvey`/`ensureBlockSurvey`. *(M.)*
- **A4 · Guardrails, not gates.** Inline validation that doesn't block but warns: a `vote`
  block with 0 options, a 0-minute step, a session whose budget overruns the scheduled window,
  a decision session with no objective. Show as quiet amber hints in the step list. *(S.)*
- **A5 · AI "draft my agenda."** A prompt box — *"Align my leadership team on Q3 priorities,
  90 min"* — that returns a **timed, editable agenda** assembled **from our own template +
  science library** (not generic filler), grounded to the relevant team dynamic and, where the
  team has a weak pulse reading, pre-seeded via the existing `weakestDynamic()` → `RECOMMENDED`
  map. Output is plain `block` rows the leader can then edit — same data path as templates.
  *(L — the strategic differentiator; uses the latest Claude model server-side.)*

### Track B · "Facilitator Superpowers" — make running it live feel calm and in control
*Why: the run is powerful but dense; first-timers face a lot at once and participants still hit
dead air. Borrow Mural's control patterns and Mentimeter's clarity.*

- **B1 · A Now / Next / Room HUD.** One persistent facilitator strip: the current step, the
  next step, the live `readyCount/partCount`, and the timer — so the facilitator never hunts.
  Pure presentation over state already in `RunClient`. *(S–M.)*
- **B2 · "Summon the room" (attention control).** A facilitator button that snaps every
  participant to the active step/board — Mural's most-loved superpower — over the existing
  `session:{id}` realtime channel. Always announce-then-summon (a 2s "bringing you here" toast),
  never yank silently. *(M.)*
- **B3 · Kill the dead air.** (a) Silent brainstorm shows a live *"3 people are writing…"*
  presence pulse so no one thinks they're alone; (b) a persistent **dots-left** badge that
  *disables* the vote action at zero instead of a 1.8s error flash; (c) in poll mode, the
  facilitator gets an explicit **"Seed the options"** empty-state instead of participants
  staring at "waiting for the facilitator." *(S–M; all in `IdeaModule.tsx`.)*
- **B4 · First-run rehearsal + coachmarks.** A **dry-run / preview mode** (run the agenda
  solo, no participants, no writes) and first-time coachmarks layered on the existing
  facilitator guide. Turns "I've never run this" into "I've already done it once." *(M.)*
- **B5 · Accessibility & mobile pass.** `aria-live` on the timer so "time's up" is announced;
  focus-trap the `SideWindow` card detail; keyboard-reachable reactions; touch-friendly
  capture on mobile (the highest-traffic modules first — brainstorm/vote). *(M; raises the
  floor for every session.)*

### Track C · "Decision-grade voting + trustworthy tests" — depth where it pays off
*Why: voting is currently dot + 2×2 only, and the test engine has data-integrity and
reader-clarity gaps that quietly erode trust in the numbers.*

- **C1 · Weighted / $100 voting.** The fast-follow already flagged in P10 — add a vote-weight
  column to `idea_vote` and an "allocate 100 points" mode alongside dot-voting. Feeds the same
  promote-to-task path. *(M.)*
- **C2 · Multi-criteria decision matrix.** Stormz's signature: score options against weighted
  criteria with ratings **hidden until reveal** (we already have reveal-gating + min-N masking).
  A premium convergence tool for real prioritization decisions. *(L — optional/premium.)*
- **C3 · Snapshot instrument definitions at survey open.** Today, editing an
  `assessment_template` while a survey is open desyncs items from already-submitted responses.
  Snapshot the `definition` JSONB onto the `survey` row at open time so a live survey is
  immutable. **This is a correctness fix, not a feature — do it regardless of the rest.** *(M.)*
- **C4 · Respondent ergonomics.** Progress indicator ("Q4 of 9"), **save-draft / resume**, and
  a **sticky scale legend** so "1 = strongly disagree" never scrolls away. Closes the biggest
  drop-off points in `SurveyRespond.tsx`. *(S–M.)*
- **C5 · Authoring clarity.** In `TemplateBuilder.tsx`: client-side definition validation with
  human errors (not SQL codes), a visible **reverse-scored** marker per item with a one-line
  rationale, and a **"test-run"** that lets the author take their own instrument before going
  live. *(M.)*
- **C6 · Reader trust.** Replace the binary mask with **"2 of 3 — one more to reveal"**; add a
  **team longitudinal trend** (re-measure delta over time, not just individual history); offer a
  **CSV/JSON export** beside print. *(M.)*

---

## 4. Recommended sequence

A blended path that front-loads confidence and fixes one correctness issue early:

1. **C3 (snapshot definitions)** — small, but a real data-integrity fix; ship it first. *(M)*
2. **Track A core: A1 + A3 + A4** — the builder is where intuitiveness is won; drag-drop,
   unified add, and guardrails are cheap and felt immediately. *(M each)*
3. **Track B core: B1 + B3** — the HUD and killing dead-air remove the top live-run confusion
   with low risk. *(S–M)*
4. **A5 (AI draft-my-agenda)** — the flagship differentiator; sequence once the builder data
   path is clean. *(L)*
5. **B2 + B4 + B5**, then **C1/C4/C5/C6** — superpowers, rehearsal, a11y, then voting depth and
   test polish. **C2** stays optional/premium.

**Why this order:** items 1–3 are days, not weeks, and each removes a concrete confusion we can
point to in the code. A5 is the bet that changes the product's story from "a powerful tool you
must learn" to "describe your goal and run it." Everything reuses existing tables, RPC patterns,
and the design token set, so the product keeps reading as one piece.

---

## 5. The north-star framing (for the supervisor)

The thread that ties all three tracks together is a **single AI co-facilitator** spanning the
loop the product is already built on — *Assess → Build → Run → Capture → Re-measure*:

- it **drafts** the agenda from a goal and the team's latest pulse (A5),
- it **assists live** — suggesting the next move, flagging dead air, summarizing a brainstorm
  (B-track surface),
- and it **writes the readout** and recommends the follow-up re-measure (existing F1/F5).

None of that requires new science or new data — it's an intelligence layer over machinery that
already exists. That is the defensible, on-brand version of "intuitive to run": the leader
brings the goal; the product brings the method.

---

## Sources

- SessionLab — Session Planner & AI Assistant: https://www.sessionlab.com/features/session-planner/ · https://www.sessionlab.com/features/ai-assistant/ · https://www.sessionlab.com/blog/improved-ai-assistant-in-sessionlab/
- Mural — Facilitation Superpowers (summon, take control, private mode, timer): https://www.mural.co/features/superpowers · https://support.mural.co/s/article/facilitation-superpowers
- Miro — Workshops & meetings (voting, timer, private mode, onboarding frames): https://help.miro.com/hc/en-us/articles/360012753200-Miro-for-workshops-meetings
- Mentimeter vs Slido (live voting & Q&A clarity): https://www.wooclap.com/en/blog/mentimeter-slido-wooclap/
- Stormz — multi-criteria / weighted decision matrix, hidden ratings: https://about.stormz.me/en/blog/article/decision-matrix-multi-criteria-evaluation-turning/
- Butter — agenda + tools + hands-up queue: https://www.butter.us/
- Howspace — async + sync facilitation spaces: https://howspace.com/blog/digital-facilitation-tools/
