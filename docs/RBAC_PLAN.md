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

- [ ] **P1 · Role foundation** — add `manager`/`facilitator` enum values; role labels +
      helpers (`lib/util`); Members UI shows/assigns all five roles; invite role options.
- [ ] **P2 · Signup join + approval** — `workspace.join_code` (Company ID);
      `membership` gains `requested_role` + `pending` status flow; signup = create-company OR
      join-by-code with requested role; Members UI approves/denies pending requests.
- [ ] **P3 · Organization section + GDPR** — `/organization` route + nav group; org settings
      (name, logo, data_region, `retention_months`); GDPR: `export_member_data`,
      `erase_member`, consent & region surface, retention setting.
- [ ] **P4 · Integrations section** — `/integrations`; `integration` table
      (workspace_id, provider, status, config); catalog (Slack, Teams, Google, Zoom…).
- [ ] **P5 · CSV user import** — upload → parse (email, role, team, role_title) →
      preview/validate → bulk `create_invitation`.
- [ ] **P6 · External facilitator scoping (RLS)** — constrain `facilitator` reads to assigned
      teams/workshops/sessions; heavy rolled-back RLS tests. (Riskiest — last.)

Project: fqeohcfkimoopwjxxcft · Branch: claude/nice-feynman-x7xgh4
