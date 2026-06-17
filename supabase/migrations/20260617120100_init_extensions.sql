-- =====================================================================
-- OwnTheAgenda · 0001 · Extensions, private schema, shared utilities
-- ---------------------------------------------------------------------
-- Foundation layer. Installs the extensions we rely on, creates a
-- `private` schema that holds SECURITY DEFINER helper functions used by
-- Row-Level Security (kept out of the PostgREST-exposed `public` schema),
-- and a generic updated_at trigger.
--
-- Design note (the #1 multi-tenant RLS pitfall): policies on `membership`
-- that need to look at `membership` would recurse infinitely. We avoid
-- that by doing every membership/role lookup through SECURITY DEFINER
-- functions in `private` — they run as the function owner and therefore
-- bypass RLS, breaking the recursion. See 0003/0004.
-- =====================================================================

-- pgcrypto: gen_random_bytes() + digest() for hashed invitation tokens.
create extension if not exists pgcrypto with schema extensions;
-- citext: case-insensitive emails and slugs (storage-level de-duplication).
create extension if not exists citext with schema extensions;

-- Schema for internal helper functions. Not exposed through the API.
create schema if not exists private;

-- The API roles may *call* helpers from inside RLS policies, but the
-- schema is never exposed to PostgREST, so nothing here becomes an
-- accidental REST/RPC endpoint. Execute is granted per-function in 0003.
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------
-- Generic updated_at maintenance, attached to every mutable table.
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
