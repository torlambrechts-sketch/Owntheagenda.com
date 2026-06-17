# Implementing NHH's "Start Smart" in OwnTheAgenda

**Brief:** Implement the *Start Smart* team start-up framework (Schei & Sverdrup, NHH) —
deciding what to reuse, extend, or build — and design the flow, template, and a phased
implementation plan. Worked as a trio: senior engineer, team-effectiveness consultant,
organisational psychologist.

---

## 1. What Start Smart actually is (grounded)

Start Smart is a research-based **team charter** process from NHH, built on ~10 years of
research by Vidar Schei and Therese E. Sverdrup. A team works through three questions —
**"What do we want to achieve? Who are we? How should we work together?"** — across six
components, producing a **living team contract** (not a drawer document). It exists today as
downloadable **Mural** canvases (full ~3h, short ~1.5h) plus a separate **Follow-Up** tool.

The six components:

| # | Component | Question | Notes |
|---|---|---|---|
| 1 | **Personal user manual** | How do I work / how to get the best from me | Designed for 6 (2–12). Research flags this as the element that *"generates the most energy"*. Recommended **first** to warm the room. |
| 2 | **Purpose** | Why do we exist? | One overarching statement. |
| 3 | **Goals** | What, by when? | SMART goals. |
| 4 | **Roles & responsibilities** | Who covers which function? | Formal position vs team role; surface gaps/overlaps. |
| 5 | **Work methods** | How do we organise? | Meetings, comms, tools, decisions. |
| 6 | **Collaboration norms** | How do we behave — especially when it's hard? | Norms + expectations. |

Three findings that *drive the design*:
- **Follow-up is the single biggest determinant of lasting impact.** A kickoff alone fades.
- The charter must be an **active working tool** — revisited, tied to behaviour.
- Research caveat: *"agreeing in the workshop is not the same as practising it."* Psychological
  safety is **dynamic** — the contract gives shared language and reduces ambiguity but does not
  remove the felt social risk of dissent.

> **Why this is a fit, and where we beat Mural:** Mural gives a static canvas. Our edge is the
> *back half* of the framework — a durable charter + owned/dated commitments + reminders +
> a pre/post pulse — which is exactly the "follow-up = #1 success factor" that a whiteboard
> can't do. Start Smart is, in effect, a spec for the product we already are.

---

## 2. The working session (three voices)

**Engineer — "reuse the machinery, build only the durable artifacts."**
Our run-mode already has divergence (`brainstorm`), convergence (`vote`), lanes
(`feedback`), open talk (`discuss`/`checkin`), commitment capture (`outcome`), block-level
gradient-of-agreement (`submit_agreement`/`agreement_summary`), decisions + DACI, actions,
reminders, and a pulse engine. ~70% of Start Smart is those primitives re-sequenced. I do
**not** want six new modules. The genuinely new thing is **persistence**: Start Smart's whole
thesis is that the *output is a living document*. Our sessions are ephemeral; the charter and
the personal user manual must be **durable, per-team / per-person artifacts**. Build those two;
reuse the rest.

**Consultant — "fidelity lives in the follow-up and the measurement, not the sticky notes."**
Agree. Two non-negotiables for fidelity: (1) the charter is revisitable and drives a scheduled
**Follow-Up** session — that's the #1 efficacy lever; (2) we **measure**. Link a `pulse`
pre-session and again at follow-up across the five dynamics (role clarity, psych safety,
decision rights, conflict norms, trust) — Start Smart moves all five. That turns a feel-good
kickoff into a quantified intervention, which is the ROI story leaders buy. Also: keep the
**personal user manual first** (the research is explicit), and cap norms to the *vital few*.

**Psychologist — "safety is built by the manual and protected by how we run norms."**
The personal user manual is the safety engine — but only if we get the conditions right:
- Keep it about **work** ("how to give me feedback", "what drains me", "how I communicate"),
  **not** therapy. Every field optional, explicit **"pass"**, and **leader goes first** (modelling).
- Allow **async prep** before the live round — protects introverts / non-native speakers and
  reduces on-the-spot disclosure pressure. Do **not** anonymise it (the point is mutual knowing).
- **Norms**: write **silently first** (we have `silent` brainwrite) to defeat anchoring/HiPPO
  conformity, then a **fist-of-five commit** (we have this) so we surface real commitment vs polite
  nodding. That directly answers the "agreeing ≠ practising" caveat.
