-- =====================================================================
-- Keep the legacy create_survey path (flows, workshop pre-work) revealing
-- aggregates at the historical floor of 3, rather than inheriting the new
-- survey.min_participants default of 5 that the send wizard uses. Without
-- this, flow/workshop assessments that used to unmask at 3 responses would
-- silently need 5. CREATE OR REPLACE preserves grants; only the explicit
-- min_participants = 3 on insert is added to the take-path version.
-- =====================================================================

create or replace function public.create_survey(p_team uuid, p_kind text, p_name text, p_due timestamptz default null, p_anonymity text default 'anonymous')
returns public.survey language plpgsql security definer set search_path = '' as $function$
declare v_row public.survey; v_uid uuid := (select auth.uid()); v_body text; v_ws uuid; v_def jsonb;
        v_anon text := case when p_anonymity = 'attributed' then 'attributed' else 'anonymous' end;
begin
  if not private.can_manage_team(p_team) then
    raise exception 'only a team lead or admin can open a survey' using errcode = '42501';
  end if;
  -- Idempotent start: one open instance per team+kind.
  select * into v_row from public.survey
   where team_id = p_team and kind = p_kind and status = 'open'
   order by opened_at desc limit 1;
  if found then return v_row; end if;

  v_ws := private.team_workspace(p_team);
  select t.definition into v_def from public.assessment_template t
    where t.key = p_kind and (t.workspace_id = v_ws or t.workspace_id is null)
    order by t.workspace_id nulls last limit 1;
  insert into public.survey (team_id, kind, name, status, opened_at, due_at, created_by, definition, anonymity, min_participants)
  values (p_team, p_kind, p_name, 'open', now(), p_due, v_uid, v_def, v_anon, 3)
  returning * into v_row;
  v_body := case when p_due is not null
    then 'Due by ' || to_char(p_due, 'Mon DD') || ' — ~2 minutes, ' || v_anon || '.'
    else 'Share your read in ~2 minutes — ' || v_anon || '.' end;
  perform private.notify(v_row.workspace_id, tm.user_id, 'survey_open', p_name, v_body, '/assessments/take', 'survey', v_row.id)
  from public.team_member tm
  where tm.team_id = p_team and tm.user_id <> v_uid;
  return v_row;
end;
$function$;
