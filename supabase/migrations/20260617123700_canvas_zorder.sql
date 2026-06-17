-- Z-order for canvas shapes (bring-to-front / send-to-back).
alter table public.canvas_object add column if not exists z integer not null default 0;
