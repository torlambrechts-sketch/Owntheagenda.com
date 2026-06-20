-- =====================================================================
-- Flow composer — Phase D. create_flow_steps stands up a Flow from an
-- explicit list of step boxes composed in the builder, instead of the
-- fixed three-step seed. The array is [{kind, title}, ...]; the first step
-- opens active, the rest pending. Same engine, same gates.
-- =====================================================================

create or replace function public.create_flow_steps(
  p_workspace uuid, p_title text, p_team uuid, p_min_responses int, p_steps jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int := greatest(3, coalesce(p_min_responses, 3)); v_ord int := 0; r record;
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required' using errcode = '22023';
  end if;
  if p_steps is null or jsonb_array_length(p_steps) = 0 then
    raise exception 'at least one step required' using errcode = '22023';
  end if;

  insert into public.program (workspace_id, team_id, title, kind, min_responses, created_by)
  values (p_workspace, p_team, btrim(p_title), 'flow', v_n, (select auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_steps) with ordinality as e(elem, ord) loop
    if (r.elem ->> 'kind') not in
       ('assessment','launch','interpret','workshop','commit','repulse','branch','custom') then
      raise exception 'bad step kind: %', r.elem ->> 'kind' using errcode = '22023';
    end if;
    v_ord := v_ord + 1;
    insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate)
    values (
      v_id, p_workspace, v_ord, r.elem ->> 'kind',
      coalesce(nullif(btrim(r.elem ->> 'title'), ''), initcap(r.elem ->> 'kind')),
      case when v_ord = 1 then 'active' else 'pending' end,
      case (r.elem ->> 'kind')
        when 'launch' then 'Hold until ' || v_n || ' people respond'
        when 'branch' then 'Routes to a workshop based on the results'
        else null end
    );
  end loop;
  return v_id;
end;
$$;

grant execute on function public.create_flow_steps(uuid, text, uuid, int, jsonb) to authenticated;
revoke execute on function public.create_flow_steps(uuid, text, uuid, int, jsonb) from public, anon;
