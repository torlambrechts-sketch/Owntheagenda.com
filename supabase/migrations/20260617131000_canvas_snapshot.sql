-- A saved canvas: the serialized objects of one session's canvas block, kept as a
-- durable, reusable artifact (survives the session). Re-rendered for preview/PNG
-- and used to pre-seed a fresh session ("start from this canvas").
create table if not exists public.canvas_snapshot (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.session(id) on delete set null,
  workshop_id uuid not null references public.workshop(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  block_ord int not null,
  title text,
  data jsonb not null default '[]'::jsonb,
  object_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists canvas_snapshot_workshop_idx on public.canvas_snapshot(workshop_id, created_at desc);

alter table public.canvas_snapshot enable row level security;
drop policy if exists canvas_snapshot_read on public.canvas_snapshot;
create policy canvas_snapshot_read on public.canvas_snapshot
  for select to authenticated using (private.is_workspace_member(workspace_id));

-- Save the current objects of a session's canvas block as a snapshot. Any member
-- who can read the session. Settings row (kind='__board') is excluded.
create or replace function public.save_canvas_snapshot(p_session uuid, p_block_ord int, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_workshop uuid; v_data jsonb; v_count int; v_id uuid;
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select workspace_id, workshop_id into v_ws, v_workshop from public.session where id = p_session;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'kind', kind, 'text', text, 'color', color, 'x', x, 'y', y, 'w', w, 'h', h,
           'points', points, 'src_id', src_id, 'dst_id', dst_id, 'src_anchor', src_anchor, 'dst_anchor', dst_anchor,
           'line_style', line_style, 'stroke', stroke, 'fill', fill, 'stroke_w', stroke_w, 'variant', variant,
           'z', z, 'author_name', author_name) order by z nulls first, created_at), '[]'::jsonb), count(*)
    into v_data, v_count
  from public.canvas_object where session_id = p_session and block_ord = p_block_ord and kind <> '__board';
  if v_count = 0 then raise exception 'canvas is empty' using errcode = '22023'; end if;
  insert into public.canvas_snapshot (session_id, workshop_id, workspace_id, block_ord, title, data, object_count, created_by)
  values (p_session, v_workshop, v_ws, p_block_ord, nullif(p_title, ''), v_data, v_count, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.save_canvas_snapshot(uuid, int, text) from public, anon;
grant execute on function public.save_canvas_snapshot(uuid, int, text) to authenticated;

-- Seed a target session's canvas block from a snapshot: clears the block, then
-- re-creates every object with fresh ids, remapping connector endpoints so links
-- survive the copy. Caller must be able to edit the target session.
create or replace function public.seed_canvas_from_snapshot(p_snapshot uuid, p_session uuid, p_block_ord int)
returns int language plpgsql security definer set search_path = '' as $$
declare v_data jsonb; v_ws uuid; v_n int;
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select data, workspace_id into v_data, v_ws from public.canvas_snapshot where id = p_snapshot;
  if v_data is null then raise exception 'snapshot not found' using errcode = 'P0002'; end if;
  if not private.is_workspace_member(v_ws) then raise exception 'forbidden' using errcode = '42501'; end if;

  delete from public.canvas_object where session_id = p_session and block_ord = p_block_ord and kind <> '__board';

  with src as (
    select * from jsonb_to_recordset(v_data) as o(
      "id" uuid, "kind" text, "text" text, "color" text, "x" real, "y" real, "w" real, "h" real,
      "points" jsonb, "src_id" uuid, "dst_id" uuid, "src_anchor" text, "dst_anchor" text,
      "line_style" text, "stroke" text, "fill" text, "stroke_w" real, "variant" text, "z" int)
  ),
  m as (select "id" as old, gen_random_uuid() as new from src)
  insert into public.canvas_object (id, session_id, block_ord, kind, text, color, x, y, w, h, points, src_id, dst_id, src_anchor, dst_anchor, line_style, stroke, fill, stroke_w, variant, z)
  select m.new, p_session, p_block_ord, s."kind", s."text", s."color", s."x", s."y", s."w", s."h", s."points",
         ms.new, md.new, s."src_anchor", s."dst_anchor", s."line_style", s."stroke", s."fill", s."stroke_w", s."variant", s."z"
  from src s
  join m on m.old = s."id"
  left join m ms on ms.old = s."src_id"
  left join m md on md.old = s."dst_id";
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.seed_canvas_from_snapshot(uuid, uuid, int) from public, anon;
grant execute on function public.seed_canvas_from_snapshot(uuid, uuid, int) to authenticated;
