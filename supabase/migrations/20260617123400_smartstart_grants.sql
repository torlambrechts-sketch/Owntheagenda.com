-- Match the house pattern: charter/manual RPCs are authenticated-only (not anon).
-- They are internally guarded (is_workspace_member / can_manage_team), but we
-- revoke the blanket PUBLIC + anon execute and re-grant to authenticated to keep
-- the anon attack surface closed (clears advisor 0028).
revoke execute on function public.upsert_user_manual(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.upsert_user_manual(uuid, text, text, text, text, text, text) to authenticated;
revoke execute on function public.save_charter_section(uuid, text, jsonb) from public, anon;
grant execute on function public.save_charter_section(uuid, text, jsonb) to authenticated;
revoke execute on function public.compile_charter(uuid, uuid) from public, anon;
grant execute on function public.compile_charter(uuid, uuid) to authenticated;
