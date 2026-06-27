-- Scalability + security hardening for the builder kanban's drag-to-reorder.
-- The client action previously issued one UPDATE per block (O(N) round-trips) and
-- relied solely on per-row RLS. This RPC does the whole relayout in a single
-- statement, gated once by can_manage_workshop, and scoped to b.workshop_id =
-- p_workshop so a forged payload can never touch blocks in another workshop.
-- Array order (ordinality) is the new ord; phase '' / absent → null (derive).

create or replace function public.set_agenda_layout(p_workshop uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead/admin can edit this agenda' using errcode = '42501';
  end if;
  update public.block b
     set ord = e.idx::int,
         phase = nullif(e.phase, '')
    from (
      select (val->>'id')::uuid as id,
             ord as idx,
             val->>'phase' as phase
      from jsonb_array_elements(p_items) with ordinality as t(val, ord)
    ) e
   where b.id = e.id
     and b.workshop_id = p_workshop;
end;
$$;
revoke execute on function public.set_agenda_layout(uuid, jsonb) from public, anon;
grant execute on function public.set_agenda_layout(uuid, jsonb) to authenticated;
