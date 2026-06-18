-- Review fix #2: gate on the canonical active-membership helper (matches
-- can_read_team / requireSession) so a suspended member is refused, not handed
-- an empty board. (No data leak either way — the per-row can_read_team filter
-- already excludes every team for a non-active member — but this is consistent.)
create or replace function public.workspace_health(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  with mine as (
    select t.id, t.name, t.kind, t.parent_team_id, t.lead_user_id
    from public.team t
    where t.workspace_id = p_workspace and t.deleted_at is null and private.can_read_team(t.id)
  ),
  rows as (
    select
      t.id as team_id, t.name, t.kind, t.parent_team_id,
      (select coalesce(p.full_name, p.display_name, p.email) from public.profile p where p.id = t.lead_user_id) as lead,
      case when dd.total > 0 then jsonb_build_object('score', dd.score, 'in_band', dd.in_band, 'total', dd.total) else null end as dynamics,
      private.team_latest_composite(t.id, 'strategy_health') as strategy,
      private.team_latest_composite(t.id, 'team_performance') as performance,
      to_jsonb(coalesce(dd.dev, '{}')::text[]) as development,
      (select coalesce(jsonb_object_agg(h.axis, jsonb_build_object('status', h.status, 'note', h.note)), '{}'::jsonb)
         from public.health_status h where h.team_id = t.id) as manual
    from mine t
    left join lateral (
      select count(*) filter (where x.in_band) as in_band, count(*) as total, round(avg(x.pct)) as score,
             array_agg(x.label order by x.pct) filter (where not x.in_band) as dev
      from public.team_dynamics(p_team => t.id) x where x.pct is not null
    ) dd on true
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.kind, rows.name), '[]'::jsonb) into v_result from rows;
  return v_result;
end;
$$;
revoke execute on function public.workspace_health(uuid) from public, anon;
grant execute on function public.workspace_health(uuid) to authenticated;
