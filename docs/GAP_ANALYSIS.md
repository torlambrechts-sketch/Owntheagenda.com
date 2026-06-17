# OwnTheAgenda — Gap Analysis vs. Workshop Research & Build Playbook

**Author:** Senior engineer + PM review
**Date:** 2026-06-17
**Inputs:** `Strategy, Culture & Values Workshops` research report; `Conscia Workshop Module — Build Playbook`
**Subject:** Current OwnTheAgenda build (Next.js App Router · Supabase Postgres/RLS/Realtime/Auth · Server Actions · plain-CSS Conscia-style design system)

> Method: mapped every capability the two documents call for against what is actually in the repo today (verified against migrations `0001–0018`, run-mode components, and server actions). Status is evidence-based, not aspirational. Sizing is directional T‑shirt (S ≈ ≤2 days, M ≈ 3–8 days, L ≈ 2–4 weeks).

---

## 1. Executive summary

OwnTheAgenda has built a **genuinely strong facilitation surface and a partial outcome loop**, and even ships one differentiator the playbook doesn't describe (assessment‑grounded workshop recommendation). But the research is unambiguous about where this category is won, and that is exactly where we are thinnest.

**Three headlines:**

1. **The wedge is missing.** Both documents say the same thing in different words: the defensible differentiator is *not another whiteboard* — it is a **decision‑and‑accountability layer that defeats "consensus theatre" and links outcomes to execution.** We have the *ingredients* (anonymous fist‑of‑five, an Actions board with owner/due) but **no first‑class Decision object, no decision rights (DACI), no resource note, no "oppose blocks commit" gate, and no decision → action spawning.** Today a session produces sticky notes, votes and loose actions; it does not produce *owned, resourced, accountable decisions*. Closing this is **P0** and — importantly — can be done **natively**, without the external Helm/Cue ecosystem the playbook assumes.

2. **Two engineering debts from a deliberate stack divergence.** We built on Supabase Server Actions + RLS rather than the playbook's tRPC/Prisma/Zod/**Inngest**/**Vitest**. That choice is defensible and leaner, but it left two real gaps the playbook treats as non‑negotiable: **(a) zero automated tests** (no Vitest, no `test` script), and **(b) no background‑job runner** (needed for async reveals, scheduled reminders, PDF export, and to keep AI/email off the request path). Manageable, but must be named and paid down.

3. **A few quick compliance fixes.** The research explicitly flags licensed IP. We currently ship a template literally named **"Five Behaviours"** and a **"Team Health Monitor (Atlassian)"** template — both are exactly the kind of trademarked/proprietary content the playbook bans. Renaming to Conscia‑original equivalents and adding attribution strings is **S effort** and should happen early.

**Overall verdict:** We are roughly a *strong, in‑progress Stage 1* on the playbook's scale — the facilitation core and multi‑tenant security foundation are solid and in places ahead of Stage 1 — but we have **not yet built the anti‑consensus‑theatre / execution‑linkage layer that is the entire strategic point.** Recommendation: pivot the next cycle from "more facilitation features" to **the Decision layer + psychological‑safety mechanics**, which together convert this from "a nice Miro‑lite" into the product the research describes.

---

## 2. Where we are strong (and ahead of the playbook)

Credit where due — these are real assets to build on, not table stakes:

