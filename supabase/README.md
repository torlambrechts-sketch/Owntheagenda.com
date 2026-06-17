# OwnTheAgenda — Database (Supabase)

Phase 1 of the build: the **core architecture** — identity, multi-tenancy, the
team/organizational hierarchy, the invite flow, and Row-Level Security. Everything
is database-driven; security is enforced in Postgres (RLS), not the UI.

## Migrations (apply in order)

| # | File | What it creates |
|---|------|-----------------|
| 0001 | `20260617120100_init_extensions.sql` | `pgcrypto`, `citext`, the `private` schema, `set_updated_at()` |
| 0002 | `20260617120200_core_tables.sql` | enums + tables: `workspace, profile, membership, team, team_member, invitation, audit_log` |
| 0003 | `20260617120300_functions_triggers.sql` | RLS helpers, `auth.users→profile` mirror, signup/invite RPCs, integrity guards |
| 0004 | `20260617120400_rls_policies.sql` | RLS enabled + all policies + grants |

`seed.sql` loads the **Lumio AS** demo workspace (local dev only).

## The model

```
auth.users ──1:1──▶ profile
     │
     └──▶ membership ──▶ workspace            (workspace_role: owner | admin | member)
                            │
                            ├──▶ team ──(parent_team_id)──▶ team   (nestable org hierarchy)
                            │       └──▶ team_member ──▶ auth.users (role_title, is_lead, consent_share)
                            │
                            ├──▶ invitation   (email + hashed token, optional team placement)
                            └──▶ audit_log     (append-only)
```

- **Tenant root** is `workspace` (a company). Every row is scoped to it.
- **Two-entity spine** is `team` + `team_member` (per the engineering spec).
- **Org hierarchy** via `team.parent_team_id` (company › division › team), cycle-guarded.
- **Workspace roles** are `owner / admin / member`. Team *leadership* lives at the
  team level (`team.lead_user_id`, `team_member.is_lead`) — see the architecture note below.

## Security model (RLS)

- RLS is **on for every table**. Reads are scoped to workspace members; writes to
  admins / team managers.
- Policy predicates call `SECURITY DEFINER` helpers in the `private` schema
  (`is_workspace_member`, `is_workspace_admin`, `can_manage_team`, …). These bypass
  RLS, which **prevents the infinite-recursion trap** of a `membership` policy that
  reads `membership`.
- Tenant creation and invite acceptance run only through definer RPCs, so
  `workspace` and `audit_log` deliberately have **no INSERT policy**.

## RPC surface (call from the app via `supabase.rpc(...)`)

| Function | Who | Purpose |
|----------|-----|---------|
| `provision_workspace(name, slug?)` | any authenticated user | **Company sign-up** — creates a workspace and makes you its owner |
| `create_invitation(workspace, email, role?, team?, role_title?)` | admin / team lead | Issues an invite, returns the **raw token once** (email it) |
| `accept_invitation(token)` | the invited user | Joins the workspace (and team), atomically |
| `set_team_consent(team_member, consent)` | the member | Toggles consent on your own row |

### Example: a company signs up, invites a colleague

```ts
// 1. Founder creates the company (after auth.signUp)
const { data: ws } = await supabase.rpc('provision_workspace', { p_name: 'Lumio AS' })

// 2. Founder invites a colleague onto the leadership team
const { data: token } = await supabase.rpc('create_invitation', {
  p_workspace: ws.id, p_email: 'henrik@lumio.no', p_role: 'member',
  p_team: teamId, p_role_title: 'CFO',
})
// → email https://owntheagenda.com/invite/${token}

// 3. Colleague (signed in as henrik@lumio.no) accepts
await supabase.rpc('accept_invitation', { p_token: token })
```

## Architecture note — role consolidation

The detailed spec listed `admin | leader | member` as the *workspace* role. We
consolidated to `owner | admin | member` and moved **leadership to the team level**
(`team.lead_user_id` / `team_member.is_lead`), because "leader" is a property of a
*team*, not the whole company, and a workspace needs a billing/superuser `owner`.
This removes an ambiguous overlap and keeps the capability checks unambiguous.

## Applying

**Via the Supabase MCP** (this repo's workflow): each file is applied with
`apply_migration`, then `get_advisors(type: security)` verifies no table is left
without RLS.

**Via the CLI** (local):
```bash
supabase init           # once
supabase link --project-ref <ref>
supabase db push        # applies migrations/
supabase db reset       # local: re-applies migrations + seed.sql
```
