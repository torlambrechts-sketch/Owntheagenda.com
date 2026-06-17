-- =====================================================================
-- OwnTheAgenda · 0023 · Persisted session summary (AI proposes, humans decide)
-- ---------------------------------------------------------------------
-- The synthesis is now a durable draft that a facilitator approves before
-- it is treated as final — never a silently-committed conclusion.
-- Regenerating resets approval.
-- =====================================================================

create table public.session_summary (
  session_id   uuid primary key references public.session(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  content      jsonb not null,
  ai           boolean not null default false,
  approved_at  timestamptz,
  approved_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_updated_at before update on public.session_summary
  for each row execute function private.set_updated_at();

-- save / regenerate a draft (any session member); regeneration clears approval
create or replace function public.save_summary(p_session uuid, p_content jsonb, p_ai boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select workspace_id into v_ws from public.session where id = p_session;
  insert into public.session_summary (session_id, workspace_id, content, ai)
  values (p_session, v_ws, p_content, coalesce(p_ai,false))
  on conflict (session_id) do update
    set content = excluded.content, ai = excluded.ai,
        approved_at = null, approved_by = null, updated_at = now();
end;
$$;

-- approve the current draft (facilitator only)
create or replace function public.approve_summary(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_session_facilitator(p_session) then raise exception 'facilitator only' using errcode = '42501'; end if;
  update public.session_summary
    set approved_at = now(), approved_by = (select auth.uid())
  where session_id = p_session;
end;
$$;

grant execute on function public.save_summary(uuid, jsonb, boolean), public.approve_summary(uuid) to authenticated;
revoke execute on function public.save_summary(uuid, jsonb, boolean), public.approve_summary(uuid) from public, anon;

grant select on public.session_summary to authenticated;
alter table public.session_summary enable row level security;
create policy session_summary_select on public.session_summary
  for select to authenticated using (private.can_read_session(session_id));