| Capability | State | Note |
|---|---|---|
| **Multi‑tenant foundation** (workspaces, teams/org hierarchy, invites, roles) | ✅ Strong | Fully RLS‑enforced and role‑switch tested. Better than most Stage‑1 MVPs. |
| **Real‑time facilitation modules** (canvas sticky board, brainstorm + dot‑vote, poll, feedback lanes) | ✅ Good | Live via Supabase Realtime; server‑side vote‑budget + anti‑spoof authorship. |
| **Live run mode** (timer, phase stepper, fist‑of‑five agreement, presence/ready) | ✅ Good | The anonymous‑aggregate fist‑of‑five is a research‑backed primitive already in place. |
| **Assessment‑grounded recommendation** (weakest pulse dynamic → recommended framework, pulse‑linked) | ✅ Differentiator | The research treats assessments and frameworks as *separate*; we already bridge them automatically. Not in the playbook — keep and lean into it. |
| **Session readouts & history** | ✅ Good | Durable, auto‑assembled per‑session summary. Richer than the playbook's `WorkshopSummary` default. |
| **Actions board** (capture, owner, due, track to done) | ✅ Good | This is half the "Commit" stage already. |
| **Scheduling + in‑app notifications** | ✅ Shipped | Nudge bell + upcoming surface; ahead of the playbook's Stage‑1 placeholder. |
| **Pulse assessments** (5 team dynamics, target bands, trend, consent, aggregate‑only) | ✅ Good | Close in spirit to the playbook's Team Health Check; aggregates never expose individuals. |
| **RLS security discipline** | ✅ Strong | Every table; SECURITY DEFINER helpers; verified with rolled‑back role tests. |

---

## 3. Capability gap matrix

Legend: ✅ Done · 🟡 Partial · ⛔ Missing

### 3.1 Table‑stakes parity (the playbook's 15 must‑haves)

| # | Must‑have | Status | Evidence / gap |
|---|---|---|---|
| 1 | Infinite/zoomable canvas with frames | 🟡 | Freeform sticky board exists; no zoom/pan/frames. |
| 2 | Sticky notes + shapes/connectors | 🟡 | Sticky notes ✅; shapes/connectors ⛔. |
| 3 | Real‑time multiplayer + presence/cursors | 🟡 | Sync + presence ✅; live cursors ⛔. |
| 4 | Template library + **custom** templates | 🟡 | 15 system templates ✅; custom workshops ✅; **reusable saved org templates ⛔**. |
| 5 | Facilitator timer/countdown | ✅ | Run mode timer + reset/pause. |
| 6 | Voting (dot **+ ranked**) + polling | 🟡 | Dot vote + poll ✅; **ranked‑choice ⛔**. |
| 7 | Facilitator controls (follow/summon, lock, private) | 🟡 | Advance/jump/timer ✅; **follow/summon, lock, presenter ⛔**. |
| 8 | Anonymity / private‑then‑reveal ideation | ⛔ | Only fist‑of‑five + pulses are anonymous. Ideas/feedback/canvas show author and **reveal immediately**. |
| 9 | Comments / threaded discussion | ⛔ | None. |
| 10 | Export (PDF/image/CSV) + shareable links | 🟡 | Member‑only readout link ✅; **export ⛔**. |
| 11 | Integrations (Slack/Teams/Jira/Google/MS) | ⛔ | None. |
| 12 | Guest/external low‑friction access | ⛔ | Participants must be workspace members. |
| 13 | Enterprise security (SSO/SCIM/SOC2/residency) | 🟡 | RLS + `audit_log` + EU region ✅; **SSO/SCIM/SOC2/residency ⛔**. |
| 14 | Async participation | ⛔ | Sync only. |
| 15 | AI assist (clustering + summarisation) | 🟡 | Summarisation ✅ (with fallback); **affinity clustering ⛔**. |

**Score:** ~3 ✅ / 7 🟡 / 5 ⛔. The facilitation core is real; the gaps cluster in *async, guest, export, integrations, and psychological‑safety mechanics.*

### 3.2 The Conscia Loop & anti‑consensus‑theatre gates — **the strategic core**

