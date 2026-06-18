-- Distinguish ordinary teams from leadership groups on the Health board.
alter table public.team add column if not exists kind text not null default 'team';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_kind_chk') then
    alter table public.team add constraint team_kind_chk check (kind in ('team','leadership_group'));
  end if;
end $$;

create or replace function public.set_team_kind(p_team uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_team(p_team) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('team','leadership_group') then raise exception 'invalid kind' using errcode = '22023'; end if;
  update public.team set kind = p_kind where id = p_team;
end;
$$;
revoke execute on function public.set_team_kind(uuid, text) from public, anon;
grant execute on function public.set_team_kind(uuid, text) to authenticated;
