-- =====================================================================
-- OwnTheAgenda · 0015 · Idea modules (brainstorm · poll · feedback)
-- ---------------------------------------------------------------------
-- One primitive powers three modules:
--   * brainstorm — participants add idea cards, then dot-vote; ranked.
--   * vote (poll) — facilitator seeds options; participants dot-vote.
--   * feedback   — idea cards posted into named lanes (e.g. Start/Stop).
-- `idea` is a votable card scoped to a session block; `idea_vote` is a
-- single dot. Votes go only through a SECURITY DEFINER RPC so the dot
-- budget (block.config.budget) is enforced server-side. Everything
-- syncs live via Supabase Realtime.
-- =====================================================================

create table public.idea (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.session(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  block_ord    int  not null,
  lane         text,                 -- feedback column, or 'option' for poll options
  text         text not null,
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idea_session_idx on public.idea (session_id, block_ord);

create table public.idea_vote (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.idea(id) on delete cascade,
  session_id  uuid not null references public.session(id) on delete cascade,
  block_ord   int  not null,
  voter_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (idea_id, voter_id)         -- at most one dot per idea per voter
);
create index idea_vote_block_idx on public.idea_vote (session_id, block_ord);
create index idea_vote_idea_idx  on public.idea_vote (idea_id);

create trigger set_updated_at before update on public.idea
  for each row execute function private.set_updated_at();

-- Denormalize workspace_id + stamp author server-side (anti-spoof).
create or replace function private.set_idea_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.session where id = new.session_id;
  if new.workspace_id is null then
    raise exception 'session not found' using errcode = '23503';
  end if;
  new.author_id := (select auth.uid());
  if new.author_name is null or btrim(new.author_name) = '' then
    select coalesce(display_name, full_name, email)
      into new.author_name
    from public.profile where id = (select auth.uid());
  end if;
  return new;
end;
$$;
create trigger set_idea_defaults before insert on public.idea
  for each row execute function private.set_idea_defaults();

-- Toggle a dot vote. Budget comes from the block's config (default 3).
create or replace function public.idea_vote_toggle(p_idea uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid; v_block int; v_uid uuid := (select auth.uid()); v_budget int; v_count int;
begin
  select session_id, block_ord into v_session, v_block from public.idea where id = p_idea;
  if v_session is null then raise exception 'idea not found' using errcode = '23503'; end if;
  if not private.can_read_session(v_session) then raise exception 'forbidden' using errcode = '42501'; end if;

  if exists (select 1 from public.idea_vote where idea_id = p_idea and voter_id = v_uid) then
    delete from public.idea_vote where idea_id = p_idea and voter_id = v_uid;
  else
    select coalesce((b.config ->> 'budget')::int, 3) into v_budget
    from public.block b join public.session s on s.workshop_id = b.workshop_id
    where s.id = v_session and b.ord = v_block;
    select count(*) into v_count from public.idea_vote
    where session_id = v_session and block_ord = v_block and voter_id = v_uid;
    if v_count >= coalesce(v_budget, 3) then
      raise exception 'no votes left' using errcode = '23514';
    end if;
    insert into public.idea_vote (idea_id, session_id, block_ord, voter_id)
    values (p_idea, v_session, v_block, v_uid);
  end if;
end;
$$;

-- Facilitator seeds poll options for a block (idempotent on text).
create or replace function public.idea_seed(p_session uuid, p_block_ord int, p_texts text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_session_facilitator(p_session) then
    raise exception 'facilitator only' using errcode = '42501';
  end if;
  insert into public.idea (session_id, block_ord, lane, text, author_name)
  select p_session, p_block_ord, 'option', t, 'Facilitator'
  from unnest(p_texts) as t
  where btrim(t) <> ''
    and not exists (
      select 1 from public.idea i
      where i.session_id = p_session and i.block_ord = p_block_ord
        and i.lane = 'option' and i.text = t
    );
end;
$$;

grant execute on function public.idea_vote_toggle(uuid), public.idea_seed(uuid, int, text[]) to authenticated;
revoke execute on function public.idea_vote_toggle(uuid), public.idea_seed(uuid, int, text[]) from public, anon;

-- ----- grants + RLS --------------------------------------------------
grant select, insert, update, delete on public.idea to authenticated;
grant select on public.idea_vote to authenticated;   -- writes only via the RPCs above

alter table public.idea      enable row level security;
alter table public.idea_vote enable row level security;

create policy idea_select on public.idea
  for select to authenticated using (private.can_read_session(session_id));
create policy idea_insert on public.idea
  for insert to authenticated with check (private.can_read_session(session_id));
create policy idea_update on public.idea
  for update to authenticated
  using (private.can_read_session(session_id)
         and (author_id = (select auth.uid()) or private.is_session_facilitator(session_id)))
  with check (private.can_read_session(session_id));
create policy idea_delete on public.idea
  for delete to authenticated
  using (private.can_read_session(session_id)
         and (author_id = (select auth.uid()) or private.is_session_facilitator(session_id)));

-- idea_vote: read-only to clients (for live tallies); mutations via RPC only.
create policy idea_vote_select on public.idea_vote
  for select to authenticated using (private.can_read_session(session_id));

-- ----- realtime ------------------------------------------------------
alter table public.idea      replica identity full;
alter table public.idea_vote replica identity full;
alter publication supabase_realtime add table public.idea;
alter publication supabase_realtime add table public.idea_vote;

-- ----- template expansion now carries block config -------------------
create or replace function public.create_workshop_from_template(
  p_team uuid, p_template uuid, p_title text, p_pulse uuid default null
) returns public.workshop language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_def jsonb; v_tname text; v_row public.workshop;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.can_manage_team(p_team) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select definition, name into v_def, v_tname from public.template
  where id = p_template and (workspace_id is null or workspace_id = v_ws);
  if v_def is null then raise exception 'template not available' using errcode = '23503'; end if;

  insert into public.workshop (team_id, title, template_id, pulse_id, created_by)
  values (p_team, coalesce(nullif(btrim(p_title), ''), v_tname), p_template, p_pulse, (select auth.uid()))
  returning * into v_row;

  insert into public.block (workshop_id, ord, title, activity_type, duration, prompt, linked_dynamic, config)
  select v_row.id, ph.ord,
         coalesce(ph.elem ->> 'title', 'Step'),
         coalesce((ph.elem ->> 'type')::public.activity_type, 'canvas'),
         coalesce((ph.elem ->> 'minutes')::int, 10),
         ph.elem ->> 'prompt',
         (ph.elem ->> 'dynamic')::public.team_dynamic,
         coalesce(ph.elem -> 'config', '{}'::jsonb)
  from jsonb_array_elements(coalesce(v_def -> 'phases', '[]'::jsonb)) with ordinality as ph(elem, ord);

  perform private.write_audit(v_ws, (select auth.uid()), 'workshop.created', 'workshop', v_row.id,
                              jsonb_build_object('template', v_tname));
  return v_row;
end;
$$;
