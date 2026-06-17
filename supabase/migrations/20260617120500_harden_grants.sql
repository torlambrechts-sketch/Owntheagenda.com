-- =====================================================================
-- OwnTheAgenda · 0005 · Harden function execution grants
-- ---------------------------------------------------------------------
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which exposes our
-- SECURITY DEFINER functions to the `anon` role over PostgREST. We lock
-- that down:
--   * handle_new_user is a trigger only — remove all API access.
--   * the RPCs are for signed-in users — drop the implicit PUBLIC grant
--     so `anon` can't call them; the explicit `authenticated` grant from
--     0003 remains, which is the intended audience.
-- (The advisor will still note these RPCs are callable by `authenticated`
-- — that is by design: they must be DEFINER to provision tenants / accept
-- invites while bypassing RLS safely.)
-- =====================================================================

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.provision_workspace(text, text) from public, anon;
revoke execute on function public.create_invitation(uuid, text, public.workspace_role, uuid, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.set_team_consent(uuid, boolean) from public, anon;
