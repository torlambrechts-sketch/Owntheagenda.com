-- Company ID: a short shareable code so a new hire can self-join their company.
alter table public.workspace add column if not exists join_code text;

create or replace function private.new_join_code() returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  loop
    c := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists (select 1 from public.workspace where join_code = c);
  end loop;
  return c;
end;
$$;

create or replace function private.set_join_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.join_code is null then new.join_code := private.new_join_code(); end if;
  return new;
end;
$$;
drop trigger if exists workspace_set_join_code on public.workspace;
create trigger workspace_set_join_code before insert on public.workspace
  for each row execute function private.set_join_code();

-- backfill existing workspaces (per-row so codes stay unique within the batch)
do $$
declare r record;
begin
  for r in select id from public.workspace where join_code is null loop
    update public.workspace set join_code = private.new_join_code() where id = r.id;
  end loop;
end $$;

alter table public.workspace alter column join_code set not null;
create unique index if not exists workspace_join_code_uq on public.workspace(join_code);

-- Self-join by Company ID. Elevated roles (admin/manager) land 'pending' for an
-- admin to approve; employee/facilitator activate immediately. Never owner.
create or replace function public.join_workspace_by_code(p_code text, p_role public.workspace_role default 'member')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_ws public.workspace; v_status public.membership_status; v_ex public.membership;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_role = 'owner' then raise exception 'cannot self-assign owner' using errcode = '42501'; end if;
  select * into v_ws from public.workspace where join_code = upper(btrim(p_code)) and deleted_at is null;
  if v_ws.id is null then raise exception 'no company found for that Company ID' using errcode = '22023'; end if;
  select * into v_ex from public.membership where workspace_id = v_ws.id and user_id = v_uid;
  if v_ex.id is not null and v_ex.status = 'suspended' then
    raise exception 'your access to this company is suspended' using errcode = '42501';
  end if;
  if v_ex.id is not null and v_ex.status = 'active' then
    return jsonb_build_object('workspace_id', v_ws.id, 'slug', v_ws.slug, 'name', v_ws.name, 'status', 'active');
  end if;
  v_status := (case when p_role in ('admin','manager') then 'pending' else 'active' end)::public.membership_status;
  insert into public.membership (workspace_id, user_id, role, status)
  values (v_ws.id, v_uid, p_role, v_status)
  on conflict (workspace_id, user_id) do update set role = excluded.role, status = excluded.status, updated_at = now();
  perform private.write_audit(v_ws.id, v_uid, 'membership.join', 'membership', null::uuid,
    jsonb_build_object('role', p_role, 'status', v_status));
  return jsonb_build_object('workspace_id', v_ws.id, 'slug', v_ws.slug, 'name', v_ws.name, 'status', v_status::text);
end;
$$;
revoke execute on function public.join_workspace_by_code(text, public.workspace_role) from public, anon;
grant execute on function public.join_workspace_by_code(text, public.workspace_role) to authenticated;

-- The current user's pending join (for the "awaiting approval" screen).
create or replace function public.my_pending_membership()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('name', w.name, 'role', m.role::text)
  from public.membership m join public.workspace w on w.id = m.workspace_id
  where m.user_id = (select auth.uid()) and m.status = 'pending'
  order by m.created_at desc limit 1;
$$;
revoke execute on function public.my_pending_membership() from public, anon;
grant execute on function public.my_pending_membership() to authenticated;