- Because safety is *dynamic*, one session is insufficient by design — the **follow-up loop is
  clinical, not gold-plating**. Re-rate norms ("are we living it?") and re-pulse.

**Convergence:** reuse all activity modules; build two durable artifacts (**Personal User
Manual**, **Team Charter**); lean on our existing accountability + pulse spine for the
follow-up/measurement that makes Start Smart *work*.

---

## 3. Reuse vs. extend vs. build

| Start Smart component | Existing capability | Verdict |
|---|---|---|
| Personal user manual | nothing durable; `feedback` lanes are close but scatter one person across columns and aren't durable | **BUILD** — `user_manual` durable artifact + `manual` module (signature element; reusable beyond Start Smart) |
| Purpose | `discuss` + capture | **REUSE** discuss; capture into charter |
| Goals | `brainstorm` (+ `vote`) → owned/dated `action_item`s | **REUSE** |
| Roles & responsibilities | `team_member.role_title` exists; `decision_rights` dynamic | **EXTEND** lightly — capture into charter `roles` (person → responsibilities); no new module |
| Work methods | `feedback` with lanes (Meetings / Comms / Tools / Decisions) | **REUSE** |
| Collaboration norms | `brainstorm` `silent` + block `submit_agreement` (fist-of-five) | **REUSE** (silent → vote → commit) |
| **The charter (output)** | `workshop.objective` is per-workshop only; nothing durable per **team** | **BUILD** — `team_charter` (durable, revisitable, "active working tool") |
| Follow-up | reminders + actions + scheduling (just shipped) | **REUSE** + a Follow-Up template |
| Assessment / measurement | `pulse` / `pulse_response` / `team_dynamics` + `workshop.pulse_id` + reminders | **REUSE + EXTEND** — a new `assess` block runs the pulse **live or as a scheduled prerequisite** (same data, min-3 mask, pre/post delta) |

**Net new build:** two durable tables + two run modules + two enum values + three seed
templates + a charter readout on the team page. Everything else is configuration and re-sequencing.

---

## 4. The flow (full, ~3h — starts with the user manual)