| Capability | Status | Gap |
|---|---|---|
| Staged spine FRAME→SURFACE→DECIDE→COMMIT→TRACK | 🟡 | Run mode has block phases but no *gated stages* with forward‑only transitions. |
| **Required objective** on session create (anti‑theatre gate) | ⛔ | Workshops have a title only; objective not captured or required. |
| First‑class **Decision** object (rationale, type, status) | ⛔ | No `decision` table at all. |
| **Decision rights / DACI** (Driver, Approver, Contributors, Informed) | ⛔ | No participant‑role/decision model. |
| **Named decider** required before commit | ⛔ | — |
| **Gradients of agreement** bound to a decision (oppose blocks commit) | 🟡 | Fist‑of‑five exists but is per‑block telemetry, **not bound to a decision and does not block anything**. |
| **Resource note** ("what are we stopping/moving to fund this?") | ⛔ | The research's single sharpest anti‑"strategy theatre" prompt — absent. |
| **No orphan actions** (owner + due required) | 🟡 | `action_item` supports owner/due but **does not require them**; `add_action` allows blank owner / null due. |
| Decision → Action linkage | ⛔ | Actions are session/team‑scoped; not spawned from or tied to a decision. |
| **Close‑session gates** (no DRAFT decisions; every committed decision has ≥1 owned+dated action) | ⛔ | `end_session` just flips status; no validation. |

This row is the heart of the analysis. Everything the research cites — Sull's execution gap, "consensus theatre," the 11% resourcing finding, "disagree and commit" — maps to objects we **don't have yet.**

### 3.3 Psychological safety mechanics

| Capability | Status | Gap |
|---|---|---|
| Anonymous aggregate signals (fist‑of‑five, pulse) | ✅ | Already anonymous‑in‑aggregate. |
| **Anonymity toggle** on idea/feedback cards | ⛔ | Authors always shown. |
| **Silent independent ideation → reveal** (brainwrite) | ⛔ | Brainstorm reveals live; loud‑voice dominance not mitigated. |
| Structured turn‑taking | ⛔ | — |
| Min‑N gate before aggregates unlock (anti‑surveillance) | ⛔ | No minimum‑response threshold; small‑N pulses could de‑anonymise. |

These are **cheap and high‑impact** — the #1 predictor of team effectiveness (Edmondson 1999; Project Aristotle) and explicitly low‑effort to add on our existing `idea`/`agreement` tables.

### 3.4 AI

| Capability | Status | Gap |
|---|---|---|
| Session synthesis (themes + draft actions) | 🟡 | Implemented with graceful fallback; one‑click "add to Actions." |
| "AI proposes, human decides" framing | 🟡 | We display + let users add; **no persisted AI_DRAFT → approve → distribute gate.** |
| Affinity clustering of cards | ⛔ | No clustering job. |
| **Surfacing minority/divergent views** | ⛔ | The research's key AI value‑add; our synthesis ranks by votes (majority), not divergence. |
| Assessment narrative → facilitation prompts | ⛔ | — |
| AI region routing / per‑session AI opt‑out | ⛔ | Stage‑3 enterprise concern. |

### 3.5 Execution linkage (the "accountability graph")

| Capability | Status | Gap |
|---|---|---|
| Actions with owner/due, tracked | ✅ | The one node we have. |
| Goals · Issues · **Decisions** · Meetings · KPIs as linked objects | ⛔ | Only Actions exist. **For standalone OwnTheAgenda the win is a *native* Decision→Action→KPI spine, not an external Helm push** — reframe accordingly. |
| Assess → workshop → action soft loop | 🟡 | Grounding recommendation + readout actions give a partial loop; no KPI/decision objects to close it. |

### 3.6 Assessments / instruments

| Capability | Status | Gap |
|---|---|---|
| Team dynamics pulse (5 dynamics, bands, trend, consent) | ✅ | Strong; aggregate‑only. |
| 4‑vector **culture profile** (CVQ‑style) | ⛔ | We measure team dynamics, not a culture‑type profile. |
| **Values → Behaviours operationaliser** | ⛔ | The "values off the posters" builder — absent. |
| Min‑3‑response privacy gate | ⛔ | Not enforced. |
| "Perceptions, not facts" grounding note | 🟡 | Present on run‑mode fist‑of‑five; not consistently on assessments. |

### 3.7 Async, guest, consultant mode, enterprise

