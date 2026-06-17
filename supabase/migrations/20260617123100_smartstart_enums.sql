-- Start Smart: new run-mode activity types (scaffolding for the SmartStart build).
-- Added separately because a new enum value cannot be USED in the same transaction
-- it is added in. Safe/additive — no table references these yet.
alter type public.activity_type add value if not exists 'manual';
alter type public.activity_type add value if not exists 'charter';
alter type public.activity_type add value if not exists 'assess';
