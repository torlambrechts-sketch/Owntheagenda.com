-- =====================================================================
-- OwnTheAgenda · 0018 · Scheduling + in-app notifications (cadence)
-- ---------------------------------------------------------------------
-- Leadership teams run on a cadence. Schedule a workshop and the team is
-- nudged in-app. Notifications are per-user and system-generated (written
-- only by SECURITY DEFINER functions); a member reads their own and marks
-- them read. (Email delivery is a later add-on on top of this table.)
-- =====================================================================

create table public.notification (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  link         text,
  entity_type  text,
  entity_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notification_user_idx   on public.notification (user_id, created_at desc);
create index notification_unread_idx on public.notification (user_id) where read_at is null;

-- internal helper: create a notification (called by other SECURITY DEFINER fns)
create or replace function private.notify(
  p_ws uuid, p_user uuid, p_kind text, p_title text, p_body text,
  p_link text, p_etype text default null, p_eid uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notification (workspace_id, user_id, kind, title, body, link, entity_type, entity_id)
  values (p_ws, p_user, p_kind, p_title, p_body, p_link, p_etype, p_eid);
$$;

-- Schedule a workshop and nudge every team member but the scheduler.
create or replace function public.schedule_workshop(p_workshop uuid, p_at timestamptz)
returns public.workshop language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_team uuid; v_title text; v_uid uuid := (select auth.uid()); r record; v_row public.workshop;
begin
  if not private.can_manage_workshop(p_workshop) then
    raise exception 'only a lead or admin can schedule' using errcode = '42501';
  end if;
  update public.workshop
    set scheduled_at = p_at,
        status = case when status = 'draft' then 'scheduled' else status end
  where id = p_workshop
  returning workspace_id, team_id, title into v_ws, v_team, v_title;
  if v_ws is null then raise exception 'workshop not found' using errcode = '23503'; end if;

  for r in select tm.user_id from public.team_member tm where tm.team_id = v_team and tm.user_id <> v_uid loop
    perform private.notify(v_ws, r.user_id, 'session_scheduled',
      v_title,
      'Scheduled for ' || to_char(p_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC',
      '/workshops/' || p_workshop::text, 'workshop', p_workshop);
  end loop;

  select * into v_row from public.workshop where id = p_workshop;
  return v_row;
end;
$$;

-- Mark all (or one) of the caller's notifications read.
create or replace function public.mark_notifications_read(p_id uuid default null)
returns void language sql security definer set search_path = '' as $$
  update public.notification set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_id is null or id = p_id);
$$;

grant execute on function
  public.schedule_workshop(uuid, timestamptz), public.mark_notifications_read(uuid)
to authenticated;
revoke execute on function
  public.schedule_workshop(uuid, timestamptz), public.mark_notifications_read(uuid)
from public, anon;

-- ----- grants + RLS --------------------------------------------------
grant select on public.notification to authenticated;   -- writes only via the RPCs above

alter table public.notification enable row level security;
create policy notification_select on public.notification
  for select to authenticated using (user_id = (select auth.uid()));