| Capability | Status | Gap |
|---|---|---|
| Async activities (open/close windows, deadlines, threads) | ⛔ | — |
| Guest/tokenised join for non‑members | ⛔ | RLS currently assumes membership. |
| Consultant mode / client workspaces / white‑label | ⛔ | — |
| Template marketplace | ⛔ | — |
| SSO / SCIM | ⛔ | — |
| Immutable audit on decision/stage/close | 🟡 | `audit_log` table + `write_audit` exist; not wired to decisions/stages (none exist yet). |
| Data residency + AI opt‑out | 🟡 | EU region ✅; AI routing/opt‑out ⛔. |

### 3.8 Engineering & quality gates (playbook's "non‑negotiable")

| Gate | Status | Gap |
|---|---|---|
| `build` green | ✅ | Clean every phase. |
| `lint` | ✅ | `next lint` in build. |
| **`typecheck` (tsc --noEmit) as its own gate** | 🟡 | Types check during build; no standalone script/CI gate. |
| **`test` (Vitest)** | ⛔ | **No test framework, no tests.** Biggest engineering debt. |
| Background jobs (Inngest‑equivalent) | ⛔ | No runner; AI is synchronous in a Server Action; reminders are created at write‑time only. |
| PDF export pipeline | ⛔ | — |
| RLS everywhere + verified | ✅ | Strong; rolled‑back role tests each phase. |
| Hand‑maintained DB types | 🟡 | Works, but drift risk vs. generated types. |

### 3.9 Licensing / IP (research flags these explicitly)

| Item | Status | Action |
|---|---|---|
| Template **"Five Behaviours"** (`five-beh`) | ⛔ Risk | Five Behaviors® is a licensed Wiley/DiSC product. **Rename** to a Conscia‑original (e.g., "Trust → Accountability Ladder") and reframe content. |
| **"Team Health Monitor" attributed to "Atlassian"** (`health`) | ⛔ Risk | Atlassian's Health Monitor is their content. Rebrand to Conscia THC framing. |
| Other sourced templates (Sailboat/Hohmann, Team Canvas, etc.) | 🟡 | Lower risk (methods), but add Appendix‑C‑style attribution strings to template footers. |
| "Perceptions, not facts" grounding note on instruments | 🟡 | Add consistently (research + playbook both require it). |

---

## 4. Recommended roadmap (prioritised by impact × effort)

Sequenced so the **strategic wedge lands first**, cheap psychological‑safety wins ride alongside, and parity/enterprise follow. Mapped to the playbook's stages but adapted to our actual stack (we are **not** rewriting onto tRPC/Prisma/Inngest — see §5).

### P0 — The Decision & Accountability layer (the wedge) · **L**
*Why first: it is the entire differentiation per both documents, and it is buildable natively today.*
- New `decision` + `decision_contributor` tables (DACI role + per‑contributor agreement level); `action_item.decision_id`.
- Bind a gradient of agreement to each decision; **OPPOSE blocks commit** without facilitator override + written rationale.
- **Required `resource_note`** prompt on every decision; warn on empty at commit.
- A **DECIDE** activity type in run mode + builder; a Decisions panel on the readout; a workspace **Decisions** board (mirrors Actions).
- Gates: required **objective** on workshop/session; commit requires a named decider; **close‑session** validates zero DRAFT decisions and ≥1 owned+dated action per committed decision; make owner+due **required at commit time** (keep quick‑capture elsewhere).
- RLS + rolled‑back role tests for every new policy (our established loop).

### P0/P1 — Psychological‑safety mechanics · **M**
*Cheap, research‑backed, rides on existing `idea`/`agreement` tables.*
- `is_anonymous` on cards; hide authorship in UI + payloads when set.
- **Brainwrite / silent‑then‑reveal**: per‑activity `revealed` flag; RLS so a participant sees only their own cards until the facilitator reveals.
- Min‑N (≥3) response gate before any aggregate unlocks (assessments + agreement summaries).

### P1 — Conscia Loop spine + objective gate · **M**
- `session.stage` (FRAME→SURFACE→DECIDE→COMMIT→TRACK), forward‑only, facilitator‑gated, surfaced as a stage stepper. Wrap the existing blocks/modules inside the stages rather than replacing them.

