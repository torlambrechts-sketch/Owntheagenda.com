-- Data-driven assessment library: instruments become rows (global + workspace-custom),
-- browsable by category, with a scope (team aggregate vs individual profile).
create table if not exists public.assessment_template (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspace(id) on delete cascade,
  key text not null,
  name text not null,
  category text not null,
  scope text not null default 'team',          -- 'team' | 'individual'
  source text,
  description text,
  definition jsonb not null default '{}'::jsonb, -- { scale, dimensions[], items[], strengthDimension? }
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists assessment_template_global_key on public.assessment_template(key) where workspace_id is null;
create index if not exists assessment_template_ws_idx on public.assessment_template(workspace_id) where workspace_id is not null;

create trigger set_assessment_template_updated before update on public.assessment_template
  for each row execute function private.set_updated_at();

alter table public.assessment_template enable row level security;
create policy assessment_template_select on public.assessment_template
  for select to authenticated
  using (workspace_id is null or private.is_workspace_member(workspace_id));

-- Seed the built-in instruments as global templates --------------------------
insert into public.assessment_template (workspace_id, key, name, category, scope, source, description, definition)
select null, 'psych_safety_bang', 'Psychological Safety — Leadership Teams', 'psych_safety', 'team',
  'Grounded in Bang & Midelfart; Edmondson (1999); Fyhn et al. (2023)',
  'Psychological safety + behavioural integration, with a climate-strength read.',
  $j${"scale":{"min":1,"max":7,"minLabel":"Strongly disagree","maxLabel":"Strongly agree"},"strengthDimension":"safety","dimensions":[{"key":"safety","label":"Psychological safety","blurb":"Can we speak up, take risks and admit doubt without fear?"},{"key":"integration","label":"Behavioral integration","blurb":"Do we collaborate, share information and own decisions together?"}],"items":[{"key":"safety_1","dimension":"safety","text":"It's easy to raise problems and tough issues in this team."},{"key":"safety_2","dimension":"safety","text":"It's safe to take a risk in this team."},{"key":"safety_3","dimension":"safety","text":"It's safe to speak your mind in this team."},{"key":"safety_4","dimension":"safety","text":"There's room to express uncertainty or doubt in this team."},{"key":"int_1","dimension":"integration","text":"We feel mutually responsible for our decisions."},{"key":"int_2","dimension":"integration","text":"We understand each other's issues and needs."},{"key":"int_3","dimension":"integration","text":"We help each other solve problems."},{"key":"int_4","dimension":"integration","text":"We share relevant information with each other."},{"key":"int_5","dimension":"integration","text":"We share resources with each other."}]}$j$::jsonb
where not exists (select 1 from public.assessment_template where workspace_id is null and key='psych_safety_bang');

insert into public.assessment_template (workspace_id, key, name, category, scope, source, description, definition)
select null, 'team_effectiveness_bang', 'Team Effectiveness — Leadership Teams', 'team_effectiveness', 'team',
  'Grounded in Bang & Midelfart',
  'Task performance + member satisfaction.',
  $j${"scale":{"min":1,"max":7,"minLabel":"Strongly disagree","maxLabel":"Strongly agree"},"strengthDimension":"task","dimensions":[{"key":"task","label":"Task performance","blurb":"Do we create value, decide well and follow through?"},{"key":"satisfaction","label":"Member satisfaction","blurb":"Does being on this team help us learn, grow and stay motivated?"}],"items":[{"key":"task_1","dimension":"task","text":"This team's work creates real value for the organisation."},{"key":"task_2","dimension":"task","text":"We make high-quality decisions."},{"key":"task_3","dimension":"task","text":"We give the organisation clear direction."},{"key":"task_4","dimension":"task","text":"We're aligned on what matters most."},{"key":"task_5","dimension":"task","text":"We follow through on what we commit to."},{"key":"sat_1","dimension":"satisfaction","text":"Being on this team helps me learn and grow."},{"key":"sat_2","dimension":"satisfaction","text":"I feel good about how we work together."},{"key":"sat_3","dimension":"satisfaction","text":"This team motivates me to do my best."}]}$j$::jsonb
where not exists (select 1 from public.assessment_template where workspace_id is null and key='team_effectiveness_bang');

insert into public.assessment_template (workspace_id, key, name, category, scope, source, description, definition)
select null, 'team_learning_edmondson', 'Team Learning', 'team_learning', 'team',
  'Grounded in Edmondson',
  'Team learning behaviour: feedback, error discussion, experimentation, reflection.',
  $j${"scale":{"min":1,"max":7,"minLabel":"Strongly disagree","maxLabel":"Strongly agree"},"strengthDimension":"learning","dimensions":[{"key":"learning","label":"Team learning","blurb":"Do we seek feedback, learn from mistakes and adapt how we work?"}],"items":[{"key":"learn_1","dimension":"learning","text":"We regularly ask for feedback on how we're doing."},{"key":"learn_2","dimension":"learning","text":"We openly discuss mistakes so we can learn from them."},{"key":"learn_3","dimension":"learning","text":"We try new ways of working and experiment."},{"key":"learn_4","dimension":"learning","text":"We take time to reflect on how we work, not just what we deliver."},{"key":"learn_5","dimension":"learning","text":"We seek out information and views from outside the team."}]}$j$::jsonb
where not exists (select 1 from public.assessment_template where workspace_id is null and key='team_learning_edmondson');

insert into public.assessment_template (workspace_id, key, name, category, scope, source, description, definition)
select null, 'working_style', 'Working Style', 'personality', 'individual',
  'OwnTheAgenda original working-style self-assessment',
  'A personal read on how you work best — to share with your team.',
  $j${"scale":{"min":1,"max":7,"minLabel":"Strongly disagree","maxLabel":"Strongly agree"},"dimensions":[{"key":"structure","label":"Structure","blurb":"Plan and process vs. improvise and adapt."},{"key":"pace","label":"Pace","blurb":"Act fast vs. deliberate."},{"key":"focus","label":"Focus","blurb":"Big-picture vs. detail."},{"key":"social","label":"Social energy","blurb":"Energised by people vs. solo focus."}],"items":[{"key":"structure_1","dimension":"structure","text":"I plan my work in detail before starting."},{"key":"structure_2","dimension":"structure","text":"I prefer clear structure and process."},{"key":"pace_1","dimension":"pace","text":"I make decisions quickly and adjust as I go."},{"key":"pace_2","dimension":"pace","text":"I'd rather act now than wait for more information."},{"key":"focus_1","dimension":"focus","text":"I'm drawn to the big picture more than the details."},{"key":"focus_2","dimension":"focus","text":"I naturally think about long-term implications."},{"key":"social_1","dimension":"social","text":"I get energy from working closely with others."},{"key":"social_2","dimension":"social","text":"I think best by talking things through with people."}]}$j$::jsonb
where not exists (select 1 from public.assessment_template where workspace_id is null and key='working_style');

insert into public.assessment_template (workspace_id, key, name, category, scope, source, description, definition)
select null, 'strengths_snapshot', 'Strengths Snapshot', 'personality', 'individual',
  'OwnTheAgenda original strengths self-assessment',
  'Where your strengths sit across four domains.',
  $j${"scale":{"min":1,"max":7,"minLabel":"Strongly disagree","maxLabel":"Strongly agree"},"dimensions":[{"key":"executing","label":"Executing","blurb":"Getting things done and following through."},{"key":"influencing","label":"Influencing","blurb":"Speaking up, persuading, taking charge."},{"key":"relating","label":"Relating","blurb":"Building trust and reading people."},{"key":"thinking","label":"Thinking","blurb":"Analysis, ideas, strategy."}],"items":[{"key":"exec_1","dimension":"executing","text":"I'm great at getting things done and following through."},{"key":"exec_2","dimension":"executing","text":"I bring discipline and reliability to a team."},{"key":"infl_1","dimension":"influencing","text":"I'm comfortable speaking up and persuading others."},{"key":"infl_2","dimension":"influencing","text":"I naturally take charge when direction is needed."},{"key":"rel_1","dimension":"relating","text":"I build strong, trusting relationships easily."},{"key":"rel_2","dimension":"relating","text":"I'm attuned to how others are feeling."},{"key":"think_1","dimension":"thinking","text":"I love analysing problems and finding patterns."},{"key":"think_2","dimension":"thinking","text":"I bring ideas and strategic thinking."}]}$j$::jsonb
where not exists (select 1 from public.assessment_template where workspace_id is null and key='strengths_snapshot');
