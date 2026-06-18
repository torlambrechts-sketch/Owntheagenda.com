-- Manual status overlay for the Health board: a leader-set RAG + note per axis,
-- pinned on top of the auto signals.
create table if not exists public.health_status (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  axis text not null,
  status text not null check (status in ('red','amber','green')),
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (team_id, axis)
);
create index if not exists health_status_team_idx on public.health_status(team_id);

alter table public.health_status enable row level security;
-- Read: anyone who can read the team. Writes go through the RPC only.
drop policy if exists health_status_read on public.health_status;
create policy health_status_read on public.health_status
  for select to authenticated using (private.can_read_team(team_id));

-- Set / clear a manual status. Lead/admin of the team only. Null status clears it.
create or replace function public.set_health_status(p_team uuid, p_axis text, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  if not private.can_manage_team(p_team) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_axis not in ('dynamics','strategy','performance','development','overall') then
    raise exception 'invalid axis' using errcode = '22023';
  end if;
  if p_status is null then
    delete from public.health_status where team_id = p_team and axis = p_axis;
    return;
  end if;
  if p_status not in ('red','amber','green') then raise exception 'invalid status' using errcode = '22023'; end if;
  select workspace_id into v_ws from public.team where id = p_team;
  insert into public.health_status (team_id, workspace_id, axis, status, note, updated_by, updated_at)
  values (p_team, v_ws, p_axis, p_status, nullif(p_note,''), (select auth.uid()), now())
  on conflict (team_id, axis) do update
    set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
revoke execute on function public.set_health_status(uuid, text, text, text) from public, anon;
grant execute on function public.set_health_status(uuid, text, text, text) to authenticated;
