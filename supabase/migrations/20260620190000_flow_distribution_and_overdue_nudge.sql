-- =====================================================================
-- Assessment distribution + overdue nudge — Phase J.
--
--  1. Distribution parity: create_survey already notifies every team member
--     when an instrument assessment opens, but program_start_pulse opened the
--     generic pulse silently. Now the pulse path also fans a 'pulse_open'
--     notification out to the team, so EVERY flow assessment is distributed
--     the same way (in-app notification → /assessments) regardless of kind.
--
--  2. Overdue nudge (a Flow can't quietly halt): a daily pg_cron job nudges
--     the owner of any overdue open task, and the flow owner when the whole
--     flow is past its deadline — each with a 24h cooldown so it never spams.
-- =====================================================================

-- 1) Distribute the pulse to the team (mirrors create_survey's fan-out).
create or replace function public.program_start_pulse(p_program uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_pulse uuid; v_pname text; v_uid uuid := (select auth.uid());
begin
  select workspace_id, team_id into v_ws, v_team from public.program where id = p_program;
  if v_ws is null then raise exception 'no program' using errcode = '22023'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'admins only' using errcode = '42501'; end if;
  if v_team is null then raise exception 'program has no team' using errcode = '22023'; end if;

  v_pname := coalesce(nullif(btrim(p_name), ''), 'Team pulse');
  insert into public.pulse (team_id, name, status, opened_at, created_by)
  values (v_team, v_pname, 'open', now(), v_uid)
  returning id into v_pulse;

  update public.program_step set status = 'done', ref_table = 'pulse', ref_id = v_pulse, completed_at = now()
    where program_id = p_program and kind = 'assessment';
  update public.program_step set status = 'active', ref_table = 'pulse', ref_id = v_pulse
    where program_id = p_program and kind = 'launch';
  update public.program set current_ord =
    coalesce((select ord from public.program_step where program_id = p_program and kind = 'launch'), current_ord)
    where id = p_program;

  -- distribute to the team (everyone but the initiator)
  perform private.notify(v_ws, tm.user_id, 'pulse_open', v_pname,
    'Share your read in ~2 minutes — anonymous in aggregate.', '/assessments', 'pulse', v_pulse)
  from public.team_member tm
  where tm.team_id = v_team and tm.user_id <> v_uid;

  return v_pulse;
end;
$$;

-- 2) Overdue nudge — task owners + the flow owner, with a 24h cooldown.
create or replace function private.flow_nudge_overdue()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int := 0; r record;
begin
  -- overdue, still-open tasks → nudge the task owner
  for r in
    select t.id, t.workspace_id, t.owner_id, t.title, p.title as flow_title
    from public.program_task t
    join public.program p on p.id = t.program_id
    where p.kind = 'flow' and p.status = 'active'
      and t.status = 'open' and t.owner_id is not null
      and t.due_at is not null and t.due_at < now()
      and not exists (
        select 1 from public.notification n
        where n.kind = 'flow_task_overdue' and n.entity_type = 'program_task' and n.entity_id = t.id
          and n.created_at > now() - interval '24 hours')
  loop
    perform private.notify(r.workspace_id, r.owner_id, 'flow_task_overdue',
      'Task overdue', r.title || ' — for "' || r.flow_title || '"',
      '/workflow', 'program_task', r.id);
    v_count := v_count + 1;
  end loop;

  -- whole flow past its deadline → nudge the flow owner
  for r in
    select p.id, p.workspace_id, p.created_by, p.title
    from public.program p
    where p.kind = 'flow' and p.status = 'active'
      and p.due_at is not null and p.due_at < now() and p.created_by is not null
      and not exists (
        select 1 from public.notification n
        where n.kind = 'flow_overdue' and n.entity_type = 'program' and n.entity_id = p.id
          and n.created_at > now() - interval '24 hours')
  loop
    perform private.notify(r.workspace_id, r.created_by, 'flow_overdue',
      'Flow overdue', '"' || r.title || '" is past its due date — keep it moving.',
      '/workflow', 'program', r.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Schedule it daily (guarded so local replays without pg_cron are a no-op).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('flow-overdue-nudge', '20 7 * * *', 'select private.flow_nudge_overdue();');
  end if;
end $$;
