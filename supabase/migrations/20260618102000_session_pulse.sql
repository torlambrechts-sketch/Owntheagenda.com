-- =====================================================================
-- F5 · Close the measurement loop — pre/post pulse on a session
-- ---------------------------------------------------------------------
-- For a session whose blocks link a team dynamic, the facilitator runs a
-- quick "before" check at the start and an "after" check at the end. Both
-- are ordinary team pulses (reusing pulse / pulse_response / the (s-1)/4
-- math), referenced from the session, so the post reading also flows into
-- the team's Health. The delta — masked below 3 respondents, like every
-- other aggregate — is the per-session proof of movement.
-- =====================================================================

alter table public.session add column if not exists pre_pulse_id  uuid references public.pulse(id) on delete set null;
alter table public.session add column if not exists post_pulse_id uuid references public.pulse(id) on delete set null;

-- Open (idempotently) the before/after pulse for a session.
create or replace function public.session_pulse_open(p_session uuid, p_phase text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_title text; v_pulse uuid; v_existing uuid;
begin
  if not private.is_session_facilitator(p_session) then
    raise exception 'facilitator only' using errcode = '42501';
  end if;
  if p_phase not in ('pre', 'post') then raise exception 'bad phase' using errcode = '22023'; end if;
  select w.team_id, w.title into v_team, v_title
    from public.session s join public.workshop w on w.id = s.workshop_id where s.id = p_session;
  if v_team is null then raise exception 'session has no team' using errcode = '22023'; end if;

  select case when p_phase = 'pre' then pre_pulse_id else post_pulse_id end
    into v_existing from public.session where id = p_session;
  if v_existing is not null then return v_existing; end if;

  insert into public.pulse (team_id, name, status, opened_at, created_by)
  values (v_team, v_title || (case when p_phase = 'pre' then ' · before' else ' · after' end), 'open', now(), (select auth.uid()))
  returning id into v_pulse;
  if p_phase = 'pre' then
    update public.session set pre_pulse_id = v_pulse where id = p_session;
  else
    update public.session set post_pulse_id = v_pulse where id = p_session;
    -- the 'before' window is done once 'after' opens
    update public.pulse set status = 'closed', closed_at = now()
      where id = (select pre_pulse_id from public.session where id = p_session) and status = 'open';
  end if;
  return v_pulse;
end;
$$;

-- Per-linked-dynamic before/after aggregate + delta (min-3 masked).
create or replace function public.session_pulse_delta(p_session uuid)
returns table (
  dynamic public.team_dynamic, label text, question text,
  pre_pct numeric, pre_n int, post_pct numeric, post_n int, delta numeric
) language plpgsql security definer set search_path = '' as $$
declare v_pre uuid; v_post uuid;
begin
  if not private.can_read_session(p_session) then raise exception 'forbidden' using errcode = '42501'; end if;
  select pre_pulse_id, post_pulse_id into v_pre, v_post from public.session where id = p_session;
  return query
  with dyns as (
    select distinct b.linked_dynamic as dyn
    from public.block b join public.session s on s.workshop_id = b.workshop_id
    where s.id = p_session and b.linked_dynamic is not null
  ),
  pre as (
    select pr.dynamic, count(*)::int n, avg((pr.score - 1) / 4.0 * 100) p
    from public.pulse_response pr where pr.pulse_id = v_pre group by pr.dynamic
  ),
  post as (
    select pr.dynamic, count(*)::int n, avg((pr.score - 1) / 4.0 * 100) p
    from public.pulse_response pr where pr.pulse_id = v_post group by pr.dynamic
  )
  select db.dynamic, db.label, db.question,
    case when pre.n >= 3 then round(pre.p::numeric, 0) end,
    coalesce(pre.n, 0),
    case when post.n >= 3 then round(post.p::numeric, 0) end,
    coalesce(post.n, 0),
    case when pre.n >= 3 and post.n >= 3 then round((post.p - pre.p)::numeric, 0) end
  from public.dynamic_band db
  join dyns on dyns.dyn = db.dynamic
  left join pre on pre.dynamic = db.dynamic
  left join post on post.dynamic = db.dynamic
  order by db.ord;
end;
$$;

grant execute on function public.session_pulse_open(uuid, text), public.session_pulse_delta(uuid) to authenticated;
revoke execute on function public.session_pulse_open(uuid, text), public.session_pulse_delta(uuid) from public, anon;
