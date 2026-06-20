-- Re-measure trend for a team instrument: the composite (0–100) of every survey
-- of a given kind for a team, oldest→newest, so a manager can see whether
-- re-running it moved the number. Composite reuses private.survey_composite
-- (snapshot-aware + min-3 masked → null), so masked readings surface as gaps.

create or replace function public.survey_trend(p_team uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.can_read_team(p_team) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) into v_result
  from (
    select s.id, s.name, s.created_at,
           (select count(*) from public.survey_response r where r.survey_id = s.id)::int as respondents,
           private.survey_composite(s.id) as composite
    from public.survey s
    where s.team_id = p_team and s.kind = p_kind
  ) t;
  return v_result;
end;
$$;
revoke execute on function public.survey_trend(uuid, text) from public, anon;
grant execute on function public.survey_trend(uuid, text) to authenticated;
