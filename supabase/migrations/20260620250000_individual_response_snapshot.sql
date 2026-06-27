-- Snapshot the instrument definition onto each individual response, mirroring the
-- survey snapshot: editing a template later can't desync a person's stored
-- scores from its item keys. Additive; the read side (the assessments report)
-- resolves the report instrument from this snapshot, while a fresh re-take still
-- uses the live template.

alter table public.individual_response add column if not exists definition jsonb;
alter table public.individual_response_history add column if not exists definition jsonb;

create or replace function public.submit_individual_response(p_workspace uuid, p_template_key text, p_scores jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_def jsonb;
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  select t.definition into v_def from public.assessment_template t
    where t.key = p_template_key and (t.workspace_id = p_workspace or t.workspace_id is null)
    order by t.workspace_id nulls last limit 1;
  insert into public.individual_response (workspace_id, user_id, template_key, scores, definition)
  values (p_workspace, (select auth.uid()), p_template_key, p_scores, v_def)
  on conflict (workspace_id, user_id, template_key)
    do update set scores = excluded.scores, definition = excluded.definition, updated_at = now();
  insert into public.individual_response_history (workspace_id, user_id, template_key, scores, definition)
  values (p_workspace, (select auth.uid()), p_template_key, p_scores, v_def);
end;
$$;
revoke execute on function public.submit_individual_response(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_individual_response(uuid, text, jsonb) to authenticated;

-- Backfill latest rows from the current template so existing reports are locked
-- (history rows keep their per-take definition going forward).
update public.individual_response r
set definition = (
  select t.definition from public.assessment_template t
  where t.key = r.template_key and (t.workspace_id = r.workspace_id or t.workspace_id is null)
  order by t.workspace_id nulls last limit 1
)
where r.definition is null;
