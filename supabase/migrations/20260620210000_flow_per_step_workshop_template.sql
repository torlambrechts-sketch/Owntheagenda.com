-- =====================================================================
-- Per-step workshop templates — Phase L. A Flow can now carry a different
-- template on each Workshop step (stored in program_step.config.template),
-- so flows with several distinct workshops each build their own. The
-- program-level auto_workshop_template stays as a fallback (used by Plays
-- and branch routing). program_autobuild prefers the active step's own
-- template, then the program fallback.
-- =====================================================================

-- Auto-build resolves the template from the active workshop step's config
-- first, then the program-level fallback.
create or replace function private.program_autobuild(p_program uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_prog_tmpl uuid; v_title text; v_pulse uuid; v_survey uuid;
        v_step uuid; v_cfg jsonb; v_tmpl uuid; v_wk uuid;
begin
  select team_id, auto_workshop_template, title
    into v_team, v_prog_tmpl, v_title from public.program where id = p_program;
  if v_team is null then return; end if;

  select id, config into v_step, v_cfg from public.program_step
    where program_id = p_program and kind = 'workshop' and status = 'active' and ref_id is null
    order by ord limit 1;
  if v_step is null then return; end if;

  v_tmpl := coalesce(nullif(v_cfg ->> 'template', '')::uuid, v_prog_tmpl);
  if v_tmpl is null then return; end if;   -- no template chosen → manual build

  select ref_id into v_pulse from public.program_step
    where program_id = p_program and ref_table = 'pulse' and ref_id is not null limit 1;
  select ref_id into v_survey from public.program_step
    where program_id = p_program and ref_table = 'survey' and ref_id is not null limit 1;

  v_wk := private.spawn_workshop(v_team, v_tmpl, v_title, v_pulse, v_survey);
  if v_wk is not null then
    update public.program_step set ref_table = 'workshop', ref_id = v_wk where id = v_step;
  end if;
end;
$$;

-- create_flow_steps stores a per-workshop-step template in config.template.
-- p_workshop_template stays as the program-level fallback (composer now sends
-- per-step templates instead, but the param is kept for compatibility).
create or replace function public.create_flow_steps(
  p_workspace uuid, p_title text, p_team uuid, p_min_responses int, p_steps jsonb,
  p_assessment_kind text default null, p_collect_days int default 7,
  p_workshop_template uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int := greatest(3, coalesce(p_min_responses, 3)); v_ord int := 0; r record;
        v_cd int := greatest(1, coalesce(p_collect_days, 7)); v_tmpl uuid; v_steptmpl uuid;
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required' using errcode = '22023';
  end if;
  if p_steps is null or jsonb_array_length(p_steps) = 0 then
    raise exception 'at least one step required' using errcode = '22023';
  end if;

  if p_workshop_template is not null then
    select id into v_tmpl from public.template
    where id = p_workshop_template and (workspace_id is null or workspace_id = p_workspace);
    if v_tmpl is null then raise exception 'unknown workshop template' using errcode = '23503'; end if;
  end if;

  insert into public.program (workspace_id, team_id, title, kind, min_responses, assessment_kind,
                              collect_days, auto_workshop_template, created_by)
  values (p_workspace, p_team, btrim(p_title), 'flow', v_n, nullif(btrim(p_assessment_kind), ''),
          v_cd, v_tmpl, (select auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_steps) with ordinality as e(elem, ord) loop
    if (r.elem ->> 'kind') not in
       ('assessment','launch','interpret','workshop','commit','repulse','branch','custom') then
      raise exception 'bad step kind: %', r.elem ->> 'kind' using errcode = '22023';
    end if;

    -- validate a per-step workshop template, if supplied
    v_steptmpl := null;
    if (r.elem ->> 'kind') = 'workshop' and nullif(r.elem ->> 'template', '') is not null then
      select id into v_steptmpl from public.template
      where id = (r.elem ->> 'template')::uuid and (workspace_id is null or workspace_id = p_workspace);
      if v_steptmpl is null then raise exception 'unknown workshop template' using errcode = '23503'; end if;
    end if;

    v_ord := v_ord + 1;
    insert into public.program_step (program_id, workspace_id, ord, kind, title, status, gate, config)
    values (
      v_id, p_workspace, v_ord, r.elem ->> 'kind',
      coalesce(nullif(btrim(r.elem ->> 'title'), ''), initcap(r.elem ->> 'kind')),
      case when v_ord = 1 then 'active' else 'pending' end,
      case (r.elem ->> 'kind')
        when 'launch' then 'Hold until ' || v_n || ' people respond'
        when 'branch' then 'Routes to a workshop based on the results'
        when 'workshop' then case when coalesce(v_steptmpl, v_tmpl) is not null
                                  then 'Auto-builds when the threshold is met'
                                  else 'Build and run the session on the results' end
        else null end,
      case when v_steptmpl is not null then jsonb_build_object('template', v_steptmpl) else '{}'::jsonb end
    );
  end loop;
  perform private.seed_program_tasks(v_id);
  return v_id;
end;
$$;
