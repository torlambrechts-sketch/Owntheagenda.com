-- =====================================================================
-- OwnTheAgenda · 0013 · Live canvas (multiplayer sticky notes)
-- ---------------------------------------------------------------------
-- A 'canvas' activity block gets a shared board. Every participant in
-- the session room can add / move / edit / remove sticky notes; all
-- clients subscribe via Supabase Realtime (Postgres Changes) and
-- re-render. Concurrency is last-write-wins (MVP), which is what the
-- architecture calls for. Positions are normalized 0..1 so the board
-- renders consistently across screen sizes.
-- =====================================================================

create table public.canvas_object (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.session(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  block_ord    int  not null,
  kind         text not null default 'sticky',
  text         text not null default '',
  color        text not null default 'lemon',
  x            real not null default 0.5,   -- normalized [0,1] within the board
  y            real not null default 0.5,
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index canvas_object_session_idx on public.canvas_object (session_id, block_ord);

create trigger set_updated_at before update on public.canvas_object
  for each row execute function private.set_updated_at();

-- Denormalize workspace_id from the session and stamp the author server-side
-- (author_id is forced to the caller — never trust a client-supplied value).
create or replace function private.set_canvas_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.session where id = new.session_id;
  if new.workspace_id is null then
    raise exception 'session not found' using errcode = '23503';
  end if;
  new.author_id := (select auth.uid());
  if new.author_name is null or btrim(new.author_name) = '' then
    select coalesce(display_name, full_name, email)
      into new.author_name
    from public.profile where id = (select auth.uid());
  end if;
  return new;
end;
$$;
create trigger set_canvas_defaults before insert on public.canvas_object
  for each row execute function private.set_canvas_defaults();

-- ----- grants + RLS --------------------------------------------------
grant select, insert, update, delete on public.canvas_object to authenticated;

alter table public.canvas_object enable row level security;

-- Anyone who can read the session (a workspace member) shares its board.
create policy canvas_object_select on public.canvas_object
  for select to authenticated using (private.can_read_session(session_id));
create policy canvas_object_insert on public.canvas_object
  for insert to authenticated with check (private.can_read_session(session_id));
create policy canvas_object_update on public.canvas_object
  for update to authenticated
  using (private.can_read_session(session_id))
  with check (private.can_read_session(session_id));
create policy canvas_object_delete on public.canvas_object
  for delete to authenticated using (private.can_read_session(session_id));

-- ----- realtime (Postgres Changes) -----------------------------------
alter table public.canvas_object replica identity full;
alter publication supabase_realtime add table public.canvas_object;
