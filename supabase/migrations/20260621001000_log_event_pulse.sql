-- Extend public.log_event to also resolve the 'pulse' entity, so team-pulse
-- lifecycle events (pulse.opened / pulse.closed) can be recorded alongside the
-- existing survey and workshop events. Same signature and guards as before.

create or replace function public.log_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
begin
  if p_entity_type = 'survey' then
    select workspace_id into v_ws from public.survey where id = p_entity_id;
  elsif p_entity_type = 'workshop' then
    select workspace_id into v_ws from public.workshop where id = p_entity_id;
  elsif p_entity_type = 'pulse' then
    select workspace_id into v_ws from public.pulse where id = p_entity_id;
  else
    raise exception 'log_event: unsupported entity_type %', p_entity_type
      using errcode = '22023';
  end if;

  if v_ws is null then
    raise exception 'log_event: entity not found' using errcode = '22023';
  end if;

  if not private.is_workspace_member(v_ws) then
    raise exception 'log_event: not a workspace member' using errcode = '42501';
  end if;

  perform private.write_audit(
    v_ws,
    (select auth.uid()),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.log_event(text, text, uuid, jsonb) to authenticated;
