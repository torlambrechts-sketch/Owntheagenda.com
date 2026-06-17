# Psychological Safety for Leadership Teams (Henning Bang)

A research-based assessment + workshop for high-performing leadership groups,
grounded in Henning Bang & Thomas Nesset Midelfart's model of effective
management teams, Amy Edmondson's psychological-safety construct, and Fyhn,
Bang, Egeland & Schei (2023) on psychological-safety **climate strength**.

## The framework (what we built to)

Bang's research-based chain for management teams:

> **Psychological safety → behavioral integration → team effectiveness**

and the distinctive Fyhn/Bang finding: it's not only the *level* of safety that
predicts performance, but the **climate strength** — how much the team *agrees*
on how safe it is. A split climate (some feel safe, some don't) is itself a
signal worth surfacing.

**The instrument** (9 items, 7-point Likert — our wording of the validated scales):
- **Psychological safety (4):** easy to raise tough issues · safe to take a risk ·
  safe to speak your mind · room to express uncertainty.
- **Behavioral integration (5):** mutual responsibility for decisions · understand
  each other's needs · help solve problems · share information · share resources.

## What we shipped

**A multi-item survey subsystem** (`survey` + `survey_response`):
- Individual answers are private (RLS: own-response only). Aggregates come from a
  SECURITY DEFINER `survey_results` RPC that returns per-item means + a
  **climate-strength dispersion** (SD over the safety items), behind the **min-3
  anonymity mask**.
- `lib/survey.ts` holds the instrument + pure helpers (`dimensionMeans`,
  `climateStrength` → aligned / mixed / split, `strengthItemKeys`), unit-tested.

**Dual-mode delivery** (your requirement, mirrored from the team-dynamics assess):
- **Live** — a `survey` run-block opened in the room; everyone answers, results
  appear live (per-dimension means + climate-strength chip).
- **Prerequisite** — opened ahead; members are notified and answer async on
  `/assessments`; results are carried into the session. `workshop.survey_id`
  links it, propagated live via realtime.

**The workshop** — *Psychological Safety — Leadership Teams (Bang)* (~2h):
1. Survey (live or prerequisite)
2. Read the results together — especially the **climate gap**
3. What makes it hard to speak up? (silent brainwrite)
4. Behaviours that build safety (Start / Disagree / Fail lanes)
5. Agree 3–5 **safety norms → captured in the team charter**
6. Commit (leaders first) + schedule a **re-measure**

Plus *Psychological Safety — Re-measure (Bang)* (~45m) to see the shift.

**Readouts:** the team page shows the latest psychological-safety reading
(per-dimension + climate-strength chip) next to the charter and dynamics.

## How to run it
- Build *Psychological Safety — Leadership Teams (Bang)* from the Workshops
  library. Default is **prerequisite**: open it, members get a notification and
  answer on `/assessments`; results ground the session. Switch the first block's
  `config.timing` to `live` to rate in the room instead.

## Verification
- **DB:** 8-assertion rolled-back role test — creation gated (member blocked
  42501); 3-respondent aggregate + climate-strength SD correct; min-3 mask;
  anonymity (members see only their own response); outsiders blocked; RPCs
  anon-revoked. Template build verified (6 blocks, config preserved).
- **Gate:** lint / typecheck / 36 tests / build green. Security audit clean (no
  RLS-disabled tables; every SECURITY DEFINER function pins `search_path`).

## Attribution & limits
Items are our own wording of the research-validated scales; attributed to Bang &
Midelfart, Edmondson (1999), and Fyhn et al. (2023) — not an endorsement.
Anonymity masks aggregates below 3 respondents; `respondent_id` is retained for
upsert + own-edit (not exposed to others). Climate strength is computed over the
psychological-safety items (the dimension the research ties to performance).

## Sources
- Bang & Midelfart, *What characterizes effective management teams? A research-based approach* (2017): https://www.bangmidelfart.no/wp-content/uploads/2019/11/Bang-Midelfart-2017-What-characterizes-effective-management-teams-1.pdf
- *The Relationship between Psychological Safety and Management Team Effectiveness: The Mediating Role of Behavioral Integration*: https://pmc.ncbi.nlm.nih.gov/articles/PMC9819141/
- Fyhn, Bang, Egeland & Schei, *Safe Among the Unsafe: Psychological Safety Climate Strength Matters* (2023): https://journals.sagepub.com/doi/abs/10.1177/10464964221121273
- Bang & Midelfart, *Effective Management Teams and Organizational Behavior* (Routledge): https://www.routledge.com/Effective-Management-Teams-and-Organizational-Behavior-A-Research-Based/Bang-Midelfart/p/book/9780367486730
