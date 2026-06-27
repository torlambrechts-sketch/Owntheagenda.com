# Project Aristotle — Assessment & Intervention Framework

A fully operational, database-driven implementation of Google's **Project
Aristotle** (re:Work) five keys to an effective team, wired end-to-end:
**assess → score → diagnose → generate a tailored workshop → re-measure.**

Everything here is data. No pillar, item, threshold, structural rule, or
workshop phase is hardcoded into UI or application logic — the delivery engine
renders rows, maps responses onto a dynamic schema, and hands raw scores to the
scorer. Adding a pillar, retuning a threshold, or rewording a structural failure
is a row change, not a deploy.

---

## 1. The five pillars (constructs)

| Pillar | Key | What it measures | Sub-areas (construct isolation) |
|---|---|---|---|
| **Psychological Safety** | `psych_safety` | Interpersonal risk-taking without fear | risk_tolerance · candor · error_response · inclusion |
| **Dependability** | `dependability` | Reliable, on-time, quality delivery | follow_through · quality_bar · accountability · mutual_reliance |
| **Structure & Clarity** | `structure_clarity` | Clear roles, goals, decision rights, process | role_clarity · goal_clarity · decision_rights · process_predictability |
| **Meaning** | `meaning` | Personal resonance of the work | personal_resonance · purpose_alignment · growth · recognition |
| **Impact** | `impact` | Belief the work matters and produces results | significance · line_of_sight · efficacy · visible_outcomes |

Order follows Aristotle's empirical importance ranking; psychological safety is
the foundation and carries the **climate-strength** read (dispersion of agreement).

---

## 2. Psychometric contract

Enforced executably by `20260624121500_aristotle_validate.sql` — the migration
**fails loudly** if any rule is violated.

- **Construct isolation.** Every item maps to exactly one pillar and one declared
  sub-area. No double-barreled or ambiguous phrasing.
- **Balance.** Exactly **6 items per pillar** (equal statistical weight); **30 items** total.
- **Acquiescence control.** Exactly **2 reverse-keyed items per pillar** (10 total),
  within the 1–2 contract band. A pillar with zero reverse items fails validation.
- **Scale.** **1–5 Likert** (`Strongly disagree → Strongly agree`). The composite
  engine is scale-agnostic; it normalizes over `[min, max]`, so the scale itself is data.
- **Reverse logic.** A reverse item's mean is reflected across the scale midpoint
  (`flipped = min + max − mean`) *before* it enters its dimension mean — applied
  identically server-side (`private.survey_composite`, now reverse-aware) and
  client-side (`lib/survey.dimensionMeans`).

---

## 3. Architecture (schema-first)

| Concern | Where it lives | Notes |
|---|---|---|
| Instrument (scale, pillars, items) | `assessment_template` row `aristotle_team` (`definition` jsonb) | One row; drops into the existing catalog. |
| Per-pillar report copy | `assessment_trait_copy` | Definition / advantages / risks / recognisable statements. |
| Diagnostic thresholds + structural failures | `diagnostic_rule` | `critical_at` / `trigger_at` / `strong_at` + the specific failure a low score flags. |
| Reusable workshop modules | `intervention_module` | NHH-Smart-Start-style; each `definition.phases[]` is data. |
| Pillar → module map | `dimension_intervention` | The lookup that turns a deficit into a remediation. |
| Scoring | `private.survey_composite` (reverse-aware), `public.survey_results` | Reads the definition; no per-instrument code. |
| Diagnosis + spec generation | `public.aristotle_diagnostic(survey)` | Returns scores, flags, modules, and a generated workshop spec. |
| Materialise the workshop | `public.create_workshop_from_diagnostic(team, survey, title)` | Builds a runnable workshop + blocks from the spec. |
| Client types + helpers | `lib/aristotle.ts`, `lib/survey.ts` (`ARISTOTLE_TEAM`) | Types the RPC payload; presentational only. |

**Decoupling:** the engine never knows what "Project Aristotle" is. It renders
`items`, stores `{item_key: value}` responses, and the scorer reads the same
`definition` to map items → pillars → composite. The Aristotle-specific logic is
confined to three reference tables and two RPCs — all data and queries.

