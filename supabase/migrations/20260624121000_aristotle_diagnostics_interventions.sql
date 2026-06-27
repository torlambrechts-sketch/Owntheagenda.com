-- =====================================================================
-- OwnTheAgenda · Aristotle diagnostics + modular interventions
-- ---------------------------------------------------------------------
-- Three data-driven reference tables turn raw pillar scores into a
-- tailored workshop, with no branching logic baked into application code:
--
--   diagnostic_rule         (template_key, dimension_key) → the thresholds
--                           and the SPECIFIC structural failure a low
--                           score flags (construct-isolated — low
--                           Structure & Clarity flags a role-definition
--                           failure, never an interpersonal-trust issue).
--
--   intervention_module     reusable, NHH-Smart-Start-style workshop
--                           modules; each `definition.phases[]` is data.
--
--   dimension_intervention  the lookup: a low-scoring pillar → the
--                           module(s) that remediate it, in priority order.
--
-- The aristotle_diagnostic() RPC composes them: reverse-aware pillar means
-- → banding → structural-failure flags → the set of remediation modules →
-- a generated, ordered workshop spec. create_workshop_from_diagnostic()
-- materialises that spec into a runnable workshop + blocks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. diagnostic_rule — thresholds + the structural failure a low score means
-- ---------------------------------------------------------------------
create table if not exists public.diagnostic_rule (
  id             uuid primary key default gen_random_uuid(),
  template_key   text not null,
  dimension_key  text not null,
  -- thresholds on the instrument's RAW (reverse-corrected) Likert scale:
  critical_at    numeric not null default 2.40,  -- mean below this → acute
  trigger_at     numeric not null default 3.20,  -- mean below this → structural failure flagged
  strong_at      numeric not null default 3.80,  -- mean at/above this → "strong"
  failure_mode   text not null,                  -- machine code, e.g. 'role_definition'
  failure_label  text not null,                  -- human label
  structural_flag text not null,                 -- stable flag constant for downstream systems
  narrative      text not null,                  -- what the deficit means + how to read it
  ord            int  not null default 0,
  unique (template_key, dimension_key)
);

grant select on public.diagnostic_rule to authenticated;
alter table public.diagnostic_rule enable row level security;
drop policy if exists diagnostic_rule_select on public.diagnostic_rule;
create policy diagnostic_rule_select on public.diagnostic_rule
  for select to authenticated using (true);

insert into public.diagnostic_rule
  (template_key, dimension_key, failure_mode, failure_label, structural_flag, narrative, ord) values
('aristotle_team','psych_safety','voice_suppression','Interpersonal risk suppression','PSYCH_SAFETY_VOICE_FAILURE',
 'Members are withholding questions, concerns and mistakes. Treat this as a candor/voice failure — remediate with explicit safety norms and leader modelling, not performance pressure.',1),
('aristotle_team','dependability','execution_reliability','Execution reliability breakdown','DEPENDABILITY_FOLLOW_THROUGH_FAILURE',
 'Commitments and the quality bar are not holding. Treat this as a follow-through and accountability failure — remediate with a shared definition of done and commitment tracking, not a motivation push.',2),
('aristotle_team','structure_clarity','role_definition','Role-definition & decision-rights failure','STRUCTURE_ROLE_DEFINITION_FAILURE',
 'Roles, goals or decision rights are ambiguous. This is a STRUCTURAL design failure — remediate by mapping owners and decision rights. Do NOT diagnose it as an interpersonal-trust problem.',3),
('aristotle_team','meaning','motivational_disconnect','Motivational disconnect','MEANING_RESONANCE_FAILURE',
 'The work is not landing as personally meaningful. Treat this as a meaning/recognition failure — reconnect work to purpose and recognise contribution, not as a process problem.',4),
('aristotle_team','impact','efficacy_line_of_sight','Impact line-of-sight failure','IMPACT_LINE_OF_SIGHT_FAILURE',
 'Members cannot see their work producing results. Treat this as an efficacy/line-of-sight failure — make outcomes visible and trace activity to results.',5)
