-- Pause / resume a collecting assessment (P3). 'paused' blocks submission (the
-- submit RPCs already gate on status = 'open') without closing; resume restores
-- 'open'. Lead/admin only. Never touches a closed/draft survey.
create or replace function public.set_survey_paused(p_survey uuid, p_paused boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_status text;
begin
  select team_id, status into v_team, v_status from public.survey where id = p_survey;
  if v_team is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if not private.can_manage_team(v_team) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status not in ('open', 'paused') then raise exception 'can only pause an open assessment' using errcode = '22023'; end if;
  update public.survey set status = case when p_paused then 'paused' else 'open' end, updated_at = now()
  where id = p_survey;
end;
$$;
revoke execute on function public.set_survey_paused(uuid, boolean) from public, anon;
grant execute on function public.set_survey_paused(uuid, boolean) to authenticated;