---

## 4. Scoring

1. Per-item mean across respondents (masked below **3** respondents — privacy floor).
2. Reverse items reflected: `min + max − mean`.
3. Per-pillar mean = average of its (corrected) item means → the **1–5 composite index**.
4. Headline composite = equal-weighted mean of pillar means, normalized to **0–100**.

---

## 5. Diagnostic banding & structural failures

Per pillar, on the raw (reverse-corrected) 1–5 mean:

| Band | Condition | Meaning |
|---|---|---|
| `strong` | `mean ≥ strong_at` (3.80) | Healthy |
| `moderate` | `trigger_at ≤ mean < strong_at` | Watch |
| `deficit` | `critical_at ≤ mean < trigger_at` (< 3.20) | **Structural failure flagged** |
| `critical` | `mean < critical_at` (2.40) | **Acute structural failure** |

A flagged pillar emits a **construct-isolated** structural failure — the failure
mode is specific to the deficient construct, never a generic interpersonal-trust
catch-all:

| Pillar | `structural_flag` | Failure label |
|---|---|---|
| Psychological Safety | `PSYCH_SAFETY_VOICE_FAILURE` | Interpersonal risk suppression |
| Dependability | `DEPENDABILITY_FOLLOW_THROUGH_FAILURE` | Execution reliability breakdown |
| Structure & Clarity | `STRUCTURE_ROLE_DEFINITION_FAILURE` | Role-definition & decision-rights failure |
| Meaning | `MEANING_RESONANCE_FAILURE` | Motivational disconnect |
| Impact | `IMPACT_LINE_OF_SIGHT_FAILURE` | Impact line-of-sight failure |

> Worked example: a low **Structure & Clarity** score flags
> `STRUCTURE_ROLE_DEFINITION_FAILURE` and routes to *role/decision-rights*
> remediation — **not** a psychological-safety or trust intervention.

---

## 6. Modular interventions

Each pillar maps (via `dimension_intervention`) to a remediation module:

| Pillar | Module (`intervention_module.key`) | ~Min |
|---|---|---|
| Psychological Safety | `mod_safety_to_speak` | 40 |
| Dependability | `mod_reliable_by_design` | 40 |
| Structure & Clarity | `mod_lanes_and_decisions` | 42 |
| Meaning | `mod_why_this_matters` | 42 |
| Impact | `mod_line_of_sight` | 38 |

`aristotle_diagnostic()` assembles a **tailored workshop spec** from the modules
of *only the flagged pillars*, ordered by severity (critical first), bracketed by
a grounding `assess` opener and a commitment/`outcome` close, with `total_minutes`
summed. Each module is also published as a standalone system `template`, so a
single-pillar remediation can be run on its own from the library.

---

## 7. End-to-end flow

```
send aristotle_team pulse
   → members respond (1–5)               survey_response.scores {item_key: value}
   → close pulse
   → aristotle_diagnostic(survey)        pillar means · bands · structural flags · modules · workshop_spec
   → create_workshop_from_diagnostic()   runnable workshop + blocks, tailored to the deficits
   → run it live → capture commitments
   → re-send the pulse → re-measure the shift
```

---

## 8. Migrations

| File | Adds |
|---|---|
| `20260624120000_survey_composite_reverse_aware.sql` | Reverse-aware server composite (unblocks reverse keys on team instruments). |
| `20260624120500_aristotle_assessment_template.sql` | The `aristotle_team` instrument + per-pillar trait copy. |
| `20260624121000_aristotle_diagnostics_interventions.sql` | `diagnostic_rule`, `intervention_module`, `dimension_intervention` + seeds + the two RPCs + standalone module templates. |
| `20260624121500_aristotle_validate.sql` | Executable psychometric-contract assertions. |

All seeds are idempotent (`where not exists` / `on conflict do nothing`); all
reference tables are RLS-protected, global-readable. The two RPCs are
`security definer`, granted to `authenticated`, revoked from `public`/`anon`,
and gated on `can_read_team` / `can_manage_team`.
