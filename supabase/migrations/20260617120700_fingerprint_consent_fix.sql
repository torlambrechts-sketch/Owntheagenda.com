-- =====================================================================
-- OwnTheAgenda · 0007 · Consent must gate fingerprint READS (even admins)
-- ---------------------------------------------------------------------
-- The 0006 `fingerprint_write` policy was FOR ALL with USING is_workspace_admin.
-- A FOR ALL policy's USING clause ALSO applies to SELECT, so admins could
-- read every fingerprint regardless of the member's consent — contrary to
-- the "consent is first-class" principle. Replace it with write-only
-- policies (INSERT/UPDATE/DELETE) so SELECT is governed solely by the
-- consent-aware fingerprint_select policy, for everyone.
-- =====================================================================

drop policy if exists fingerprint_write on public.fingerprint;

create policy fingerprint_insert on public.fingerprint
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));

create policy fingerprint_update on public.fingerprint
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

create policy fingerprint_delete on public.fingerprint
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));
