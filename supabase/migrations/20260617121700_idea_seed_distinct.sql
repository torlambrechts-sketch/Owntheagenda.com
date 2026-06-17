-- =====================================================================
-- OwnTheAgenda · 0017 · idea_seed: dedupe options within the input too
-- ---------------------------------------------------------------------
-- The first cut deduped poll options against existing rows but not
-- against duplicates inside the same array, so a facilitator config with
-- a repeated option would seed it twice. Make the input set distinct.
-- =====================================================================

create or replace function public.idea_seed(p_session uuid, p_block_ord int, p_texts text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_session_facilitator(p_session) then
    raise exception 'facilitator only' using errcode = '42501';
  end if;
  insert into public.idea (session_id, block_ord, lane, text, author_name)
  select p_session, p_block_ord, 'option', s.t, 'Facilitator'
  from (select distinct btrim(x) as t from unnest(p_texts) as x where btrim(x) <> '') s
  where not exists (
    select 1 from public.idea i
    where i.session_id = p_session and i.block_ord = p_block_ord
      and i.lane = 'option' and i.text = s.t
  );
end;
$$;
