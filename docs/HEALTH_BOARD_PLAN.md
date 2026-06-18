# Org Health Board — build plan

A workspace-level surface to track the status of every **team** and **leadership
group** across health axes, grounded in the assessment data we already collect,
with a manual status overlay leaders can pin on top.

Decisions (confirmed):
- **Scoring:** both — auto signals from assessment data + an optional manual
  RAG/note overlay per axis.
- **Leadership groups:** both — an explicit `team.kind` tag AND hierarchy roll-up
  (a leadership group shows its child teams beneath it via `parent_team_id`).
- **Performance:** a new Team Performance pulse instrument.

## Axes (columns) per entity
- **Dynamics** — from `team_dynamics` (5 dynamics, in-band count + overall). Out-of-
  band dynamics are the primary development signal.
- **Strategy** — latest Strategy Health composite + benchmark percentile.
- **Performance** — latest Team Performance composite (new instrument).
- **Development areas** — auto: out-of-band dynamics + weakest dimensions, as chips.
- **Manual overlay** — per-axis RAG (red/amber/green) + note, leader-set, pinned on top.

## Phases (each: migration → rolled-back RLS/logic test → repo file + types → UI → gate → commit)
- **A. Team Performance instrument** (assessment_template row). ✅ in progress
- **B. `team.kind`** ('team' | 'leadership_group') + setter; types.
- **C. `health_status`** table (team_id, axis, status, note) + `set_health_status` RPC; RLS.
- **D. `workspace_health(workspace)`** roll-up RPC — per readable team: kind, parent,
  dynamics, strategy composite+benchmark, performance composite, development chips,
  manual overlay. Single source for the board.
- **E. `/health` board UI** — leadership groups with nested child teams + standalone
  teams; axis cells with data + manual RAG; inline status editor for leads.
- **F. Nav + review + docs + merge.**

## Scope/visibility
Workspace admins see all teams; leads see the teams they can read (RLS via
can_read_team). The roll-up RPC filters to readable teams.

## Build status (shipped)
Phases A–E built, verified (rolled-back tests per phase) and merged. Security
advisors: 0 errors. Phase F is the standing review/gate.

## Invariants to preserve
- `workspace_health` returns only teams the caller can read (per-row
  `can_read_team`), gated to active workspace members (`is_workspace_member`).
- No composite is shown for a <3 survey (`team_latest_composite` requires ≥3 and
  `survey_composite` returns null <3); masked dynamics are excluded (`pct` null).
- `health_status` writes go through `set_health_status` only (RLS has a read
  policy, no write policy); reads gated by `can_read_team`.
- The auto RAG is derived; the manual overlay only *pins on top*, never relaxes
  the min-3 masks underneath.
