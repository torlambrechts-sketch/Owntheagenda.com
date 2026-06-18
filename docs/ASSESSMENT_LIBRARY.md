# Assessment Library

A data-driven catalog of research-grounded instruments — for **teams** (an
anonymous group read) and **individuals** (a private self-assessment you can
choose to share). Instruments are rows, not code: add a row and it shows up in
the picker, the library and every survey surface, with no deploy.

## Data model

**`assessment_template`** — the catalog.
- `workspace_id` — `null` for a global (built-in) instrument; set for a
  workspace-custom one.
- `key` — stable identifier (`psych_safety_bang`, `working_style`, …). Unique
  among globals.
- `category` — grouping (`psych_safety`, `team_effectiveness`, `team_learning`,
  `personality`).
- `scope` — `team` or `individual`.
- `definition` (jsonb) — the instrument itself: `scale`, `dimensions[]`,
  `items[]`, optional `strengthDimension`. Mirrors the `SurveyInstrument` shape
  in `lib/survey.ts`.
- **RLS:** readable when global (`workspace_id is null`) or you're a member of
  its workspace.

**`individual_response`** — one private row per `(workspace, user, instrument)`.
- `scores` (jsonb), `shared` (boolean, default false).
- **RLS:** your own rows always; a teammate's row only when `shared` and you
  share a live team (`private.shares_team`). Writes go through SECURITY DEFINER
  RPCs (`submit_individual_response`, `set_individual_shared`), anon-revoked.

Team responses keep using `survey` + `survey_response` (the min-3 anonymity mask
+ climate strength). Individual responses are **not** masked — they're personal
and shared only by explicit opt-in.

## How resolution works (data-driven)

`lib/assessments.ts` (server) reads `assessment_template` and turns rows into
`SurveyInstrument`s via `instrumentFromRow` (`lib/survey.ts`, pure + unit
tested). The built-in `INSTRUMENTS` map is kept **only as a fallback** so a
momentary read blip never blanks a live survey.

- **Run / respond surfaces** (`SurveyModule`, `SurveyRespond`) take a resolved
  `instrument` prop — no hardcoded lookup.
- **Pickers / library** list templates straight from the DB; a workspace-custom
  row is preferred over the global of the same key and gets a *Custom* badge.
- Copy is data-driven too (item count, and the climate-strength chip reads
  "*<band> on <strength dimension>*").

## Surfaces

- **/library** — browse by scope + category. *Your profile* (your completed
  self-assessments, per-dimension, with a Share-with-team toggle), *Team
  assessments* (launch to a team: pick team + optional due date → anonymous
  survey), *Individual assessments* (take inline; saved private).
- **/assessments** — send a team assessment with a deadline; respond to open
  ones; team readouts (min-3 mask + climate strength).
- **Team page** — *Psychological safety* readout + *Team profiles* (teammates'
  opted-in individual results).
- **In a workshop** — a survey block renders the resolved instrument live or as
  scheduled pre-work.

## Privacy

- **Team aggregates:** hidden until ≥3 respondents; individual survey answers
  are never exposed (own-row RLS).
- **Individual results:** private to you by default. Sharing is per-result and
  opt-in; a *teammate* is anyone you share a live team with. Stop sharing any
  time — it flips straight back to private.

## Author a custom instrument (in-app)

Workspace **admins** get a **New template** button on `/library` →
`/library/new`. The builder takes a name, scope, category, scale and a set of
**dimensions** + **questions** (you work in labels; stable, workspace-unique
keys are generated on save). Team instruments also pick which dimension drives
the climate-strength read. Edit or delete a custom instrument from its card.
Globals can't be edited or deleted. Authoring is admin-only by design (a custom
instrument is a workspace-level asset) — easily widened to team leads if wanted.

Writes go through `save_assessment_template` / `delete_assessment_template`
(SECURITY DEFINER, admin-guarded, anon-revoked); the definition is validated in
SQL (`private.valid_instrument_definition`) as well as in the UI.

## Add a built-in instrument

Insert a global row (migration) with a `definition` of this shape:

```json
{
  "scale": { "min": 1, "max": 7, "minLabel": "Strongly disagree", "maxLabel": "Strongly agree" },
  "strengthDimension": "safety",
  "dimensions": [{ "key": "safety", "label": "Psychological safety", "blurb": "…" }],
  "items": [{ "key": "safety_1", "dimension": "safety", "text": "…" }]
}
```

Set `scope` to `team` or `individual` and a `category`. That's it — the picker,
library, run block and readouts all pick it up. `strengthDimension` is optional
for individual instruments (it falls back to the first dimension and no
climate-strength chip is shown).

## Built-ins

**Team:** Psychological Safety (Bang) · Team Effectiveness (Bang) · Team
Learning (Edmondson). **Individual:** Working Style · Strengths Snapshot
(OwnTheAgenda originals).

## Verification

- **DB role tests (rolled back):** template seed (2 individual / 3 team) +
  member-reads-global; individual store — idempotent upsert, own-only read,
  non-member submit blocked (42501); sharing — teammate sees a shared result,
  not a private one, a non-teammate sees neither, the toggle is own-only;
  authoring — admin create (generated key) + per-workspace key uniqueness,
  invalid-def rejected (22023), member create/delete blocked (42501), global
  delete blocked, edit-in-place with no duplicate.
- **Privileges:** `submit_individual_response`, `set_individual_shared`,
  `save_assessment_template`, `delete_assessment_template` anon-revoked,
  authenticated-granted (`has_function_privilege`).
- **Advisors:** no RLS-disabled tables, no mutable `search_path`.
- **Gate:** typecheck / lint / tests / build green.

## Attribution & limits

Items are our own wording of research-validated scales (Bang & Midelfart;
Edmondson 1999; Fyhn et al. 2023) — not an endorsement. The individual
instruments are OwnTheAgenda originals; we deliberately avoid proprietary
inventories (Big Five / MBTI / DISC).