### P1 — AI upgrades · **M**
- Affinity **clustering** suggestions (facilitator approves — never auto‑commit).
- **Minority/divergent‑view** surfacing in synthesis (not just top votes).
- Persist `AI_DRAFT` summary → facilitator **approve** → mark distributed; keep the deterministic fallback.

### P1 — Quality‑gate paydown · **M (ongoing)**
- Add **Vitest** + a standalone `typecheck` script + CI; unit‑test the decision‑gate logic, agreement math, and min‑N gate; keep the SQL RLS tests. This is what lets a consultant "trust it in front of a C‑suite."

### P1 — Licensing remediation · **S** *(do early — legal risk)*
- Rename "Five Behaviours" and rebrand "Team Health Monitor/Atlassian"; add attribution strings + the "perceptions, not facts" note.

### P2 — Parity fills · **M–L (spread)**
- Ranked‑choice voting · structured impact/effort 2×2 · comments/threads · **save‑as‑template** (reusable org frameworks) · export (CSV → then PDF via a job) · facilitator follow/summon + lock + presenter · live cursors.

### P2 — Async + guest access · **L** *(needs the jobs layer)*
- Async open/close windows + deadlines + threads; tokenised guest join (revisit RLS for non‑members); background auto‑reveal/auto‑close.

### P2 — Native execution spine + instruments · **M–L**
- KPI link on decisions/actions to close the loop natively; 4‑vector culture profile (CVQ‑style); Values→Behaviours builder.

### P3 — Enterprise & ecosystem · **L** *(gate by sales demand)*
- SSO/SCIM; data‑residency AI routing + per‑session AI opt‑out; immutable audit on decision/stage/close; Slack/Teams/Jira; consultant mode + marketplace + delivery reports.

### Quick wins (can slot in immediately, mostly **S**)
- Make action **owner + due required** at commit; add the **resource‑note** field even before full DACI.
- Add the **objective** field to workshop create.
- Min‑N gate on aggregates.
- Licensing rename + attribution strings + grounding note.
- Add a standalone `typecheck` npm script.

---

## 5. Architecture reconciliation (PM note)

The playbook assumes **tRPC · Prisma · Zod · Inngest · Vitest**. We shipped on **Supabase Server Actions + RLS + hand‑maintained types**, with verification via build + rolled‑back SQL role tests. That divergence is **acceptable and should not be reversed** — re‑platforming a working app would burn weeks for little user value. But we should adopt the *spirit* of the gates with compensating controls:

- **Validation:** keep explicit input validation in Server Actions (our manual checks ≈ the playbook's Zod gate); consider a shared validation helper.
- **Tests:** adopt **Vitest** for pure logic (decision gates, agreement math, synthesis fallback) — this is the one playbook gate we genuinely lack.
- **Jobs:** introduce a lightweight runner (Supabase `pg_cron` + Edge Functions, or a queue) **when P2 lands** (async reveals, scheduled reminders, PDF export, off‑request AI). Until then, Server Actions + the in‑app `notification` model suffice.
- **Decision objects, not "decisions in prose":** mirror the playbook's data model (`WorkshopDecision`/`DecisionContributor`) as Supabase tables so the anti‑theatre gates are enforced in SQL, not just UI.

**Reframing the "execution linkage" wedge for a standalone product:** the playbook pushes decisions/actions into an external **Helm** accountability graph and **Cue** coaching engine. OwnTheAgenda has no such ecosystem — so the equivalent value is a **native** Decision→Action→KPI spine plus the existing Actions board and assess→recommend loop. We can deliver ~80% of the wedge's *value* without building Helm; the external pushes (Slack/Jira/Helm) become Stage‑3 connectors, not prerequisites.

---

## 6. One‑line bottom line

We've built a credible facilitation surface with a strong security foundation and a unique assess→recommend bridge — but to become the product the research describes, the next cycle must shift from *"more whiteboard"* to **the Decision‑and‑accountability layer + psychological‑safety mechanics that turn a workshop into owned, resourced, tracked commitments.**
