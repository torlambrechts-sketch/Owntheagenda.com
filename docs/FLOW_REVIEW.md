# Flow + Assessment Anonymity — External Review

_Reviewed as an external senior engineering + design partner. Scope: the
"Psychological Safety Campaign" flow and the five gaps (M–Q) raised against it —
anonymity model, open-text, tokenized distribution, facilitator output, and
deficit-driven assembly. All work landed on `main` and the live database
(`owntheagenda`, project `fqeohcfkimoopwjxxcft`)._

## What shipped

| Gap | Capability | Surface |
| --- | --- | --- |
| **M** | Anonymity model — Anonymous (no `respondent_id`, hashed dedup) vs Attributed (named, behind consent). Default **anonymous**. | `survey.anonymity`, `respondent_salt`, `survey_response.respondent_hash`, two partial-unique indexes; `submit_survey_response` branches on mode; flow gate counts via `count(*)` so both modes count one row per respondent. |
| **N** | Open-text comments alongside the Likert scores. Identity follows the mode; grouped output masked below the n≥3 floor; blank comments dropped. | `survey_response.comments`, `submit_survey_response(…, p_comments)`, `survey_comments(p_survey)` RPC; comment box in `SurveyRespond`; facilitator "Comments" reveal in `SendSurvey`. |
| **O** | Tokenized public/anonymous survey links — respond without an account. Anonymous-only (an attributed survey can't honour a nameless link). | `survey.share_token`, `survey_share_set`, `public_survey_meta`, `submit_public_survey_response`; public route `/survey/[token]`; mint/copy/revoke control in `SendSurvey`; `/survey` added to middleware public prefixes. |
| **P** | Facilitator output — the flow carries its assessment into the workshop (charts render via the survey block) and now the **open-text comments** surface in the run view's "Team reading" panel. | `attach_carried_survey` + per-step `program_autobuild` (carry-survey work); comments load in `SurveyModule`, behind the same n≥3 floor. |
| **Q** | Deficit → focus. From the per-dimension means, name where to spend the session ("Where to focus"), or flag an even profile. | Pure, unit-tested `surveyFocus()`; callout above the dimension bars in `SurveyModule`. |

## Critical bug found and fixed

**Anonymous responses — the default mode — were rejected on the live database.**
Phase M added the anonymous path (`respondent_id` null + `respondent_hash`), but
the original `survey_subsystem` migration declared `survey_response.respondent_id`
**NOT NULL**. Every anonymous submission and every public-link response failed
with a not-null violation. The local SQL harness missed it because its
scaffolding table allowed nulls.

- **Fix:** `20260620245000_survey_response_nullable_respondent.sql` drops the
  constraint (the two partial-unique indexes still enforce one row per
  respondent per mode). Applied to live; an anonymous insert probe now succeeds.
- **Process fix:** the harness bootstrap now declares `respondent_id NOT NULL`,
  so the suite **fails without the fix and passes with it** — this class of
  drift is now caught.

This is the kind of gap a "looks-green" review misses: every phase passed its
own tests, but the test scaffolding diverged from production DDL. Worth a
standing rule — _the harness schema must mirror live, especially nullability and
constraints, not just columns._

## Audit results

- **Security advisors:** no new categories. The two public functions raise the
  same intentional `anon`-execute warning as the pre-existing
  `public_session_readout`; every new function is `SECURITY DEFINER` with
  `search_path = ''` and internal authz (`can_manage_team` / `can_read_team` /
  token validation) — identical to the 100+ existing RPCs. `anon` is correctly
  revoked from the authenticated-only functions.
- **Performance advisors:** no new findings beyond the repo's existing
  INFO-level patterns (unindexed FKs, unused indexes). `share_token` is unique
  (indexed); response lookups are covered by the two partial-unique indexes.
- **Repo/live drift reconciled:** a prior session's
  `flow_carry_survey_into_workshop` was live but uncommitted; it is now in the
  repo, and a concurrent line's migration-version de-dupe + final
  `program_autobuild` were merged cleanly (per-step template **and** the carry).

## Design read

- **Privacy is legible at every touchpoint.** The responder sees "Anonymous —
  never tied to you" vs "Attributed — linked to your name"; the public link says
  "fully anonymous"; comments restate the rule inline. Trust is earned at the
  point of input, which is exactly where psychological-safety tooling must earn
  it.
- **The n≥3 floor is enforced server-side**, not just hidden in the UI —
  `survey_comments` and `survey_results` both mask below the floor, so a curious
  client can't peel it back.
- **The facilitator now opens the session already looking at the team's read** —
  scores, dispersion, comments, and a "where to focus" nudge — instead of a
  generic template. That closes the loop the original spec was missing.

## Remaining gaps & recommendations (prioritised)

1. **Public-link abuse (medium).** `submit_public_survey_response` accepts
   unlimited submissions (a fresh random hash each time), so a public link can
   be ballot-stuffed, inflating the gate count and skewing aggregates. For
   internal distribution this is acceptable; before external/wide use, add a
   soft per-token cap or a lightweight challenge. _Documented, not yet built._
2. **Deficit → remedy-block auto-assembly (low / deferred).** Phase Q ships the
   facilitation-layer answer (name the weakest dimension). True block-level
   composition — auto-appending targeted activities per deficit — needs a
   curated remedy-block library keyed by dimension (safety, integration, task,
   satisfaction, trust, …). That's content design, not plumbing; recommend
   scoping it as its own piece once the prompt library exists.
3. **Live in-room survey has no comment box.** `SurveyModule`'s live runner
   submits scores only (the 3-arg RPC defaults comments to `{}`). Async pre-work
   collects comments; if comments are wanted in-room too, add the box there.
4. **Harness durability.** The SQL regression + Phase N/O suites live in `/tmp`,
   not the repo. Consider committing them under `test/sql/` so the DDL-level
   coverage travels with the code (vitest covers the TS units only).

## Verification performed

- Local Postgres harness: 3 flow regression scenarios + 6 Phase N + 6 Phase O
  cases — all green, **with `respondent_id NOT NULL` reproduced**.
- `npx tsc --noEmit`, `npx next lint`, `npx vitest run` (64 tests, +4 for
  `surveyFocus`), `npx next build` — all green.
- Live: function security/grants verified; anonymous insert probe confirmed
  working after the fix.

**Sign-off:** the five gaps are closed and the campaign flow is coherent
end-to-end (assess → collect → carry → focus → commit). The one production
defect found is fixed and now regression-covered. The two open items above are
enhancements, not blockers.
