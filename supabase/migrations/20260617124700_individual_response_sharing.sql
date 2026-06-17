-- Opt-in sharing of individual results with teammates.
-- A teammate = someone you share at least one (live) team with.
create or replace function private.shares_team(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.team_member a
    join public.team_member b on a.team_id = b.team_id
    join public.team t on t.id = a.team_id and t.deleted_at is null
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

-- Replace the own-only read with: own rows always, plus shared rows of teammates.
drop policy if exists individual_response_select_own on public.individual_response;
create policy individual_response_select on public.individual_response
  for select to authenticated using (
    user_id = (select auth.uid())
    or (shared and private.shares_team(user_id))
  );

-- Toggle the share flag on my own result.
create or replace function public.set_individual_shared(p_workspace uuid, p_template_key text, p_shared boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.individual_response
    set shared = p_shared, updated_at = now()
    where workspace_id = p_workspace and user_id = (select auth.uid()) and template_key = p_template_key;
end;
$$;

revoke execute on function public.set_individual_shared(uuid, text, boolean) from public, anon;
grant execute on function public.set_individual_shared(uuid, text, boolean) to authenticated;
