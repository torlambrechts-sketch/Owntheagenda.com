-- =====================================================================
-- F1 · Shareable post-session readout
-- ---------------------------------------------------------------------
-- A facilitator can mint a public, read-only link to a session's readout
-- (the artifact people forward to their boss). Sharing is opt-in per
-- session via `share_token`; clearing it revokes every existing link.
-- `public_session_readout(token)` is the only anon-readable surface and
-- compiles the readout from existing data, honouring card anonymity and
-- exposing fist-of-five only as an aggregate.
-- =====================================================================

alter table public.session add column if not exists share_token text unique;
alter table public.session add column if not exists shared_at   timestamptz;

-- ----- mint / revoke the link (facilitator or workspace admin) -------
create or replace function public.session_share_set(p_session uuid, p_on boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_tok text;
begin
  if not (private.is_session_facilitator(p_session)
          or private.is_workspace_admin(private.session_workspace(p_session))) then
    raise exception 'facilitator or admin only' using errcode = '42501';
  end if;
  if p_on then
    select share_token into v_tok from public.session where id = p_session;
    if v_tok is null then
      v_tok := encode(extensions.gen_random_bytes(16), 'hex');
      update public.session set share_token = v_tok, shared_at = now() where id = p_session;
    end if;
    return v_tok;
  end if;
  update public.session set share_token = null, shared_at = null where id = p_session;
  return null;
end;
$$;

-- ----- the public readout document (anon-readable by valid token) -----
create or replace function public.public_session_readout(p_token text)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare v_s public.session; v_w public.workshop; v_team text; v_doc jsonb;
begin
  if p_token is null or length(p_token) < 16 then return null; end if;
  select * into v_s from public.session where share_token = p_token;
  if v_s.id is null then return null; end if;
  select * into v_w from public.workshop where id = v_s.workshop_id;
  select name into v_team from public.team where id = v_w.team_id;

  v_doc := jsonb_build_object(
    'workshop',  v_w.title,
    'team',      v_team,
    'startedAt', v_s.started_at,
    'endedAt',   v_s.ended_at,
    'status',    v_s.status,
    'stats', jsonb_build_object(
      'steps',   (select count(*) from public.block b where b.workshop_id = v_s.workshop_id),
      'ideas',   (select count(*) from public.idea i where i.session_id = v_s.id),
      'votes',   (select count(*) from public.idea_vote v where v.session_id = v_s.id),
      'actions', (select count(*) from public.action_item a where a.session_id = v_s.id)
    ),
    'participants', (
      select coalesce(jsonb_agg(distinct nm), '[]'::jsonb) from (
        select nullif(split_part(coalesce(pr.full_name, pr.display_name, ''), ' ', 1), '') as nm
        from public.participant pa join public.profile pr on pr.id = pa.user_id
        where pa.session_id = v_s.id
      ) q where nm is not null
    ),
    'blocks', (
      select coalesce(jsonb_agg(blk order by ord), '[]'::jsonb) from (
        select b.ord as ord, jsonb_build_object(
          'ord', b.ord, 'title', b.title, 'type', b.activity_type, 'prompt', b.prompt,
          'lanes', coalesce(b.config->'lanes', '[]'::jsonb),
          'agree', (
            select case when count(*) = 0 then null else
              jsonb_build_object('avg', round(avg(value)::numeric, 1), 'total', count(*)) end
            from public.agreement a where a.session_id = v_s.id and a.block_ord = b.ord
          ),
          -- never expose silent / pre-work cards that haven't been revealed
          -- yet (an ended session reveals everything, so readouts are intact)
          'ideas', case when private.block_revealed(v_s.id, b.ord) then (
            select coalesce(jsonb_agg(jsonb_build_object('text', t, 'lane', lane, 'votes', votes, 'by', byname)
                                      order by votes desc, t), '[]'::jsonb)
            from (
              select i.text as t, i.lane as lane,
                     (select count(*) from public.idea_vote v where v.idea_id = i.id) as votes,
                     case when i.is_anonymous then null
                          else nullif(split_part(coalesce(i.author_name, ''), ' ', 1), '') end as byname
              from public.idea i where i.session_id = v_s.id and i.block_ord = b.ord
            ) ii
          ) else '[]'::jsonb end
        ) as blk
        from public.block b where b.workshop_id = v_s.workshop_id
      ) z
    ),
    'decisions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'title', d.title, 'status', d.status, 'rationale', d.rationale,
        'agree',   (select round(avg(c.agreement)::numeric, 1) from public.decision_contributor c
                      where c.decision_id = d.id and c.agreement is not null),
        'opposed', (select count(*) from public.decision_contributor c
                      where c.decision_id = d.id and c.agreement = 1),
        'actions', (select coalesce(jsonb_agg(jsonb_build_object('text', a.text, 'owner', a.owner_name, 'done', a.status = 'done')), '[]'::jsonb)
                      from public.action_item a where a.decision_id = d.id)
      ) order by d.created_at), '[]'::jsonb)
      from public.decision d where d.session_id = v_s.id
    ),
    'actions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'text', a.text, 'owner', a.owner_name, 'done', a.status = 'done', 'due', a.due_at
      ) order by a.created_at), '[]'::jsonb)
      from public.action_item a where a.session_id = v_s.id
    ),
    'summary', (
      select content from public.session_summary
      where session_id = v_s.id and approved_at is not null
    )
  );
  return v_doc;
end;
$$;

grant execute on function public.session_share_set(uuid, boolean) to authenticated;
revoke execute on function public.session_share_set(uuid, boolean) from public, anon;
grant execute on function public.public_session_readout(text) to anon, authenticated;
