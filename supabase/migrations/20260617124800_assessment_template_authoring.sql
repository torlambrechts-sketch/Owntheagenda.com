-- Authoring of workspace-custom assessment templates (admin-only).
-- Keys are unique per workspace (globals keep their own unique index).
create unique index if not exists assessment_template_ws_key
  on public.assessment_template(workspace_id, key) where workspace_id is not null;

-- A definition must be renderable: a scale, >=1 dimension, >=1 item, and every
-- item must reference a declared dimension.
create or replace function private.valid_instrument_definition(p_def jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select
    p_def ? 'scale'
    and (p_def->'scale') ? 'min' and (p_def->'scale') ? 'max'
    and jsonb_typeof(p_def->'dimensions') = 'array'
    and jsonb_array_length(p_def->'dimensions') >= 1
    and jsonb_typeof(p_def->'items') = 'array'
    and jsonb_array_length(p_def->'items') >= 1
    and not exists (
      select 1 from jsonb_array_elements(p_def->'items') it
      where coalesce(it->>'dimension','') = ''
         or not exists (
           select 1 from jsonb_array_elements(p_def->'dimensions') d
           where d->>'key' = it->>'dimension'
         )
    );
$$;

-- Create (p_id null) or update a workspace-custom template. Admin-guarded.
create or replace function public.save_assessment_template(
  p_workspace uuid,
  p_id uuid,
  p_name text,
  p_category text,
  p_scope text,
  p_description text,
  p_source text,
  p_definition jsonb
) returns public.assessment_template language plpgsql security definer set search_path = '' as $$
declare v_row public.assessment_template; v_key text; v_base text;
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'only a workspace admin can author templates' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if p_scope not in ('team', 'individual') then
    raise exception 'scope must be team or individual' using errcode = '22023';
  end if;
  if not private.valid_instrument_definition(p_definition) then
    raise exception 'definition must have a scale, at least one dimension and item, and every item must reference a declared dimension' using errcode = '22023';
  end if;

  if p_id is null then
    -- generate a stable, workspace-unique key from the name
    v_base := nullif(regexp_replace(lower(p_name), '[^a-z0-9]+', '_', 'g'), '');
    v_base := trim(both '_' from coalesce(v_base, 'template'));
    v_key := v_base;
    while exists (select 1 from public.assessment_template where workspace_id = p_workspace and key = v_key) loop
      v_key := v_base || '_' || substr(gen_random_uuid()::text, 1, 4);
    end loop;
    insert into public.assessment_template
      (workspace_id, key, name, category, scope, source, description, definition, created_by)
    values
      (p_workspace, v_key, trim(p_name), coalesce(nullif(trim(p_category), ''), 'custom'), p_scope,
       nullif(trim(p_source), ''), nullif(trim(p_description), ''), p_definition, (select auth.uid()))
    returning * into v_row;
  else
    update public.assessment_template set
      name = trim(p_name),
      category = coalesce(nullif(trim(p_category), ''), 'custom'),
      scope = p_scope,
      source = nullif(trim(p_source), ''),
      description = nullif(trim(p_description), ''),
      definition = p_definition,
      updated_at = now()
    where id = p_id and workspace_id = p_workspace
    returning * into v_row;
    if v_row.id is null then
      raise exception 'template not found in this workspace' using errcode = '23503';
    end if;
  end if;
  return v_row;
end;
$$;

-- Delete a workspace-custom template (never a global). Admin-guarded.
create or replace function public.delete_assessment_template(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.assessment_template where id = p_id;
  if v_ws is null then
    raise exception 'only workspace templates can be deleted' using errcode = '42501';
  end if;
  if not private.is_workspace_admin(v_ws) then
    raise exception 'only a workspace admin can delete templates' using errcode = '42501';
  end if;
  delete from public.assessment_template where id = p_id and workspace_id = v_ws;
end;
$$;

revoke execute on function public.save_assessment_template(uuid, uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_assessment_template(uuid, uuid, text, text, text, text, text, jsonb) to authenticated;
revoke execute on function public.delete_assessment_template(uuid) from public, anon;
grant execute on function public.delete_assessment_template(uuid) to authenticated;
