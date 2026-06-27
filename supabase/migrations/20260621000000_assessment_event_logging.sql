-- Assessment / workshop event logging.
--
-- The app already has an append-only `public.audit_log` written via the
-- SECURITY DEFINER `private.write_audit()` helper, and workshop lifecycle
-- events (workshop.created, workshop.quickstarted, pulse.reminded) are already
-- recorded. Assessment lifecycle events were not. This adds a thin, guarded
-- public writer so the application layer can record assessment/workshop events
-- (e.g. assessment.opened, assessment.closed) without exposing write_audit or
-- the audit_log table directly.
--
-- Reads continue to flow through the existing audit_log RLS (admins of the
-- workspace can select) — no new read path is introduced.

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
  -- Resolve the owning workspace from the entity, so the caller can only log
  -- against things that exist and that we can attribute to a workspace.
  if p_entity_type = 'survey' then
    select workspace_id into v_ws from public.survey where id = p_entity_id;
  elsif p_entity_type = 'workshop' then
    select workspace_id into v_ws from public.workshop where id = p_entity_id;
  else
    raise exception 'log_event: unsupported entity_type %', p_entity_type
      using errcode = '22023';
  end if;

  if v_ws is null then
    raise exception 'log_event: entity not found' using errcode = '22023';
  end if;

  -- Only a member of that workspace may write an event for it.
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
