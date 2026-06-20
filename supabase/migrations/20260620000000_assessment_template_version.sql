-- Versioning for workspace-custom assessment templates.
--
-- Editing a live instrument in place silently changes the meaning of any
-- historical responses scored against it (individual_response_history, the
-- team aggregates, the benchmark pool). This append-only snapshot keeps every
-- prior definition so a past take can always be interpreted against the
-- instrument as it was when answered. Additive only — no existing behaviour
-- changes; the current `definition` on assessment_template stays the live one.

create table if not exists public.assessment_template_version (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assessment_template(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  version int not null,
  key text not null,
  name text not null,
  category text,
  scope text not null,
  source text,
  description text,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (template_id, version)
);

create index if not exists assessment_template_version_template
  on public.assessment_template_version (template_id, version desc);

alter table public.assessment_template_version enable row level security;

-- Readable by members of the owning workspace (snapshots only ever exist for
-- workspace-custom templates). Writes go through the definer save RPC only.
drop policy if exists assessment_template_version_select on public.assessment_template_version;
create policy assessment_template_version_select on public.assessment_template_version
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Extend the save RPC to snapshot on every create/update. Body is unchanged
-- except for the version write appended before `return`.
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
declare v_row public.assessment_template; v_key text; v_base text; v_ver int;
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

  -- Append the snapshot (next version for this template).
  select coalesce(max(version), 0) + 1 into v_ver
    from public.assessment_template_version where template_id = v_row.id;
  insert into public.assessment_template_version
    (template_id, workspace_id, version, key, name, category, scope, source, description, definition, created_by)
  values
    (v_row.id, v_row.workspace_id, v_ver, v_row.key, v_row.name, v_row.category, v_row.scope,
     v_row.source, v_row.description, v_row.definition, (select auth.uid()));

  return v_row;
end;
$$;

revoke execute on function public.save_assessment_template(uuid, uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_assessment_template(uuid, uuid, text, text, text, text, text, jsonb) to authenticated;
