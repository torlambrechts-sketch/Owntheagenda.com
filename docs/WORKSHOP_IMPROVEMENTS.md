# Workshop module — improvement analysis

Context: the workshop module = the **builder** (`/workshops/[id]`, BuilderClient — steps/blocks
with activity type, duration, prompt, linked dynamic, config) and the **live run**
(`/run/[id]`, RunClient + modules: CanvasBoard, IdeaModule, Survey/Assess/Charter/Manual,
PlanBoard, DecisionsPanel). Facilitator-driven, realtime, with a right rail for Fist-of-Five
agreement, Commitments (`action_item` via `add_action`), Decisions, and presence/readiness.

Shipped today: editable cards + detail, dot-vote → **promote to task**, **Promote top 3**, and
carrying the card author onto the task as owner.

Effort key: **S** ≈ hours · **M** ≈ 1–2 days · **L** ≈ multi-day.

---

## A. Usability improvements (polish existing flows)

### U1 · Tell each participant *what to do now* (and let readiness drive advance)
- **Problem.** The run is facilitator-paced, but a participant can't tell whether to act or wait.
  This is exactly what caused "there's nowhere to enter details." The reflection hint helps, but
  there's no per-person status.
- **Value.** Removes the single biggest source of participant confusion; cuts dead air; makes
  remote runs flow without verbal hand-holding.
- **Approach.** A per-participant status chip on the stage: *"Add your cards"* / *"Vote — 3 dots"*
  / *"Reflecting — tap I'm ready"* / *"Waiting for the facilitator,"* derived from block type +
  reveal state + their `ready`. For the facilitator, when `readyCount === partCount` show a
  prominent **"Everyone's ready — Next ▸"** affordance (we already track `set_ready`/presence).
- **Effort.** S–M. **Risk.** Low; pure presentation over existing state.

### U2 · Make the timer active (time-up state + gentle cue + soft auto-advance prompt)
- **Problem.** The timer counts to 0:00 and nothing happens — no signal, no nudge. The facilitator
  must watch the clock; participants feel no urgency.
- **Value.** Keeps sessions on schedule (a core promise of "run it yourself"); adds polish.
- **Approach.** At `remaining === 0`, flash the timer/stage to a "time's up" state, optional soft
  chime (respect reduced-motion/audio), and surface a facilitator prompt *"Time's up — advance or
  +2 min?"*. Optional per-block "auto-advance on time-up" toggle in the builder.
- **Effort.** S. **Risk.** Low; keep auto-advance opt-in so it never yanks a live room.

### U3 · Faster card capture (multiline paste → N cards, keep focus, "added" feedback)
- **Problem.** Brainstorm is one input + Enter. Pasting a list makes one card; there's no clear
  "it worked" beat; mobile tap targets are small.
- **Value.** Lowers friction in the highest-traffic module; supports the common "I prepped a list"
  behavior; better on phones.
- **Approach.** Split pasted/`\n`-separated text into multiple `idea` inserts; keep input focused
  after add with a brief highlight on the new card; larger touch targets; surface the Anonymous
  toggle more clearly. All client-side over the existing `idea` insert path.
- **Effort.** S. **Risk.** Low; guard against accidental bulk inserts (confirm if >N lines).

### U4 · Builder preview + time budget + clearer reordering
- **Problem.** The builder lists steps but you can't see a step the way participants will, there's
  no total-duration readout, and reorder affordance is subtle — so timing/structure errors surface
  live.
- **Value.** Fewer "this step was wrong" moments mid-session; confidence before running; respects
  the "leader as operator" positioning.
- **Approach.** A read-only **preview** of each block (reuse the run module in a non-interactive
  mode), a **summed duration** + "runs ~X min" header, and explicit drag handles. The data is all
  in `block` rows already.
- **Effort.** M. **Risk.** Low–medium (preview must mirror run rendering without writing data).

### U5 · Facilitator shortcuts + an in-run guide
- **Problem.** The run is dense and the facilitator drives everything with the mouse; first-timers
  face a lot at once.
- **Value.** Speed for power users; confidence for new facilitators; supports self-serve runs.
- **Approach.** Keyboard shortcuts (← → step, space start/pause timer, R reveal, E everyone-ready
  advance) and a collapsible "Facilitator guide" panel / first-run coachmarks that link to the new
  Help guides. Pure client + the existing Help content.
