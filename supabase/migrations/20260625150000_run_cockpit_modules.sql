-- Phase 5 run-cockpit support. The design's per-type modules mostly reuse the
-- existing idea/idea_vote/idea_reaction/idea_comment/action_item/canvas_object
-- tables. These additions cover the gaps:
--   * SMART action items gain priority + detail (design "actions" module).
--   * Decisions become block-scoped (design "decision" module groups per block).
--   * A block-level discussion thread (cockpit right panel) + inline reactions.

alter table action_item add column if not exists priority text;
alter table action_item add column if not exists detail text;

alter table decision add column if not exists block_ord int;

create table if not exists session_comment (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references session(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  block_ord int not null,
  user_id uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists session_comment_block_idx on session_comment(session_id, block_ord, created_at);

create or replace function private.set_session_comment_defaults() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_ws uuid; v_name text;
begin
  select workspace_id into v_ws from session where id = new.session_id;
  if v_ws is null then raise exception 'session not found'; end if;
  new.workspace_id := v_ws;
  if new.user_id is null then new.user_id := auth.uid(); end if;
  select coalesce(full_name, display_name, email) into v_name from profile where id = new.user_id;
  new.author_name := coalesce(new.author_name, v_name);
  return new;
end $$;

drop trigger if exists set_session_comment_defaults on session_comment;
create trigger set_session_comment_defaults before insert on session_comment
  for each row execute function private.set_session_comment_defaults();

alter table session_comment enable row level security;

drop policy if exists session_comment_select on session_comment;
create policy session_comment_select on session_comment for select
  using (private.can_read_session(session_id));
drop policy if exists session_comment_insert on session_comment;
create policy session_comment_insert on session_comment for insert
  with check (private.can_read_session(session_id));
drop policy if exists session_comment_update on session_comment;
create policy session_comment_update on session_comment for update
  using (private.can_read_session(session_id))
  with check (private.can_read_session(session_id));
drop policy if exists session_comment_delete on session_comment;
create policy session_comment_delete on session_comment for delete
  using (user_id = auth.uid() or private.can_read_session(session_id));

alter table session_comment replica identity full;
alter publication supabase_realtime add table session_comment;
