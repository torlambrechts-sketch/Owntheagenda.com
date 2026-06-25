-- Standalone Whiteboards (the design's "Whiteboards" surface) — persistent,
-- workspace-collaborative boards, independent of a live workshop session. The
-- same element model as the in-run canvas, stored at the design's pixel
-- coordinates. Per-element comments/reactions live inline as jsonb (matching the
-- prototype's element.comments / element.reactions).

create table if not exists whiteboard (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id) on delete cascade,
  team_id uuid references team(id) on delete set null,
  title text not null default 'Untitled whiteboard',
  template_key text,
  accent text not null default 'green',
  icon text not null default 'square',
  is_template boolean not null default false,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whiteboard_ws_idx on whiteboard(workspace_id, updated_at desc);

create table if not exists whiteboard_object (
  id uuid primary key default gen_random_uuid(),
  whiteboard_id uuid not null references whiteboard(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  kind text not null default 'note',
  text text not null default '',
  fill text,
  stroke text,
  color text,
  x real not null default 0,
  y real not null default 0,
  w real,
  h real,
  font_size real,
  points jsonb,
  width real,
  opacity real,
  variant text,
  src_id uuid references whiteboard_object(id) on delete cascade,
  dst_id uuid references whiteboard_object(id) on delete cascade,
  line_style text,
  z int not null default 0,
  comments jsonb not null default '[]'::jsonb,
  reactions jsonb not null default '{}'::jsonb,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whiteboard_object_board_idx on whiteboard_object(whiteboard_id);
create index if not exists whiteboard_object_src_idx on whiteboard_object(src_id) where src_id is not null;
create index if not exists whiteboard_object_dst_idx on whiteboard_object(dst_id) where dst_id is not null;

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists set_updated_at on whiteboard;
create trigger set_updated_at before update on whiteboard
  for each row execute function private.touch_updated_at();

create or replace function private.set_whiteboard_object_defaults() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_ws uuid; v_name text;
begin
  select workspace_id into v_ws from whiteboard where id = new.whiteboard_id;
  if v_ws is null then raise exception 'whiteboard not found'; end if;
  new.workspace_id := v_ws;
  if new.author_id is null then new.author_id := auth.uid(); end if;
  select coalesce(full_name, display_name, email) into v_name from profile where id = new.author_id;
  new.author_name := coalesce(new.author_name, v_name);
  update whiteboard set updated_at = now() where id = new.whiteboard_id;
  return new;
end $$;

drop trigger if exists set_whiteboard_object_defaults on whiteboard_object;
create trigger set_whiteboard_object_defaults before insert on whiteboard_object
  for each row execute function private.set_whiteboard_object_defaults();

drop trigger if exists set_updated_at on whiteboard_object;
create trigger set_updated_at before update on whiteboard_object
  for each row execute function private.touch_updated_at();

alter table whiteboard enable row level security;
alter table whiteboard_object enable row level security;

drop policy if exists whiteboard_select on whiteboard;
create policy whiteboard_select on whiteboard for select
  using (private.is_workspace_member(workspace_id));
drop policy if exists whiteboard_insert on whiteboard;
create policy whiteboard_insert on whiteboard for insert
  with check (private.is_workspace_member(workspace_id));
drop policy if exists whiteboard_update on whiteboard;
create policy whiteboard_update on whiteboard for update
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
drop policy if exists whiteboard_delete on whiteboard;
create policy whiteboard_delete on whiteboard for delete
  using (private.is_workspace_admin(workspace_id) or created_by = auth.uid());

drop policy if exists whiteboard_object_select on whiteboard_object;
create policy whiteboard_object_select on whiteboard_object for select
  using (private.is_workspace_member(workspace_id));
drop policy if exists whiteboard_object_insert on whiteboard_object;
create policy whiteboard_object_insert on whiteboard_object for insert
  with check (private.is_workspace_member(workspace_id));
drop policy if exists whiteboard_object_update on whiteboard_object;
create policy whiteboard_object_update on whiteboard_object for update
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
drop policy if exists whiteboard_object_delete on whiteboard_object;
create policy whiteboard_object_delete on whiteboard_object for delete
  using (private.is_workspace_member(workspace_id));

alter table whiteboard_object replica identity full;
alter publication supabase_realtime add table whiteboard_object;
