# Assessment & workshop hardening — external review & close-out

An outside-lens review (senior engineer: correctness · security · performance; design studio:
clarity · consistency · craft) of the hardening work landed on `main` across this engagement,
**on top of** main's Phases A–N (the shared `AssessmentRunner`, the DB-backed question bank,
anonymity, open-text comments, public survey links, per-step flow templates). Everything below
was verified against a clean `typecheck · lint · test · build` and the live database.

## Scope reviewed (what shipped, all on `main`)

| Theme | What | Backend |
|---|---|---|
| Correctness | **Survey** definition snapshot (`create_survey`/`survey_composite` read the snapshot) | migration, applied |
| Correctness | **Individual-response** definition snapshot — report reads the take-time snapshot; re-take uses live | migration `…250000`, applied |
| Flow (the core loop) | Assessment results **carry into the workshop** — `attach_carried_survey` binds/prepends a "Review the team reading" step; reconciled with main's per-step `program_autobuild` | migration `…235000`, applied |
| Run | **Vote dead-end fix** — facilitator can add options live instead of being stuck on "Seeding options…" | client |
| Builder | **Vote guardrails** (amber warning, list + editor) + **Duplicate step** | client |
| Export | CSV/JSON of the team reading (respondent + in-room) and of the report (individual + team) | client |
| Resume | **Server-side cross-device** survey resume (respondent + in-room) | migration `…205000` |
| Insight | **Team re-measure trend** (composite over time) | RPC `…205500` |
| Bank | Curated `lib/itembank.ts` wired into main's question bank | client |

## Senior-developer review

**Correctness.**
- Both snapshot fixes resolve reads from the row's own `definition`, falling back to the live
  template for legacy rows — verified on the live DB (survey: rolled-back proof that a corrupted
  template leaves a survey's composite unchanged; individual: column + snapshotting submit
  confirmed, backfill run).
- The flow→workshop carry was the riskiest: main's per-step `program_autobuild` and this branch's
  attach call collided twice. Final state verified live — `program_autobuild` has **both** per-step
  template selection **and** the attach call; a rolled-back simulation built the `health` workshop
  with a `psych_safety_bang` survey and produced an ord-1 survey step **bound to the carried
  survey**.
- The vote fix reuses the existing `addIdea('option')` insert path; the auto-seed effect still
  no-ops on empty `config.options`, so there's no double-seed.

**Security.** `get_advisors(security)`: **117 findings, 0 ERROR** — all the project's intentional
`authenticated_security_definer_function_executable` pattern plus the pre-existing
`rls_enabled_no_policy`/`extension_in_public`/leaked-password INFO. The 3 `anon_security_definer`
notices are main's token-gated public-survey-link, not this work. New surfaces:
`survey_response_draft` (own-row RLS + definer RPCs), `individual_response.definition` (own-row
read; questions aren't sensitive). No new trust-boundary crossings.

**Performance.** Exports and CSV are pure in-memory; `survey_trend`/draft RPCs are small,
indexed, and gated. No new hot-path effects beyond a debounced draft save.

**Gap found & closed during review.** Duplicate migration version prefixes (from concurrent
branches landing the same timestamps) were renamed to unique, dependency-ordered versions — a
clean `db reset` now has no collisions.

## Design-studio review

Built from the existing token set and shared primitives — exports use one `ResultsExport`/`lib/exporting`
pair; the builder guardrails reuse the amber accent; the trend sparkline and the in-room "Review
the team reading" step read as native. The vote fix turns a dead end ("Seeding options…") into an
obvious action ("add the options… ▸").

## Open / deliberately deferred (with rationale)

These are the original `WORKSHOP_EXPERIENCE_PROPOSAL.md` tracks — **large initiatives**, scoped out
of this hardening pass to protect quality and avoid churn on main's most active files
(`RunClient`, `BuilderClient`). Each is a clean next effort:

1. **AI "draft my agenda" (Track A5)** — generate a timed agenda from a goal + the team's pulse.
   Needs a server AI integration; the largest single bet and the strongest differentiator.
2. **Facilitator superpowers (Track B)** — "summon the room" / attention control, a Now/Next HUD,
   a dry-run rehearsal mode. Heavy `RunClient` surface; high merge-collision risk right now.
3. **Decision-grade voting (Track C)** — weighted / $100 allocation and a multi-criteria matrix.
   Needs a vote-weight column + `IdeaModule` interaction work.
4. **Builder drag-drop reorder (A1)** — deferred over up/down because drag-drop can't be
   manually verified in this environment; low value-to-risk vs. the working buttons.

**Minor, noted (not blocking):** duplicating a `survey` step clones its `config.kind` but not a
bound `survey_id` (re-bind in the editor) — correct default, since a copy shouldn't silently share
another step's open survey.

**Advisory (not code):** the shared Supabase project keeps taking concurrent migrations from
multiple branches — the root cause of the per-step clobber and the duplicate timestamps this review
fixed. A per-branch Supabase branch (or serialized migration ownership) would prevent recurrence.

## Verification

- `tsc --noEmit` clean · `next lint` clean · `next build` success · `vitest` **64 passed**.
- No duplicate migration versions; `HEAD == origin/main`.
- Live DB: snapshots applied & verified; advisors **0 ERROR**.

## Verdict

No open correctness or security gaps in what shipped. The product's core loop —
**assess → carry the result into the workshop → run → re-measure** — is now closed end to end (it
previously linked the survey but never surfaced it), the vote dead-end is gone, and the assessment
results are exportable and resumable across devices. The remaining work is net-new feature
initiatives, not loose ends.
