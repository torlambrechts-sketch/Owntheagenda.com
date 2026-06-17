# OwnTheAgenda — External Review (Senior Engineer + Design Agency)

**Date:** 2026-06-17
**Scope:** the full build after Steps 1–5 (quality gate, privacy/licensing, the decision & accountability layer, psychological-safety mechanics, AI synthesis upgrades, close-gates + export). Reviewed for correctness, security, performance, quality gates, and design-system fidelity, with fixes applied.

---

## Verdict

**Ship-ready for its current scope.** The product now does what the research says wins the category — turns sessions into *owned, resourced, accountable decisions* — on a multi-tenant, RLS-enforced foundation with a green quality gate. The gaps that remain are deliberately-deferred scope (async, guest access, enterprise SSO/SCIM, integrations, marketplace), not defects.

---

## Quality gate (all green)

| Gate | Result |
|---|---|
| `pnpm/npm lint` (ESLint, next/core-web-vitals) | ✅ No warnings or errors |
| `typecheck` (tsc --noEmit) | ✅ Clean |
| `test` (Vitest) | ✅ 16 tests, 3 suites |
| `build` (next build) | ✅ Clean |

Fixed during review:
- **No ESLint config existed** → added `.eslintrc.json` + `eslint`/`eslint-config-next`; `npm run lint` now runs non-interactively in CI.
- **Lint error**: a server action named `useTemplate` tripped `react-hooks/rules-of-hooks` (the "use" prefix) → renamed to `buildFromTemplate`.
- **Font warning** (`no-page-custom-font`): render-blocking Google Fonts `<link>` → migrated to `next/font` (self-hosted, no layout shift), layered ahead of the existing `--font-display`/`--font-ui` fallbacks so it's zero-visual-risk.

## Security & RLS

- **RLS coverage is complete**: all 26 public tables have RLS enabled with policies. Tables with a single policy are read-only-to-clients by design (writes go through SECURITY DEFINER RPCs).
- **Security advisors clean**: the only notices are the by-design "authenticated can execute SECURITY DEFINER RPC" set (every one is internally guarded — `can_read_session` / `is_session_facilitator` / `can_manage_*`) and one project-level Auth toggle (leaked-password protection — owner action).
- **Anti-theatre gates proven** by rolled-back role tests: commit requires a named decider + resourcing note + no unresolved opposition (or written override); actions need owner + due; close requires no draft decisions, an owned+dated action per committed decision, and an objective.
- **Psychological safety enforced in RLS**, not just UI: silent blocks hide others' cards until reveal; anonymous cards mask the author name.

## Performance

- Added covering indexes on the two genuinely-joined hot FKs (`action_item.decision_id`, `idea.author_id`). The remaining advisor notices are INFO-level `created_by`/`workspace_id` FKs on small tables — intentionally left unindexed (the advisor also flags over-indexing; these add write cost for no read benefit at this scale).

## Code quality

- Extracted the synthesis heuristic + prompt builder into a pure, framework-free `lib/synthesis.ts` and added unit tests (minority/opposition surfacing, feedback-lane themes, fallback actions).
- Server Actions consistently validate input and return `{ error }`; all DB mutations are RLS-bound or routed through guarded RPCs.
- Realtime tables carry `replica identity full` + publication; clients reconcile incrementally.

## Design review (design-agency lens)

- **System fidelity is high**: every new surface reuses the existing token set and component classes (`.pill`, `.btn-*`, `.field`, `.summary/.stat`, `.ro-*`, `.side-window`), Playfair for display + Inter for UI, forest/cream palette. No shadcn/Geist defaults, no glassmorphism.
- **Accessibility**: icon-only controls carry `title`/`aria-label` (bell, check toggles, icon buttons); `:focus-visible` outline is global; a `prefers-reduced-motion` guard exists for the slide-over/scrim/toast; new banners are text-first.
- **Print**: the readout has a dedicated print stylesheet (drops app chrome) for a clean hand-out.
- Minor notes (non-blocking): the run-mode close-gate banner uses two one-off hex values (no dark-danger token exists); the decisions panel is dense in the 320px run sidebar (acceptable for a facilitator tool, desktop-first).

## Known limitations / intentionally deferred

- **AI synthesis** uses the deterministic fallback until `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) is set and outbound to `api.anthropic.com` is allowed; the persisted draft + facilitator-approval gate work either way.
- **Anonymity** masks the author *name*; `author_id` is retained for access control + own-delete (same trade-off as the existing fist-of-five). Full unlinkability would need a masking view/RPC.
- **Not built (deferred scope)**: async participation + low-friction guest access; enterprise SSO/SCIM/data-residency/audit-on-decisions; Slack/Teams/Jira integrations; consultant mode + template marketplace; live multiplayer cursors; server-side PDF (browser print covers the readout today).
- **Email/scheduled reminders** are in-app only; delivery + time-based nudges await a background-job runner (`pg_cron` + Edge Functions).
- DB types are hand-maintained (simplified). Low drift risk given the test + typecheck gate; regenerate via the Supabase CLI if it grows.
