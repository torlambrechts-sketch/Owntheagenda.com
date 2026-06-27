-- program_reorder_steps was created with an explicit grant to authenticated but
-- kept Postgres' default PUBLIC execute grant, leaving it anon-executable. The
-- internal is_workspace_admin guard already blocks anon, but match the codebase
-- posture and revoke from public/anon.
revoke execute on function public.program_reorder_steps(uuid, uuid[]) from public, anon;