on conflict (template_key, dimension_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. intervention_module — reusable workshop modules (data, not code)
-- ---------------------------------------------------------------------
create table if not exists public.intervention_module (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique,
  name             text not null,
  source           text,
  default_duration int not null default 40,
  summary          text,
  definition       jsonb not null default '{"phases":[]}'::jsonb,  -- { phases:[{title,type,minutes,prompt,dynamic?,config?}] }
  created_at       timestamptz not null default now()
);

grant select on public.intervention_module to authenticated;
alter table public.intervention_module enable row level security;
drop policy if exists intervention_module_select on public.intervention_module;
create policy intervention_module_select on public.intervention_module
  for select to authenticated using (true);

insert into public.intervention_module (key, name, source, default_duration, summary, definition) values
('mod_safety_to_speak','Safety to Speak','Edmondson · OwnTheAgenda',40,
 'Raise psychological safety: name what gets withheld and agree norms that protect candor.',
 $j${"phases":[
   {"title":"Check-in","type":"checkin","minutes":5,"prompt":"One word: how safe does it feel to speak up on this team right now?"},
   {"title":"What we hold back","type":"brainstorm","minutes":12,"dynamic":"psych_safety","prompt":"Think of a time you held back a question, concern or mistake. What was at stake — and what stopped you? Write privately, one per card.","config":{"silent":true,"budget":0}},
   {"title":"Make it safer","type":"feedback","minutes":15,"dynamic":"psych_safety","prompt":"What would make it safer to speak up, disagree and admit mistakes here?","config":{"lanes":["Start doing","Stop doing","Leaders model"]}},
   {"title":"Commit to two norms","type":"outcome","minutes":8,"prompt":"Agree two team norms that invite and protect candor — each owned and dated."}
 ]}$j$::jsonb),
('mod_reliable_by_design','Reliable by Design','OwnTheAgenda',40,
 'Rebuild dependability: a shared definition of done and a way to make and track commitments.',
 $j${"phases":[
   {"title":"Where it slipped","type":"checkin","minutes":4,"prompt":"Name one commitment that slipped recently and what it cost us."},
   {"title":"Map the breakdowns","type":"feedback","minutes":14,"dynamic":"decision_rights","prompt":"Where does follow-through hold, and where does it break?","config":{"lanes":["We keep these well","Follow-through slips","Handoffs that break"]}},
   {"title":"Definition of done","type":"discuss","minutes":14,"prompt":"Agree what 'done' means here, and how we make and track commitments so nothing needs chasing.","config":{"capture":"commitments"}},
   {"title":"Adopt one practice","type":"outcome","minutes":8,"prompt":"Name one accountability practice we will adopt — owner and cadence."}
 ]}$j$::jsonb),
('mod_lanes_and_decisions','Lanes & Decisions','OwnTheAgenda',42,
 'Fix structure & clarity: map responsibilities to single owners and agree decision rights.',
 $j${"phases":[
   {"title":"Where it is unclear","type":"checkin","minutes":4,"prompt":"Where do you feel unclear about who owns what?"},
   {"title":"Roles & owners","type":"charter","minutes":16,"dynamic":"role_clarity","prompt":"Map each key responsibility to a single owner. Name the gaps and the overlaps.","config":{"section":"roles"}},
   {"title":"Decision rights","type":"charter","minutes":14,"dynamic":"decision_rights","prompt":"For our recurring decisions, agree who Recommends, Agrees, Decides and is Informed (RAPID/RACI).","config":{"section":"decisions"}},
   {"title":"Lock it in","type":"outcome","minutes":8,"prompt":"Write down the clarified roles and decision rights, and what each person will do differently."}
 ]}$j$::jsonb),
('mod_why_this_matters','Why This Matters','OwnTheAgenda',42,
 'Restore meaning: connect the work to personal purpose and recognise contribution.',
 $j${"phases":[
   {"title":"What makes it meaningful","type":"manual","minutes":14,"dynamic":"psych_safety","prompt":"Share what makes this work meaningful to you — and what drains it.","config":{"fields":["motivators","drains"],"allowPass":true,"leaderFirst":true}},
   {"title":"Work meets purpose","type":"discuss","minutes":14,"prompt":"Connect our team's work to the mission and to what each of us cares about. Where do they meet — and where is the gap?"},
   {"title":"Recognise contribution","type":"feedback","minutes":8,"prompt":"Name a contribution from someone here that deserves recognition.","config":{"lanes":["Recognise","More of this","Less of this"]}},
   {"title":"One change","type":"outcome","minutes":6,"prompt":"Each person names one change that would make the work more meaningful."}
 ]}$j$::jsonb),
('mod_line_of_sight','Line of Sight','OwnTheAgenda',38,
 'Restore impact: trace work to outcomes and make results visible.',
 $j${"phases":[
   {"title":"Activity → result","type":"canvas","minutes":14,"prompt":"Map our work to the outcomes it is meant to drive. Draw the line from activity → result → who it serves."},
   {"title":"Where the line breaks","type":"discuss","minutes":14,"prompt":"Where is the line of sight strong, and where does it break? What are we doing that has little real effect?"},
   {"title":"Make outcomes visible","type":"outcome","minutes":10,"prompt":"Choose 1–2 outcome metrics we will make visible, and an owner to report them on a cadence."}
 ]}$j$::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. dimension_intervention — low pillar → remediation module(s)
-- ---------------------------------------------------------------------
create table if not exists public.dimension_intervention (
  id            uuid primary key default gen_random_uuid(),
  template_key  text not null,
  dimension_key text not null,
  module_key    text not null references public.intervention_module(key) on delete cascade,
  ord           int  not null default 0,
  rationale     text,
  unique (template_key, dimension_key, module_key)
);

grant select on public.dimension_intervention to authenticated;
alter table public.dimension_intervention enable row level security;
drop policy if exists dimension_intervention_select on public.dimension_intervention;
create policy dimension_intervention_select on public.dimension_intervention
  for select to authenticated using (true);

insert into public.dimension_intervention (template_key, dimension_key, module_key, ord, rationale) values
('aristotle_team','psych_safety','mod_safety_to_speak',1,'Directly targets candor, risk tolerance and error response.'),
('aristotle_team','dependability','mod_reliable_by_design',1,'Targets follow-through, quality bar and mutual accountability.'),
('aristotle_team','structure_clarity','mod_lanes_and_decisions',1,'Targets role clarity, decision rights and process predictability.'),
('aristotle_team','meaning','mod_why_this_matters',1,'Targets personal resonance, purpose alignment and recognition.'),
('aristotle_team','impact','mod_line_of_sight',1,'Targets line of sight, efficacy and visible outcomes.')
on conflict (template_key, dimension_key, module_key) do nothing;

-- ---------------------------------------------------------------------
-- 4. Also publish each module as a runnable system workshop template, so a
--    single-pillar remediation can be run standalone from the library.
-- ---------------------------------------------------------------------
insert into public.template (workspace_id, key, name, category, source, default_duration, description, definition)
select null, im.key, im.name, 'team', im.source, im.default_duration, im.summary, im.definition
from public.intervention_module im
where im.key in ('mod_safety_to_speak','mod_reliable_by_design','mod_lanes_and_decisions','mod_why_this_matters','mod_line_of_sight')
on conflict (key) where workspace_id is null do nothing;

-- ---------------------------------------------------------------------
-- 5. RPC: aristotle_diagnostic(survey) → scores, structural flags, modules,
--    and a generated, ordered workshop spec built from the team's deficits.
-- ---------------------------------------------------------------------
create or replace function public.aristotle_diagnostic(p_survey uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_kind text; v_team uuid; v_ws uuid; v_def jsonb;
  v_min numeric; v_max numeric; v_mid numeric; v_n int;
  v_pillars jsonb; v_modules jsonb; v_body jsonb; v_phases jsonb;
  v_intro jsonb; v_close jsonb; v_total int; v_targets jsonb; v_spec jsonb;
begin
  select kind, team_id, definition into v_kind, v_team, v_def from public.survey where id = p_survey;
  if v_kind is null then raise exception 'survey not found' using errcode = '23503'; end if;
  if v_kind <> 'aristotle_team' then
    raise exception 'survey is not a Project Aristotle instrument' using errcode = '22023';
  end if;
  if not private.can_read_team(v_team) then raise exception 'not allowed' using errcode = '42501'; end if;

  -- prefer the survey's frozen definition snapshot; fall back to the live template
  if v_def is null then
    select workspace_id into v_ws from public.team where id = v_team;
    select definition into v_def from public.assessment_template
      where key = v_kind and (workspace_id = v_ws or workspace_id is null)
      order by workspace_id nulls last limit 1;
  end if;
  v_min := coalesce((v_def->'scale'->>'min')::numeric, 1);
  v_max := coalesce((v_def->'scale'->>'max')::numeric, 5);
  v_mid := (v_min + v_max) / 2.0;

  select count(*) into v_n from public.survey_response where survey_id = p_survey;
  if v_n < 3 then
    return jsonb_build_object(
      'survey', p_survey, 'framework', 'project_aristotle', 'respondents', v_n,
      'masked', true, 'scale_min', v_min, 'scale_max', v_max,
      'pillars', '[]'::jsonb, 'recommended_modules', '[]'::jsonb, 'workshop_spec', null);
  end if;

  -- ----- per-pillar reverse-aware mean (raw scale) + banding + flags -----
  with item_mean as (
    select e.key as item_key, avg((e.value)::numeric) as m
    from public.survey_response r, jsonb_each_text(r.scores) e
    where r.survey_id = p_survey group by e.key
  ),
  def_items as (
    select it->>'key' as item_key, it->>'dimension' as dim,
           coalesce((it->>'reverse')::boolean, false) as rev
    from jsonb_array_elements(v_def->'items') it
  ),
  pillar_mean as (
    select di.dim, round(avg(case when di.rev then v_min + v_max - im.m else im.m end), 2) as mean
    from def_items di join item_mean im on im.item_key = di.item_key
    group by di.dim
  ),
  scored as (
    select d.key as dim, d.label, pm.mean,
           dr.critical_at, dr.trigger_at, dr.strong_at,
           dr.failure_mode, dr.failure_label, dr.structural_flag, dr.narrative, dr.ord
    from jsonb_to_recordset(v_def->'dimensions') as d(key text, label text)
    left join pillar_mean pm on pm.dim = d.key
    left join public.diagnostic_rule dr
      on dr.template_key = 'aristotle_team' and dr.dimension_key = d.key
  )
  select jsonb_agg(jsonb_build_object(
           'pillar', dim, 'label', label,
           'mean', mean,
           'pct', case when mean is null then null
                       else round((mean - v_min) / (v_max - v_min) * 100, 0) end,
           'band', case when mean is null then 'no_data'
                        when mean < critical_at then 'critical'
                        when mean < trigger_at  then 'deficit'
                        when mean < strong_at   then 'moderate'
                        else 'strong' end,
           'flagged', (mean is not null and mean < trigger_at),
           'severity', case when mean is not null and mean < critical_at then 2
                            when mean is not null and mean < trigger_at  then 1 else 0 end,
           'failure_mode',    case when mean is not null and mean < trigger_at then failure_mode    end,
           'failure_label',   case when mean is not null and mean < trigger_at then failure_label   end,
           'structural_flag', case when mean is not null and mean < trigger_at then structural_flag end,
           'narrative',       case when mean is not null and mean < trigger_at then narrative       end,
           'thresholds', jsonb_build_object('critical_at', critical_at, 'trigger_at', trigger_at, 'strong_at', strong_at)
         ) order by ord)
  into v_pillars from scored;

  -- ----- remediation modules for the flagged pillars (priority order) -----
  with fl as (
    select x.pillar, x.label, x.severity
    from jsonb_to_recordset(v_pillars) as x(pillar text, label text, severity int, flagged boolean)
    where x.flagged
  ),
  mods as (
    select di.module_key, im.name, im.summary, im.default_duration, im.definition,
           max(fl.severity) as sev, min(di.ord) as iord,
           jsonb_agg(distinct fl.label) as targets
    from fl
    join public.dimension_intervention di
      on di.template_key = 'aristotle_team' and di.dimension_key = fl.pillar
    join public.intervention_module im on im.key = di.module_key
    group by di.module_key, im.name, im.summary, im.default_duration, im.definition
  )
  select
    jsonb_agg(jsonb_build_object(
      'module', module_key, 'name', name, 'summary', summary,
      'minutes', default_duration, 'targets', targets
    ) order by sev desc, iord),
    coalesce((
      select jsonb_agg(ph.elem order by m2.sev desc, m2.iord, ph.ord)
      from mods m2, jsonb_array_elements(m2.definition->'phases') with ordinality ph(elem, ord)
    ), '[]'::jsonb)
  into v_modules, v_body
  from mods;

  -- ----- assemble the tailored workshop spec -----
  if v_modules is null or jsonb_array_length(coalesce(v_body, '[]'::jsonb)) = 0 then
    v_spec := null;  -- no structural deficits → no intervention generated
  else
    select jsonb_agg(t.label order by t.ord)
    into v_targets
    from jsonb_to_recordset(v_pillars) as t(label text, flagged boolean, ord int)
    where t.flagged;

    v_intro := jsonb_build_object(
      'title','Where we stand','type','assess','minutes',8,
      'prompt','Reflect on the Aristotle read for this team — what stands out, and what surprised you?',
      'config', jsonb_build_object('timing','live','survey', p_survey));
    v_close := jsonb_build_object(
      'title','Commit & schedule the re-measure','type','outcome','minutes',10,
      'prompt','Turn today into owned, dated commitments, and schedule the follow-up pulse to re-measure the shift.');

    v_phases := jsonb_build_array(v_intro) || v_body || jsonb_build_array(v_close);

    select coalesce(sum((ph.elem->>'minutes')::int), 0)
    into v_total
    from jsonb_array_elements(v_phases) ph(elem);

    v_spec := jsonb_build_object(
      'title', 'Aristotle follow-up — tailored intervention',
      'generated_from', v_targets,
      'total_minutes', v_total,
      'phases', v_phases);
  end if;

  return jsonb_build_object(
    'survey', p_survey, 'framework', 'project_aristotle', 'respondents', v_n,
    'masked', false, 'scale_min', v_min, 'scale_max', v_max,
    'pillars', coalesce(v_pillars, '[]'::jsonb),
    'recommended_modules', coalesce(v_modules, '[]'::jsonb),
    'workshop_spec', v_spec);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RPC: materialise the generated spec into a runnable workshop + blocks.
-- ---------------------------------------------------------------------
create or replace function public.create_workshop_from_diagnostic(
  p_team uuid, p_survey uuid, p_title text default null
) returns public.workshop language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_diag jsonb; v_phases jsonb; v_title text; v_row public.workshop;
begin
  select workspace_id into v_ws from public.team where id = p_team;
  if v_ws is null or not private.can_manage_team(p_team) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  v_diag := public.aristotle_diagnostic(p_survey);
  if coalesce((v_diag->>'masked')::boolean, true) then
    raise exception 'not enough responses to generate an intervention' using errcode = '22023';
  end if;
  v_phases := v_diag->'workshop_spec'->'phases';
  if v_phases is null or jsonb_array_length(v_phases) = 0 then
    raise exception 'no structural deficits detected — no intervention needed' using errcode = '22023';
  end if;

  v_title := coalesce(nullif(btrim(p_title), ''), v_diag->'workshop_spec'->>'title', 'Aristotle follow-up');

  insert into public.workshop (team_id, title, created_by)
  values (p_team, v_title, (select auth.uid()))
  returning * into v_row;

  insert into public.block (workshop_id, ord, title, activity_type, duration, prompt, linked_dynamic, config)
  select v_row.id, ph.ord,
         coalesce(ph.elem ->> 'title', 'Step'),
         coalesce((ph.elem ->> 'type')::public.activity_type, 'canvas'),
         coalesce((ph.elem ->> 'minutes')::int, 10),
         ph.elem ->> 'prompt',
         (ph.elem ->> 'dynamic')::public.team_dynamic,
         coalesce(ph.elem -> 'config', '{}'::jsonb)
  from jsonb_array_elements(v_phases) with ordinality ph(elem, ord);

  perform private.write_audit(v_ws, (select auth.uid()), 'workshop.created', 'workshop', v_row.id,
                              jsonb_build_object('source', 'aristotle_diagnostic', 'survey', p_survey));
  return v_row;
end;
$$;

grant execute on function public.aristotle_diagnostic(uuid) to authenticated;
grant execute on function public.create_workshop_from_diagnostic(uuid, uuid, text) to authenticated;
revoke execute on function public.aristotle_diagnostic(uuid) from public, anon;
revoke execute on function public.create_workshop_from_diagnostic(uuid, uuid, text) from public, anon;
