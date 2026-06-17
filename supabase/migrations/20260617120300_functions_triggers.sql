-- =====================================================================
-- OwnTheAgenda · 0003 · Functions, RPCs and integrity triggers
-- ---------------------------------------------------------------------
-- Every function is SECURITY DEFINER with a pinned empty search_path
-- (prevents search_path hijacking and satisfies the security advisor).
-- Because search_path is empty, `citext` (which lives in the extensions
-- schema) is not visible by its bare name or operators, so functions
-- compare email/slug columns via `lower(col::text)` instead.
--
-- The `private.*` helpers bypass RLS so the policies in 0004 can call
-- them without recursion. The `public.*` RPCs are the only write paths
-- for tenant provisioning and invitations, and are exposed to the API.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RLS helper predicates (private; called from policies in 0004)
-- ---------------------------------------------------------------------
create or replace function private.is_workspace_member(p_workspace uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.membership m
    where m.workspace_id = p_workspace
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.workspace_role(p_workspace uuid)
returns public.workspace_role language sql security definer stable set search_path = '' as $$
  select m.role from public.membership m
  where m.workspace_id = p_workspace
    and m.user_id = (select auth.uid())
    and m.status = 'active'
  limit 1;
$$;

create or replace function private.is_workspace_admin(p_workspace uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.membership m
    where m.workspace_id = p_workspace
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

-- Do the caller and p_user share any workspace? (profile visibility)
create or replace function private.shares_workspace(p_user uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.membership me
    join public.membership them on them.workspace_id = me.workspace_id
    where me.user_id = (select auth.uid()) and me.status = 'active'
      and them.user_id = p_user            and them.status = 'active'
  );
$$;

create or replace function private.team_workspace(p_team uuid)
returns uuid language sql security definer stable set search_path = '' as $$
  select workspace_id from public.team where id = p_team;
$$;

-- Visible if you belong to the team's workspace.
create or replace function private.can_read_team(p_team uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select private.is_workspace_member(private.team_workspace(p_team));
$$;

-- Manageable if you're a workspace admin, the named team lead, or a member flagged is_lead.
create or replace function private.can_manage_team(p_team uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select private.is_workspace_admin(private.team_workspace(p_team))
      or exists (select 1 from public.team t
                  where t.id = p_team and t.lead_user_id = (select auth.uid()))
      or exists (select 1 from public.team_member tm
                  where tm.team_id = p_team and tm.user_id = (select auth.uid()) and tm.is_lead);
$$;

-- Helpers are callable by the API role only as policy predicates.
grant execute on function
  private.is_workspace_member(uuid),
  private.workspace_role(uuid),
  private.is_workspace_admin(uuid),
  private.shares_workspace(uuid),
  private.team_workspace(uuid),
  private.can_read_team(uuid),
  private.can_manage_team(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- Append-only audit writer (internal)
-- ---------------------------------------------------------------------
create or replace function private.write_audit(
  p_workspace uuid, p_actor uuid, p_action text,
  p_entity_type text default null, p_entity_id uuid default null, p_meta jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_workspace, p_actor, p_action, p_entity_type, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- auth.users -> profile mirror
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile (id, email, full_name, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Company sign-up: create a workspace and make the caller its owner.
-- ---------------------------------------------------------------------
create or replace function public.provision_workspace(p_name text, p_slug text default null)
returns public.workspace language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_base text;
  v_slug text;
  v_try  int := 0;
  v_ws   public.workspace;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'workspace name is required' using errcode = '22023';
  end if;

  -- Normalise a base slug, then ensure uniqueness with a short suffix.
  v_base := lower(regexp_replace(coalesce(nullif(btrim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := btrim(v_base, '-');
  if length(v_base) = 0 then v_base := 'workspace'; end if;
  v_base := left(v_base, 32);
  v_slug := v_base;
  while exists (select 1 from public.workspace w where lower(w.slug::text) = v_slug) loop
    v_try := v_try + 1;
    v_slug := left(v_base, 32) || '-' || substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 5);
    if v_try > 8 then
      raise exception 'could not allocate a unique slug' using errcode = '40001';
    end if;
  end loop;

  insert into public.workspace (name, slug, created_by)
  values (btrim(p_name), v_slug, v_uid)
  returning * into v_ws;

  insert into public.membership (workspace_id, user_id, role)
  values (v_ws.id, v_uid, 'owner');

  perform private.write_audit(v_ws.id, v_uid, 'workspace.created', 'workspace', v_ws.id,
                              jsonb_build_object('name', v_ws.name, 'slug', v_ws.slug::text));
  return v_ws;
end;
$$;

-- ---------------------------------------------------------------------
-- Create an invitation. Returns the RAW token once (caller emails it).
-- ---------------------------------------------------------------------
create or replace function public.create_invitation(
  p_workspace uuid,
  p_email text,
  p_role public.workspace_role default 'member',
  p_team uuid default null,
  p_role_title text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_token text;
  v_hash  text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Workspace admins may invite; a team lead may invite into their own team.
  if not private.is_workspace_admin(p_workspace)
     and not (p_team is not null and private.can_manage_team(p_team)) then
    raise exception 'insufficient privileges to invite' using errcode = '42501';
  end if;

  -- Only an admin may grant elevated roles.
  if p_role in ('owner', 'admin') and not private.is_workspace_admin(p_workspace) then
    raise exception 'only an admin may invite an admin or owner' using errcode = '42501';
  end if;

  if p_team is not null then
    if not exists (select 1 from public.team t where t.id = p_team and t.workspace_id = p_workspace) then
      raise exception 'team does not belong to the workspace' using errcode = '23503';
    end if;
  end if;

  if exists (select 1 from public.membership m
             join public.profile pr on pr.id = m.user_id
             where m.workspace_id = p_workspace
               and lower(pr.email::text) = lower(p_email)
               and m.status = 'active') then
    raise exception 'that person is already a member of this workspace' using errcode = '23505';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.invitation (workspace_id, team_id, email, role, role_title, token_hash, invited_by)
  values (p_workspace, p_team, p_email, p_role, p_role_title, v_hash, v_uid)
  on conflict (workspace_id, email) where (status = 'pending')
  do update set team_id     = excluded.team_id,
                role        = excluded.role,
                role_title  = excluded.role_title,
                token_hash  = excluded.token_hash,
                invited_by  = excluded.invited_by,
                expires_at  = now() + interval '7 days',
                updated_at  = now();

  perform private.write_audit(p_workspace, v_uid, 'invitation.created', 'invitation', null,
                              jsonb_build_object('email', p_email, 'role', p_role, 'team', p_team));
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------
-- Accept an invitation by raw token. Atomic: membership (+ team) + mark.
-- ---------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns public.workspace language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := (select auth.email());
  v_hash  text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_inv   public.invitation;
  v_ws    public.workspace;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_inv from public.invitation
  where token_hash = v_hash and status = 'pending'
  for update;

  if v_inv.id is null then
    raise exception 'invitation is invalid or already used' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then
    update public.invitation set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired' using errcode = '22023';
  end if;
  if lower(v_inv.email::text) <> lower(coalesce(v_email, '')) then
    raise exception 'this invitation was issued to a different email' using errcode = '42501';
  end if;

  insert into public.membership (workspace_id, user_id, role)
  values (v_inv.workspace_id, v_uid, v_inv.role)
  on conflict (workspace_id, user_id) do update set status = 'active';

  if v_inv.team_id is not null then
    insert into public.team_member (team_id, user_id, role_title)
    values (v_inv.team_id, v_uid, v_inv.role_title)
    on conflict (team_id, user_id) do nothing;
  end if;

  update public.invitation
  set status = 'accepted', accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  select * into v_ws from public.workspace where id = v_inv.workspace_id;
  perform private.write_audit(v_inv.workspace_id, v_uid, 'invitation.accepted', 'invitation', v_inv.id,
                              jsonb_build_object('role', v_inv.role, 'team', v_inv.team_id));
  return v_ws;
end;
$$;

-- ---------------------------------------------------------------------
-- A user toggles consent on their OWN team_member row (scoped RPC so a
-- broad self-update policy can't be abused to escalate other columns).
-- ---------------------------------------------------------------------
create or replace function public.set_team_consent(p_team_member uuid, p_consent boolean)
returns public.team_member language plpgsql security definer set search_path = '' as $$
declare v_row public.team_member;
begin
  update public.team_member
  set consent_share = p_consent
  where id = p_team_member and user_id = (select auth.uid())
  returning * into v_row;
  if v_row.id is null then
    raise exception 'team member not found or not yours' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

grant execute on function
  public.provision_workspace(text, text),
  public.create_invitation(uuid, text, public.workspace_role, uuid, text),
  public.accept_invitation(text),
  public.set_team_consent(uuid, boolean)
to authenticated;

-- ---------------------------------------------------------------------
-- Integrity guards (enforced in the DB, not the app)
-- ---------------------------------------------------------------------

-- A workspace must always keep at least one active owner.
create or replace function private.guard_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_owners int;
begin
  v_ws := old.workspace_id;
  select count(*) into v_owners
  from public.membership
  where workspace_id = v_ws and role = 'owner' and status = 'active' and id <> old.id;

  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    v_owners := v_owners + 1;
  end if;

  if v_owners < 1 then
    raise exception 'a workspace must retain at least one active owner' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_last_owner on public.membership;
create trigger guard_last_owner
  before update or delete on public.membership
  for each row execute function private.guard_last_owner();

-- Team hierarchy: same-workspace parent, no self-parent, no cycles.
create or replace function private.guard_team_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cur uuid; v_depth int := 0;
begin
  if new.parent_team_id is not null then
    if new.parent_team_id = new.id then
      raise exception 'a team cannot be its own parent' using errcode = '23514';
    end if;
    if not exists (select 1 from public.team p
                   where p.id = new.parent_team_id and p.workspace_id = new.workspace_id) then
      raise exception 'parent team must be in the same workspace' using errcode = '23503';
    end if;
    v_cur := new.parent_team_id;
    while v_cur is not null and v_depth < 64 loop
      if v_cur = new.id then
        raise exception 'circular team hierarchy' using errcode = '23514';
      end if;
      select parent_team_id into v_cur from public.team where id = v_cur;
      v_depth := v_depth + 1;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_team_parent on public.team;
create trigger guard_team_parent
  before insert or update on public.team
  for each row execute function private.guard_team_parent();

-- A team member must be an active member of the team's workspace.
create or replace function private.guard_team_member_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.team where id = new.team_id;
  if v_ws is null then
    raise exception 'team not found' using errcode = '23503';
  end if;
  if not exists (select 1 from public.membership m
                 where m.workspace_id = v_ws and m.user_id = new.user_id and m.status = 'active') then
    raise exception 'user must be an active member of the team''s workspace' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_team_member_workspace on public.team_member;
create trigger guard_team_member_workspace
  before insert or update on public.team_member
  for each row execute function private.guard_team_member_workspace();
