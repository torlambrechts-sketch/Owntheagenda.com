-- Review fixes:
-- 1. Restore the access-control posture on submit_survey_response. Recreating it
--    via DROP+CREATE re-applied Postgres' default PUBLIC execute grant, which
--    prior migrations had explicitly revoked. Re-revoke from public/anon (the
--    internal can_read_team guard already blocks non-members, but the grant
--    boundary should match the rest of the codebase). Also defensively drop any
--    older 2-arg overload so exactly one overload remains on a fresh replay.
drop function if exists public.submit_survey_response(uuid, jsonb);
revoke execute on function public.submit_survey_response(uuid, jsonb, jsonb, jsonb) from public, anon;

-- 2. Non-Likert answers for individual-scope assessments too (symmetry with the
--    team survey path): a dedicated answers jsonb, kept out of the scored scores.
alter table public.individual_response add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.individual_response_history add column if not exists answers jsonb not null default '{}'::jsonb;

drop function if exists public.submit_individual_response(uuid, text, jsonb);
create function public.submit_individual_response(
  p_workspace uuid, p_template_key text, p_scores jsonb, p_answers jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_def jsonb; v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  select t.definition into v_def from public.assessment_template t
    where t.key = p_template_key and (t.workspace_id = p_workspace or t.workspace_id is null)
    order by t.workspace_id nulls last limit 1;
  insert into public.individual_response (workspace_id, user_id, template_key, scores, definition, answers)
  values (p_workspace, (select auth.uid()), p_template_key, p_scores, v_def, v_answers)
  on conflict (workspace_id, user_id, template_key)
    do update set scores = excluded.scores, definition = excluded.definition, answers = excluded.answers, updated_at = now();
  insert into public.individual_response_history (workspace_id, user_id, template_key, scores, definition, answers)
  values (p_workspace, (select auth.uid()), p_template_key, p_scores, v_def, v_answers);
end;
$$;
revoke execute on function public.submit_individual_response(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.submit_individual_response(uuid, text, jsonb, jsonb) to authenticated;
