-- Individual self-assessment responses (working style, strengths, etc.).
-- Private to the taker; an opt-in `shared` flag is surfaced in a later phase.
create table if not exists public.individual_response (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  scores jsonb not null default '{}'::jsonb,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, template_key)
);
create trigger set_individual_response_updated before update on public.individual_response
  for each row execute function private.set_updated_at();

alter table public.individual_response enable row level security;
-- Private until shared: this phase is strictly own-only; the shared-read policy
-- comes with the profile/share surface.
create policy individual_response_select_own on public.individual_response
  for select to authenticated using (user_id = (select auth.uid()));

-- Upsert my answer to an instrument, in a workspace I belong to.
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
end;
$$;

revoke execute on function public.submit_individual_response(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_individual_response(uuid, text, jsonb) to authenticated;