- **Effort.** S–M. **Risk.** Low; ensure shortcuts don't fire while typing in inputs.

---

## B. High-value feature adds

### F1 · Auto-generated, shareable post-session readout
- **Problem.** A session produces decisions, commitments, voted ideas and agreement scores, but
  there's no single artifact that proves "it worked" and gets shared afterward. `session_summary`
  exists but isn't a polished, distributable readout.
- **Value.** Closes the product's core loop (*Assess → Run → Capture → prove it*); the thing people
  forward to their boss; a retention/again-trigger.
- **Approach.** Compile a readout from existing data: decisions (`decision`), owned commitments
  (`action_item`), top-voted `idea`s per block, Fist-of-Five aggregate, and any linked dynamic. A
  clean read page + **share link** + export (PDF/markdown) + optional **post to Slack/webhook**
  (the integrations framework already exists). Editable before publishing (`session_summary`
  `approved_by`).
- **Effort.** M–L. **Risk.** Privacy (respect anonymity in aggregates; honor data-region/retention).

### F2 · Real action-item follow-through (assign to members, due dates, reminders)
- **Problem.** Commitments capture free-text owners only. `action_item` already has `owner_id`,
  `due_at`, `team_id`, `status` — they're just not surfaced in the run, so accountability leaks.
- **Value.** Turns talk into tracked follow-through — the differentiator vs. a whiteboard. Feeds the
  existing **Actions** page and notifications.
- **Approach.** In the Commitments rail (and on promote-to-task), let the facilitator pick a real
  member for `owner_id` and set `due_at`; default `owner_id` from the promoted card's author. Wire
  `notification` reminders (the schema + REMINDERS.md exist) at due time. Everything flows to
  `/actions` automatically.
- **Effort.** M. **Risk.** Low; mostly surfacing columns that already exist + a reminder job.

### F3 · Prioritization beyond dot-voting (impact/effort 2×2, weighted / $100)
- **Problem.** Voting is single-mode dot voting. The "select outputs" step is blunt for real
  prioritization, and we just shipped the *science* of prioritization (impact/effort, RICE/WSJF).
- **Value.** Richer, defensible prioritization → better outputs; differentiated facilitation;
  on-brand with the science library (a "Learn the science" link already points here).
- **Approach.** Add vote modes to the idea/poll module: **impact×effort 2×2** (drag cards onto a
  grid; store coordinates on `idea`), and **weighted/$100** (allocate points instead of dots). Top
  quadrant / top-allocated cards feed the same promote-to-task path.
- **Effort.** M–L. **Risk.** Medium (new interactions; keep dot-voting the simple default).

### F4 · Pre-work / async collection before the live session
- **Problem.** Live time gets spent on solo generation. Surveys already support `timing: pre|live`;
  brainstorm/check-in don't.
- **Value.** Shorter, higher-quality live sessions (independent generation beats group brainstorm —
  it's in the science content); accommodates timezones; raises participation.
- **Approach.** Let a brainstorm/check-in block be flagged **pre-work**; participants submit via the
  invite/join link before the session into the same `idea` rows; the facilitator reviews and the
  live run opens with cards already present. Reuses the capture-check-in groundwork shipped today.
- **Effort.** M–L. **Risk.** Medium (a pre-session participant surface + access scoping).

### F5 · Close the measurement loop — pre/post pulse on the session's dynamic
- **Problem.** A block can be *linked to a team dynamic*, but a session doesn't measure whether it
  moved the number. The platform's whole thesis is "re-measure."
- **Value.** Proof of impact per session; ties workshops to Health trends; the strongest retention
  and expansion story.
- **Approach.** For a session whose blocks link a dynamic, offer a 1-question **pre** check at the
  start and a **post** check at the end (reuse pulse/`team_dynamics`), then show the **delta** in the
  readout (F1) and on the team's Health. Mostly composition of existing assessment infra.
- **Effort.** L. **Risk.** Medium (anonymity with small N; don't over-survey — cap to one dynamic).

---

## Suggested sequence
1. **U1 + U2** (kill the confusion, make timing active) — cheap, high daily impact.
2. **F2** (follow-through) — unlocks accountability with columns that already exist.
3. **F1** (readout) — the shareable proof artifact.
4. **U3 / U4 / U5** polish in parallel.
5. **F3 / F4 / F5** — bigger bets; F5 is the strongest strategic differentiator.
