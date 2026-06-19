-- =====================================================================
-- Card reactions + comments
-- ---------------------------------------------------------------------
-- Lightweight engagement on other people's idea cards, alongside the
-- existing dot-vote: emoji reactions (one row per person/emoji, toggled)
-- and threaded comments. Both are scoped to a session block, read by any
-- session member, and written only through SECURITY DEFINER RPCs so the
-- author is stamped server-side. Everything syncs via Realtime.
-- =====================================================================

create table public.idea_reaction (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.idea(id) on delete cascade,
  session_id  uuid not null references public.session(id) on delete cascade,
  block_ord   int  not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (idea_id, user_id, emoji)
);
create index idea_reaction_idea_idx  on public.idea_reaction (idea_id);
create index idea_reaction_block_idx on public.idea_reaction (session_id, block_ord);

create table public.idea_comment (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.idea(id) on delete cascade,
  session_id  uuid not null references public.session(id) on delete cascade,
  block_ord   int  not null,
  user_id     uuid references auth.users(id) on delete set null,
  author_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index idea_comment_idea_idx  on public.idea_comment (idea_id, created_at);
create index idea_comment_block_idx on public.idea_comment (session_id, block_ord);

-- Toggle one emoji reaction. Palette is fixed (anti-spam, predictable UI).
create or replace function public.idea_react_toggle(p_idea uuid, p_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_block int; v_uid uuid := (select auth.uid());
begin
  if p_emoji not in ('👍','🙌','🎯','💡','🔥','❓') then
    raise exception 'unsupported reaction' using errcode = '22023';
  end if;
  select session_id, block_ord into v_session, v_block from public.idea where id = p_idea;
  if v_session is null then raise exception 'idea not found' using errcode = '23503'; end if;
  if not private.can_read_session(v_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.idea_reaction where idea_id = p_idea and user_id = v_uid and emoji = p_emoji) then
    delete from public.idea_reaction where idea_id = p_idea and user_id = v_uid and emoji = p_emoji;
  else
    insert into public.idea_reaction (idea_id, session_id, block_ord, user_id, emoji)
    values (p_idea, v_session, v_block, v_uid, p_emoji);
  end if;
end;
$$;

-- Add a comment (author stamped server-side).
create or replace function public.idea_comment_add(p_idea uuid, p_body text)
returns public.idea_comment language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_block int; v_uid uuid := (select auth.uid()); v_name text; v_body text; v_row public.idea_comment;
begin
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception 'empty comment' using errcode = '22023'; end if;
  v_body := left(v_body, 1000);
  select session_id, block_ord into v_session, v_block from public.idea where id = p_idea;
  if v_session is null then raise exception 'idea not found' using errcode = '23503'; end if;
  if not private.can_read_session(v_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(display_name, full_name, email) into v_name from public.profile where id = v_uid;
  insert into public.idea_comment (idea_id, session_id, block_ord, user_id, author_name, body)
  values (p_idea, v_session, v_block, v_uid, v_name, v_body)
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.idea_react_toggle(uuid, text), public.idea_comment_add(uuid, text) to authenticated;
revoke execute on function public.idea_react_toggle(uuid, text), public.idea_comment_add(uuid, text) from public, anon;

-- ----- grants + RLS --------------------------------------------------
grant select on public.idea_reaction to authenticated;            -- writes via RPC
grant select, delete on public.idea_comment to authenticated;     -- insert via RPC; delete via policy

alter table public.idea_reaction enable row level security;
alter table public.idea_comment  enable row level security;

create policy idea_reaction_select on public.idea_reaction
  for select to authenticated using (private.can_read_session(session_id));
create policy idea_comment_select on public.idea_comment
  for select to authenticated using (private.can_read_session(session_id));
create policy idea_comment_delete on public.idea_comment
  for delete to authenticated
  using (private.can_read_session(session_id)
         and (user_id = (select auth.uid()) or private.is_session_facilitator(session_id)));

-- ----- realtime ------------------------------------------------------
alter table public.idea_reaction replica identity full;
alter table public.idea_comment  replica identity full;
alter publication supabase_realtime add table public.idea_reaction;
alter publication supabase_realtime add table public.idea_comment;
