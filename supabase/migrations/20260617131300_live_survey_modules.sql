-- Allow survey/assessment modules in the on-demand flow: add_block_live and
-- quick_start_workshop now accept a survey instrument (config.kind), validated
-- against the team-scoped assessment_template catalog. The run-time
-- ensure_block_survey + SurveyModule handle creating/binding the actual survey.

-- Drop the older 3-arg overloads so the new signatures are unambiguous.
drop function if exists public.add_block_live(uuid, text, text);
drop function if exists public.quick_start_workshop(uuid, text, text);

create or replace function public.add_block_live(p_workshop uuid, p_kind text, p_title text default null, p_config jsonb default '{}'::jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare v_ord int; v_ws uuid; v_inst text; v_cfg jsonb := '{}'::jsonb; v_name text; v_title text;
begin
  if not private.can_manage_workshop(p_workshop) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('canvas','brainstorm','vote','feedback','discuss','checkin','outcome','manual','survey') then
    raise exception 'invalid module' using errcode = '22023';
  end if;
  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if p_kind = 'survey' then
    v_inst := p_config->>'kind';
    select workspace_id into v_ws from public.workshop where id = p_workshop;
    select name into v_name from public.assessment_template
      where key = v_inst and scope = 'team' and (workspace_id is null or workspace_id = v_ws)
      order by workspace_id nulls last limit 1;
    if v_name is null then raise exception 'invalid instrument' using errcode = '22023'; end if;
    v_cfg := jsonb_build_object('kind', v_inst, 'timing', 'live');
    v_title := coalesce(v_title, v_name);
  else
    v_title := coalesce(v_title, initcap(p_kind));
  end if;
  select coalesce(max(ord), 0) + 1 into v_ord from public.block where workshop_id = p_workshop;
  insert into public.block (workshop_id, ord, title, activity_type, duration, config)
  values (p_workshop, v_ord, v_title, p_kind::public.activity_type, 15, v_cfg);
  return v_ord;
end;
$$;
revoke execute on function public.add_block_live(uuid, text, text, jsonb) from public, anon;
grant execute on function public.add_block_live(uuid, text, text, jsonb) to authenticated;

create or replace function public.quick_start_workshop(p_team uuid, p_title text, p_kind text, p_instrument text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_workshop uuid; v_cfg jsonb := '{}'::jsonb; v_name text; v_btitle text;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.can_manage_team(p_team) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  if p_kind not in ('canvas','brainstorm','vote','feedback','discuss','checkin','outcome','manual','survey') then
    raise exception 'invalid module' using errcode = '22023';
  end if;
  if p_kind = 'survey' then
    select name into v_name from public.assessment_template
      where key = p_instrument and scope = 'team' and (workspace_id is null or workspace_id = v_ws)
      order by workspace_id nulls last limit 1;
    if v_name is null then raise exception 'invalid instrument' using errcode = '22023'; end if;
    v_cfg := jsonb_build_object('kind', p_instrument, 'timing', 'live');
    v_btitle := v_name;
  else
    v_btitle := initcap(p_kind);
  end if;
  insert into public.workshop (team_id, title, created_by)
  values (p_team, coalesce(nullif(btrim(p_title), ''), 'Quick session'), (select auth.uid()))
  returning id into v_workshop;
  insert into public.block (workshop_id, ord, title, activity_type, duration, config)
  values (v_workshop, 1, v_btitle, p_kind::public.activity_type, 15, v_cfg);
  perform public.start_session(v_workshop);
  perform private.write_audit(v_ws, (select auth.uid()), 'workshop.quickstarted', 'workshop', v_workshop,
                              jsonb_build_object('kind', p_kind));
  return v_workshop;
end;
$$;
revoke execute on function public.quick_start_workshop(uuid, text, text, text) from public, anon;
grant execute on function public.quick_start_workshop(uuid, text, text, text) to authenticated;
