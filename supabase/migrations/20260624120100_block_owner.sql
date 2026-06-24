-- Agenda blocks gain an optional human owner (design: builder block properties
-- "Owner" field; surfaced on the overview agenda + builder views). Free-text to
-- mirror action_item.owner_name rather than forcing a membership FK, so a block
-- can be owned by anyone the facilitator names.

alter table public.block
  add column if not exists owner_name text;

comment on column public.block.owner_name is
  'Optional human owner/facilitator responsible for this agenda block.';
