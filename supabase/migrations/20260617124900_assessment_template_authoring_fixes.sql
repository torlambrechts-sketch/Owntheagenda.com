-- Review fixes: guarantee a non-empty generated key even for all-symbol names,
-- and use a not-found SQLSTATE (P0002) instead of the misleading 23503.
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
    -- generate a stable, workspace-unique, always-non-empty key from the name
    v_base := trim(both '_' from regexp_replace(lower(p_name), '[^a-z0-9]+', '_', 'g'));
    if v_base = '' then v_base := 'template'; end if;
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
      raise exception 'template not found in this workspace' using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
