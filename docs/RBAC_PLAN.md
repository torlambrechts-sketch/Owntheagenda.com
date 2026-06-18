# RBAC + Organization + Integrations + GDPR + CSV import

Decisions (from product owner):
1. Role model: **extend `workspace_role`** → `owner, admin, manager, facilitator, member`.
   - Company Administrator = `admin`; Team Manager = `manager`; Employee = `member`;
     Facilitator = `facilitator`; Owner = workspace creator / billing super-admin.
2. Signup: **open + admin approval** — join an existing company by Company ID (join code),
   pick a requested role; elevated roles land *pending* until an admin approves.
3. External facilitators: **scoped to assigned work** — see only the teams / workshops /
   sessions they're assigned to; no org-wide Health / Members / other teams.
4. GDPR: member data export, right to erasure, data retention policy, consent & data region.
5. Integrations: catalog section + per-workspace config model (Connect / coming-soon).
6. CSV user import: bulk invitations with preview + validation.

## Phases (each: migration → rolled-back test → types → UI → gate → commit → ff-merge)

- [x] **P1 · Role foundation** — added `manager`/`facilitator` enum values; role labels +
      helpers (`lib/util`); Members UI shows/assigns all five roles; invite role options.
- [x] **P2 · Signup join + approval** — `workspace.join_code` (Company ID); `membership`
      `pending` status; signup = create-company OR join-by-code with requested role; Members
      Join-requests queue (approve/deny); onboarding "awaiting approval" screen.
- [x] **P3 · Organization section + GDPR** — `/organization` route + admin-gated nav group;
      org settings (name, logo, data_region, `retention_months`, Company ID rotate);
      GDPR `export_member_data` + `erase_member` wired into Members (Export / Erase).
- [x] **P4 · Integrations section** — `/integrations`; admin-scoped `integration` table;
      catalog (Slack + Webhook connectable; Teams/Google/Zoom/Entra coming soon).
- [x] **P5 · CSV user import** — paste/upload → parse (email, role, team, role_title) →
      validate + preview → bulk `create_invitation`.
- [x] **P6 · External facilitator scoping (RLS)** — facilitator-aware
      `can_read_team/workshop/session` + scoped policies on team/workshop/session/membership/
      action_item/follow_up/pulse/canvas_snapshot/user_manual; Health hidden + redirected.
      Verified as the authenticated role (sees only assigned team).

**All phases complete.**

Project: fqeohcfkimoopwjxxcft · Branch: claude/nice-feynman-x7xgh4
