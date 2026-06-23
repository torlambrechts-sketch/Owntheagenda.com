-- =====================================================================
-- Member HR detail + competence. Backs the participant profile's contact
-- row and competence card with real data (replacing the design's mock
-- fields) — workspace-scoped, so the same person can carry different
-- details/certifications in different workspaces.
--
-- Reads: any workspace member (the profile is visible to admins + the
-- member, and teammates already share the page's other data). Writes: the
-- member themselves or a workspace admin, via the security-definer RPCs —
-- no direct insert/update/delete policy, matching assessment_assignment.
-- =====================================================================

-- ---- contact / HR attributes (one row per member per workspace) ------
create table if not exists public.member_detail (
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  job_title    text,
  department   text,
  location     text,
  phone        text,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table public.member_detail enable row level security;
drop policy if exists member_detail_select on public.member_detail;
create policy member_detail_select on public.member_detail
  for select to authenticated using (private.is_workspace_member(workspace_id));
create trigger set_member_detail_updated before update on public.member_detail
  for each row execute function private.set_updated_at();
grant select on public.member_detail to authenticated;

-- ---- competence / certifications, with an optional expiry ------------
create table if not exists public.member_competence (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  issued_at    date,
  expires_at   date,
  created_at   timestamptz not null default now()
);
create index if not exists member_competence_user
  on public.member_competence (workspace_id, user_id);
alter table public.member_competence enable row level security;
drop policy if exists member_competence_select on public.member_competence;
create policy member_competence_select on public.member_competence
  for select to authenticated using (private.is_workspace_member(workspace_id));
grant select on public.member_competence to authenticated;

-- ---- writes: self or workspace admin --------------------------------
create or replace function public.set_member_detail(
  p_workspace uuid, p_user uuid,
  p_job_title text, p_department text, p_location text, p_phone text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_user = (select auth.uid()) or private.is_workspace_admin(p_workspace)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.membership m
    where m.workspace_id = p_workspace and m.user_id = p_user and m.status = 'active'
  ) then
    raise exception 'not a member' using errcode = '23503';
  end if;
  insert into public.member_detail (workspace_id, user_id, job_title, department, location, phone)
  values (p_workspace, p_user,
          nullif(btrim(p_job_title), ''), nullif(btrim(p_department), ''),
          nullif(btrim(p_location), ''), nullif(btrim(p_phone), ''))
  on conflict (workspace_id, user_id) do update
    set job_title = excluded.job_title, department = excluded.department,
        location = excluded.location, phone = excluded.phone;
end; $$;

create or replace function public.add_member_competence(
  p_workspace uuid, p_user uuid, p_name text,
  p_issued date default null, p_expires date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (p_user = (select auth.uid()) or private.is_workspace_admin(p_workspace)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'name required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.membership m
    where m.workspace_id = p_workspace and m.user_id = p_user and m.status = 'active'
  ) then
    raise exception 'not a member' using errcode = '23503';
  end if;
  insert into public.member_competence (workspace_id, user_id, name, issued_at, expires_at)
  values (p_workspace, p_user, btrim(p_name), p_issued, p_expires)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.delete_member_competence(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_user uuid;
begin
  select workspace_id, user_id into v_ws, v_user
    from public.member_competence where id = p_id;
  if v_ws is null then return; end if;
  if not (v_user = (select auth.uid()) or private.is_workspace_admin(v_ws)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.member_competence where id = p_id;
end; $$;

revoke execute on function public.set_member_detail(uuid, uuid, text, text, text, text) from public, anon;
grant  execute on function public.set_member_detail(uuid, uuid, text, text, text, text) to authenticated;
revoke execute on function public.add_member_competence(uuid, uuid, text, date, date) from public, anon;
grant  execute on function public.add_member_competence(uuid, uuid, text, date, date) to authenticated;
revoke execute on function public.delete_member_competence(uuid) from public, anon;
grant  execute on function public.delete_member_competence(uuid) to authenticated;
