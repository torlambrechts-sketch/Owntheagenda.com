# Insight Dashboard + Reporting — Plan

Source design: `insights-app.jsx` (Claude Design handoff "Insight dashboard with reporting").
Replace the Insight section (Leadership Teams / Trends / Reports) with a single **Insights**
analytics dashboard, wired to real data, plus a real reporting subsystem.

## Decisions (locked with product owner)
1. **Management preserved.** Build the new Insights dashboard AND keep the existing pulse/survey/health management (the Leadership Teams surface) reachable — nothing leads/admins do today is lost.
2. **Reports = full delivery.** Real recurring email via **Resend**, scheduled by **Supabase pg_cron + an edge function**. Schedules persist; exports (CSV real, PDF via print, Excel best-effort) work; sending is inert until `RESEND_API_KEY` + a verified sender are set as Supabase secrets.
3. **Real app data + real labels.** Render the actual assessments/dynamics/instruments under their real names; the design's HMS labels (Demands, AMU…) are illustrative styling only.
4. **By assessment = selector + drill-in.** Dropdown (default: most recent flagged/below-band assessment) + clicking an Overview row opens it.

## Design surface (one "Insights" page)
- **6-KPI strip:** active assessments · avg score · responses · below threshold · workshops scheduled · participation.
- **Tab band:** Overview · By assessment · By workshop · By team · Reports.
- **Toolbar:** Filters (date range / team / status / type / flagged / below-threshold) · more-actions (send report, import responses, export PDF/Excel/CSV).
- **Overview:** avg-score trend line (target line) · participation-by-team bars · section band rows (bands-not-more-is-better) · workshops-this-quarter list · all-assessments table (sparkline + flag, row → By assessment).
- **By assessment:** 4 KPIs · section band rows · score-over-time line · Grounded/Human-note card · assessment selector.
- **By workshop:** 4 KPIs · workshop-outcomes table with Δ-score (pre/post pulse) + outcome.
- **By team:** per-team cards with dimension bars.
- **Reports:** scheduled-reports table + New report (side-window: recipients/format/frequency/includes) · Quick-export card · Import-responses side-window.
- **Side-windows + toast** per the design.

## Data mapping (existing → tab)
- KPIs: `survey`/`pulse` open counts, `survey_results.composite` + `team_dynamics`, response counts, `assessment_below_band_rollup`, `workshop` scheduled, participation RPCs.
- Overview trend / section bands / participation: `team_dynamics_history`, `team_dynamics`, `survey_results`, `workspace_health` (per-team rollup, already workspace-wide).
- All-assessments table: `survey` + `pulse` list with `survey_results`/`team_dynamics` score + history sparkline + below-band flag.
- By assessment: `survey_results` (sections via `dimensionMeans`), trend, climate-strength → Grounded/Human-note.
- By workshop: `workshop`/`session` + **`session_pulse_delta`** (the Δ-score already exists) + `action_item` closed counts.
- By team: `team_dynamics` per team (dimension bars) + composite.
- Min-3 anonymity masking preserved everywhere.

## Net-new backend
- A few workspace-rollup RPCs where per-team aggregation isn't already covered (assessment list w/ score+spark+flag; workshop-outcomes rollup; KPI rollup).
- `report_schedule` (+ `report_run` log) table with RLS.
- Resend email send via an edge function; `pg_cron` job that finds due schedules and invokes it; report generation (HTML/CSV) server-side.
- CSV/XLSX **import of survey responses** (anonymized merge).

## Phases (each: tsc + build + DB-verify under RLS + browser walkthrough → commit → push main)
- **A — DB analytics:** workspace-rollup RPCs (verified under RLS). 
- **B — Dashboard shell + Overview/By team:** nav → Insights; page shell, KPI strip, tab band, toolbar, Overview + By-team tabs on real data.
- **C — By assessment + By workshop:** selector + drill-in; Δ-score outcomes.
- **D — Reports subsystem:** `report_schedule` table; New-report + Import side-windows; CSV/PDF export; Resend edge function + pg_cron; generation.
- **E — Nav + preserve management:** Insight nav = Insights + Leadership Teams (kept); redirect /insight/trends + /insight/reports → /insight.
- **F — Verify:** browser walkthrough of all tabs + DB checks; report dry-run.

## Status log
- _appended per phase._

- **Phase B — Dashboard shell + Overview + By team ✅** New `/insight` page (server) + `InsightDashboard` client: KPI strip, 5-tab band, presentational Filters/actions toolbar, and the Overview + By-team tabs wired to real `workspace_health` / `team_dynamics` / counts, with min-3 masking → "—". By assessment / By workshop / Reports are placeholders. Deviation: `assessment_below_band_rollup` is gone — superseded by `assessment_suite_overview.below_count` (summed; called untyped + try/catch). Verified: tsc+build green; DB check on Lumio AS (active 3 · avg 68.0 · responses 25 · below 7); browser render clean with honest empty states. Old leadership-teams/trends/reports pages untouched; nav swap is Phase E.

- **Phase C — By assessment + By workshop + Overview assessment table ✅** Overview "All assessments" table (surveys via `assessment_suite_overview` + pulses via `team_dynamics`/`pulse_participation`; row → drill-in). By-assessment selector (default = most recent flagged) with lazy detail via server action `assessmentDetail(surveyId)` (`survey_results` → `dimensionMeans` sections, prior-survey trend, `climateStrength` human-note). By-workshop outcomes (Δ-score via `session_pulse_delta`, actions closed, attendance). Per-row sparklines deferred. Verified: tsc+build green; DB check (survey composite 65.0 / 3 respondents). 