| Ord | Phase | Module | Min | Dynamic | What happens |
|----|---|---|----|---|---|
| 0 | **Team assessment** | `assess` *(new)* | —/15 | all 5 | Rate the five dynamics. **Two timings (facilitator's choice):** *Prerequisite* — scheduled upfront, members respond async (reminders), results carried in; or *Live* — a ~15-min in-session block. Either way it grounds purpose/roles/norms and seeds the pre/post delta. |
| 1 | **Personal user manual** | `manual` *(new)* | 35 | psych_safety | Leader first. Each person fills/shares strengths, working style, feedback prefs, watch-outs. Async prep allowed; "pass" allowed; attributed. |
| 2 | **Purpose** | `discuss` | 25 | role_clarity | Converge on one sentence: why we exist. → charter.purpose |
| 3 | **Goals** | `brainstorm` | 30 | role_clarity | Propose SMART goals, dot-vote the vital few. → charter.goals (→ owned/dated actions) |
| 4 | **Roles & responsibilities** | `charter` *(new)* | 30 | decision_rights | Map functions→owners; name gaps/overlaps. → charter.roles |
| 5 | **How we work** | `feedback` | 20 | role_clarity | Lanes: Meetings / Communication / Tools / Decisions. → charter.work_methods |
| 6 | **Collaboration norms** | `brainstorm` (silent) + commit | 30 | conflict_norms | Write privately → vote → **fist-of-five commit**. → charter.norms |
| 7 | **Charter & commitments** | `charter` *(new)* | 20 | decision_rights | Review assembled charter; turn first moves into owned, dated commitments; schedule the follow-up. |

**Short (~90m):** manual (25) → purpose (15) → goals (20) → norms silent+commit (20) →
charter (10). (Roles + work methods folded into the charter review.)

**Follow-Up (~45–60m, scheduled ~6–8 weeks out):** checkin (5) → charter review: what's
working / not (20) → **re-pulse** the five dynamics (10) → norm health fist-of-five "are we
living it?" (10) → adjust charter + new commitments (10). *This loop is the efficacy engine.*

---

## 5. The template (data, not code)

Expressed in our existing `template.definition` → `phases[]` shape. New, additive `config`
conventions: `capture` (which charter section a step feeds), `commit` (run a block
fist-of-five), `section`/`spawnActions`/`scheduleFollowUp` (charter module behaviour),
`fields`/`allowPass`/`leaderFirst` (manual module).

```json
{
  "meta": { "framework": "Start Smart (NHH)", "variant": "full", "charter": true },
  "phases": [
    { "title": "Personal user manual", "type": "manual", "minutes": 35, "dynamic": "psych_safety",
      "prompt": "How do you work best, and how can we get the best from you? Share your strengths, what drains you, and how you like to receive feedback. Pass on anything you'd rather not.",
      "config": { "fields": ["strengths","working_style","feedback_pref","watch_outs"], "allowPass": true, "leaderFirst": true } },

    { "title": "Purpose — why we exist", "type": "discuss", "minutes": 25, "dynamic": "role_clarity",
      "prompt": "In one sentence: why does this team exist? What is different because we are here?",
      "config": { "capture": "purpose" } },

    { "title": "Goals — what, by when", "type": "brainstorm", "minutes": 30, "dynamic": "role_clarity",
      "prompt": "What must we achieve, and by when? Propose SMART goals; we'll prioritise the vital few.",
      "config": { "budget": 3, "capture": "goals" } },

    { "title": "Roles & responsibilities", "type": "charter", "minutes": 30, "dynamic": "decision_rights",
      "prompt": "Which functions must be covered to hit those goals — and who owns each? Name the gaps and overlaps.",
      "config": { "section": "roles" } },

    { "title": "How we work", "type": "feedback", "minutes": 20, "dynamic": "role_clarity",
      "prompt": "Agree the practical mechanics of working together.",
      "config": { "lanes": ["Meetings","Communication","Tools","Decisions"], "capture": "work_methods" } },

    { "title": "Collaboration norms", "type": "brainstorm", "minutes": 30, "dynamic": "conflict_norms",
      "prompt": "How do we want to behave together — especially when it's hard? Write privately first; then we vote and commit.",
      "config": { "budget": 3, "silent": true, "commit": true, "capture": "norms" } },

    { "title": "Charter & commitments", "type": "charter", "minutes": 20, "dynamic": "decision_rights",
      "prompt": "Review our charter. Turn the first moves into owned, dated commitments and schedule our follow-up.",
      "config": { "section": "review", "spawnActions": true, "scheduleFollowUp": true } }
  ]
}
```

The **charter review step does the aggregation** — it reads the raw outputs of prior blocks
(purpose discuss note, goal/norm idea cards, work-method lanes) and the facilitator curates
them into the durable `team_charter`. This avoids adding a write-path to every module.

---

## 6. Data model (the only genuinely new surface)

**`team_charter`** — one living charter per team:
```
team_id (unique) · workspace_id · purpose text
goals jsonb[]        -- [{ text, owner_id, due, metric }]
roles jsonb[]        -- [{ user_id, title, responsibilities }]
work_methods jsonb   -- { meetings, communication, tools, decisions }
norms jsonb[]        -- [{ text, commitment_avg }]
status (draft|active) · source_session_id · compiled_by · compiled_at · updated_at
```
RLS: workspace members **read**; team lead / admin **write** via SECURITY DEFINER RPCs
(`save_charter_section`, `compile_charter`). Mirrors the existing decisions pattern.

**`user_manual`** — durable, per person per workspace (a working-style mini-profile):
```
user_id · workspace_id  (pk)
strengths · working_style · communication_pref · feedback_pref · watch_outs · energizers (text, all optional)
updated_at
```
RLS: workspace members **read**; owner **writes own row** (`upsert_user_manual`). Authoring it
*is* the consent to share. Reusable anywhere we show "how to work with this person".

**Enum additions:** `activity_type` += `manual`, `charter`, `assess`.

**Assessment timing — live or prerequisite.** A workshop's grounding assessment is always a
`pulse` linked via `workshop.pulse_id`; the only difference is *when responses are collected*,
carried on the `assess` block's `config.timing`:
- `"prerequisite"` — at setup we provision + open the pulse, link it, and notify members; they
  respond async on the **reminder loop**. The in-session `assess` block shows the already-collected
  aggregates (read-only) + a participation nudge for stragglers. This is the "pre" of the pre/post delta.
- `"live"` — when the session reaches the block, the pulse opens and participants rate the five
  dynamics in the room; the aggregate renders live (min-3 anonymity mask applies).

Helper `ensure_workshop_pulse(p_workshop, p_timing)` creates/links the pulse on demand; everything
downstream (`team_dynamics`, recommendations, follow-up re-rate) is timing-agnostic.

---

## 7. Implementation plan (phased, each verified to the house cadence)

> Cadence per phase: write migration → `apply_migration` → `get_advisors(security)` →
> rolled-back, role-switched RLS tests → `typecheck`/`test`/`build` → commit → merge to main.

**Phase 1 — Durable artifacts (DB).** `user_manual` + `team_charter` tables, RLS, RPCs
(`upsert_user_manual`, `save_charter_section`, `compile_charter`), enum values `manual`/`charter`/`assess`,
hand-maintained types. *Verify:* advisors clean; role test proves member-read / owner-only manual
write / lead-only charter compile / tenant isolation.

**Phase 2 — Personal User Manual module.** Run component (fill mine, see teammates', "pass",
leader-first banner, async-prep entry point), builder config (`fields`), readout. *Verify:*
typecheck/build; pure field logic unit-tested.

**Phase 3 — Team Charter module.** Charter review/compile step (aggregate prior blocks → curate
sections → set team purpose → spawn **owned + dated** commitments → schedule follow-up), plus a
durable **charter readout on the team page**. *Verify:* no-orphan-commitment gate; typecheck/build.

**Phase 4 — Dual-mode assessment.** New `assess` run module (live rating + read-only
prerequisite view with participation), `ensure_workshop_pulse` helper, and a "schedule
assessment upfront" setup flow (provision/open/link pulse + reminders). *Verify:* both timings
on seed data (live submit; prerequisite carried-in); min-3 mask holds; rolled-back role test.

**Phase 5 — Templates as data.** Seed *Start Smart (full ~3h)*, *Start Smart (short ~90m)*,
*Start Smart Follow-Up* under category `kickoff`, wiring the `assess` phase's `config.timing`,
`linked_dynamic` anchoring, and honest attribution. *Verify:* `create_workshop_from_template`
yields the right blocks (rolled-back); run-mode smoke path.

**Phase 6 — Follow-up loop & measurement.** Follow-up scheduling at compile, pre/post dynamics
**delta** surfaced on the charter readout, reminders (reuse). *Verify:* end-to-end on seed data.

**Phase 7 — External review + design pass + quality gate + merge.** House close-out.

Phases 1–5 deliver a runnable Start Smart; 6–7 complete the efficacy loop and polish.

---

## 8. Decisions & risks to confirm

1. **Attribution / IP (recommend: "grounded in").** Start Smart is a free, research-based NHH
   resource. We implement the *approach* and **author our own prompts** (we neither have nor
   copy their Mural text), attributing it like our other templates — *"Grounded in NHH's Start
   Smart research (Schei & Sverdrup)"* with a link. We do not imply endorsement.
2. **User-manual visibility (recommend: workspace-readable, owner-edit, every field optional +
   pass).** Alternative: restrict to same-team only. Trade-off is reuse vs. tighter privacy.
3. **Goals as first-class actions (recommend: yes).** SMART goals are time-bound → they become
   owned/dated `action_item`s and ride the reminder loop, rather than living only in the charter.
4. **Scope/sequencing.** Full build (manual + charter + follow-up + measurement) vs. a lean MVP
   (charter + reuse existing modules; defer the new manual module and measurement).

---

## Sources
- NHH — Start Smart project: https://www.nhh.no/en/research-projects-and-groups/start-smart/
- NHH — Start Smart: Research becomes practice: https://www.nhh.no/en/research/impact-cases/start-smart-research-becomes-practice/
- NHH — How to build high-performing teams: https://www.nhh.no/en/research-centres/digital-innovation-for-growth/dig-news-and-blogs/2021/how-to-build-high-performing-teams/
- NHH — A dynamic perspective on team psychological safety (2023): https://www.nhh.no/en/nhh-bulletin/article-archive/2023/june/a-dynamic-perspective-on-team-psychological-safety/
- Schei & Sverdrup, *Start smart: Effektiv oppstart av team* (NHH Brage): https://openaccess.nhh.no/nhh-xmlui/handle/11250/2774845
