-- =====================================================================
-- OwnTheAgenda · 0021 · Psychological-safety mechanics
-- ---------------------------------------------------------------------
-- The #1 predictor of team effectiveness (Edmondson 1999; Project
-- Aristotle) is engineered, not hoped for:
--   * Anonymous cards — author identity is masked on the card.
--   * Silent-then-reveal (brainwrite) — on a block flagged silent, a
--     participant sees only their OWN cards until the facilitator
--     reveals, preventing loud-voice anchoring before independent
--     ideation. Enforced in RLS, not just the UI.
-- =====================================================================

alter table public.idea add column if not exists is_anonymous boolean not null default false;

-- mask author name on anonymous cards (author_id is retained for access
-- control + own-delete, but is never surfaced as a name)
create or replace function private.set_idea_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.session where id = new.session_id;
  if new.workspace_id is null then
    raise exception 'session not found' using errcode = '23503';
  end if;
  new.author_id := (select auth.uid());
  if new.is_anonymous then
    new.author_name := null;
  elsif new.author_name is null or btrim(new.author_name) = '' then
    select coalesce(display_name, full_name, email)
      into new.author_name
    from public.profile where id = (select auth.uid());
  end if;
  return new;
end;
$$;

-- per-(session, block) reveal marker for silent ideation
create table public.session_reveal (
  session_id  uuid not null references public.session(id) on delete cascade,
  block_ord   int  not null,
  revealed_at timestamptz not null default now(),
  primary key (session_id, block_ord)
);

create or replace function public.reveal_block(p_session uuid, p_block_ord int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_session_facilitator(p_session) then
    raise exception 'facilitator only' using errcode = '42501';
  end if;
  insert into public.session_reveal (session_id, block_ord)
  values (p_session, p_block_ord)
  on conflict (session_id, block_ord) do nothing;
end;
$$;
grant execute on function public.reveal_block(uuid, int) to authenticated;
revoke execute on function public.reveal_block(uuid, int) from public, anon;

-- is a block's content visible to everyone? (ended session, explicit
-- reveal, or the block simply isn't a silent one)
create or replace function private.block_revealed(p_session uuid, p_block_ord int)
returns boolean language sql security definer stable set search_path = '' as $$
  select
    (select status from public.session where id = p_session) = 'ended'
    or exists (select 1 from public.session_reveal r where r.session_id = p_session and r.block_ord = p_block_ord)
    or not coalesce(
      (select (b.config ->> 'silent')::boolean
       from public.block b join public.session s on s.workshop_id = b.workshop_id
       where s.id = p_session and b.ord = p_block_ord),
      false);
$$;
grant execute on function private.block_revealed(uuid, int) to authenticated;

-- reveal-aware idea visibility (members only; own cards always; silent
-- blocks hidden from others until revealed)
drop policy idea_select on public.idea;
create policy idea_select on public.idea
  for select to authenticated
  using (
    private.can_read_session(session_id)
    and (
      author_id = (select auth.uid())
      or private.is_session_facilitator(session_id)
      or private.block_revealed(session_id, block_ord)
    )
  );

grant select on public.session_reveal to authenticated;
alter table public.session_reveal enable row level security;
create policy session_reveal_select on public.session_reveal
  for select to authenticated using (private.can_read_session(session_id));

alter table public.session_reveal replica identity full;
alter publication supabase_realtime add table public.session_reveal;
