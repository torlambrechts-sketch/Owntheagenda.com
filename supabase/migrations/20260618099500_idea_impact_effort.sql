-- F3: impact/effort prioritization on cards (1 = low, 2 = high; null = unsorted).
-- Authors and the facilitator can set them (existing idea_update RLS covers it).
alter table public.idea add column if not exists impact smallint;
alter table public.idea add column if not exists effort smallint;
