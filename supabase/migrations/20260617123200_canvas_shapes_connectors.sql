-- Extend the live canvas from sticky-only to a lightweight diagramming surface:
-- shapes (rect/ellipse/diamond/text), freehand pen/marker strokes, and
-- connectors that link shapes edge-to-edge. All additive + nullable, so existing
-- sticky rows and the realtime/RLS/trigger setup keep working unchanged.
alter table public.canvas_object
  add column if not exists w          real,                 -- normalized width  (shapes/text)
  add column if not exists h          real,                 -- normalized height (shapes/text)
  add column if not exists points     jsonb,                -- pen/marker path: [[x,y], ...] normalized
  add column if not exists src_id     uuid references public.canvas_object(id) on delete cascade,
  add column if not exists dst_id     uuid references public.canvas_object(id) on delete cascade,
  add column if not exists src_anchor text,                 -- 'n' | 'e' | 's' | 'w'
  add column if not exists dst_anchor text,
  add column if not exists line_style text,                 -- 'straight' | 'curved' | 'rounded'
  add column if not exists stroke     text,                 -- stroke / border colour
  add column if not exists fill       text,                 -- fill colour (shapes)
  add column if not exists stroke_w   real,                 -- stroke width (px) for pen/marker/connector
  add column if not exists variant    text;                 -- 'pen' | 'marker' (draw kind)

create index if not exists canvas_object_src_idx on public.canvas_object(src_id) where src_id is not null;
create index if not exists canvas_object_dst_idx on public.canvas_object(dst_id) where dst_id is not null;
