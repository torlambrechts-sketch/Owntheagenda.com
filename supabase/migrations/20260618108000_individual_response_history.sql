-- =====================================================================
-- Longitudinal history for individual assessments
-- ---------------------------------------------------------------------
-- `individual_response` keeps only the latest row per (workspace, user,
-- template) — retaking overwrites it, so there's no personal trend. This
-- adds an append-only log written on every submit, and surfaces a
-- per-dimension "movement since first take" in the report. Strictly
-- own-only (same privacy stance as individual_response); writes happen
-- only through the security-definer submit function.
-- =====================================================================

create table if not exists public.individual_response_history (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  scores       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists individual_response_history_lookup
  on public.individual_response_history (workspace_id, user_id, template_key, created_at);

alter table public.individual_response_history enable row level security;
drop policy if exists individual_response_history_select_own on public.individual_response_history;
create policy individual_response_history_select_own on public.individual_response_history
  for select to authenticated using (user_id = (select auth.uid()));
-- No insert/update/delete policy: the append happens inside the
-- security-definer submit function, never directly from a client.

-- Re-create submit to also append a history row on every take.
create or replace function public.submit_individual_response(p_workspace uuid, p_template_key text, p_scores jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  insert into public.individual_response (workspace_id, user_id, template_key, scores)
  values (p_workspace, (select auth.uid()), p_template_key, p_scores)
  on conflict (workspace_id, user_id, template_key)
    do update set scores = excluded.scores, updated_at = now();
  insert into public.individual_response_history (workspace_id, user_id, template_key, scores)
  values (p_workspace, (select auth.uid()), p_template_key, p_scores);
end;
$$;

revoke execute on function public.submit_individual_response(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_individual_response(uuid, text, jsonb) to authenticated;
