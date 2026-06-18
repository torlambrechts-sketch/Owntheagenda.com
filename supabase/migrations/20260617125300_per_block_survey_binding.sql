-- Move survey binding from the workshop (single survey_id) to the block, so a
-- workshop can have multiple survey steps, each pinned to its own assessment.

-- 1) per-block binding column
alter table public.block add column if not exists survey_id uuid references public.survey(id) on delete set null;

-- 2) carry any existing workshop-level pin onto its first survey step
update public.block b
set survey_id = w.survey_id
from public.workshop w
where b.workshop_id = w.id
  and w.survey_id is not null
  and b.activity_type = 'survey'
  and b.ord = (select min(b2.ord) from public.block b2 where b2.workshop_id = w.id and b2.activity_type = 'survey');

-- 3) realtime: the run flow now signals "survey opened" via block updates
alter publication supabase_realtime add table public.block;

-- 4) resolver per survey BLOCK: reuse newest open survey of the same team+kind,
--    else create one; stamp it on the block.
create or replace function public.ensure_block_survey(p_block uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_survey uuid; v_team uuid; v_ws uuid; v_workspace uuid; v_kind text; v_name text;
begin
  select b.workshop_id, coalesce(b.config->>'kind','psych_safety_bang'), b.survey_id
    into v_ws, v_kind, v_survey
  from public.block b where b.id = p_block and b.activity_type = 'survey';
  if v_ws is null then raise exception 'survey step not found' using errcode = '23503'; end if;
  if not private.can_manage_workshop(v_ws) then
    raise exception 'only a lead or facilitator can open the survey' using errcode = '42501';
  end if;
  if v_survey is not null then return v_survey; end if;

  select team_id, workspace_id into v_team, v_workspace from public.workshop where id = v_ws;
  select id into v_survey from public.survey
   where team_id = v_team and kind = v_kind and status = 'open'
   order by created_at desc limit 1;
  if v_survey is null then
    select name into v_name from public.assessment_template
     where key = v_kind and (workspace_id = v_workspace or workspace_id is null)
     order by workspace_id nulls last limit 1;
    v_survey := (public.create_survey(v_team, v_kind, coalesce(v_name, v_kind))).id;
  end if;
  update public.block set survey_id = v_survey where id = p_block;
  return v_survey;
end;
$$;
revoke execute on function public.ensure_block_survey(uuid) from public, anon;
grant execute on function public.ensure_block_survey(uuid) to authenticated;

-- 5) explicit pin: bind a specific OPEN assessment of the matching instrument to a survey BLOCK.
create or replace function public.set_block_survey(p_block uuid, p_survey uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_ws_team uuid; v_kind text; v_survey_team uuid; v_survey_kind text; v_status text;
begin
  select workshop_id, coalesce(config->>'kind','psych_safety_bang') into v_ws, v_kind
   from public.block where id = p_block and activity_type = 'survey';
  if v_ws is null then raise exception 'survey step not found' using errcode = '23503'; end if;
  if not private.can_manage_workshop(v_ws) then
    raise exception 'only a lead or facilitator can attach an assessment' using errcode = '42501';
  end if;
  select team_id into v_ws_team from public.workshop where id = v_ws;

  if p_survey is not null then
    select team_id, kind, status into v_survey_team, v_survey_kind, v_status from public.survey where id = p_survey;
    if v_survey_team is null then raise exception 'assessment not found' using errcode = '23503'; end if;
    if v_survey_team <> v_ws_team then raise exception 'assessment belongs to another team' using errcode = '42501'; end if;
    if v_status <> 'open' then raise exception 'only an open assessment can be attached' using errcode = '22023'; end if;
    if v_survey_kind <> v_kind then raise exception 'that assessment is a different instrument than this step' using errcode = '22023'; end if;
  end if;

  update public.block set survey_id = p_survey where id = p_block;
end;
$$;
revoke execute on function public.set_block_survey(uuid, uuid) from public, anon;
grant execute on function public.set_block_survey(uuid, uuid) to authenticated;

-- 6) retire the workshop-level binding (replaced by per-block)
drop function if exists public.ensure_workshop_survey(uuid, text, text);
drop function if exists public.set_workshop_survey(uuid, uuid);
alter table public.workshop drop column if exists survey_id;
