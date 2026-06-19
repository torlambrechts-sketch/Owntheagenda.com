-- =====================================================================
-- Assessment report copy (closes the "no authored per-trait narrative" gap)
-- ---------------------------------------------------------------------
-- Authored, plain-language content per (instrument, dimension): what it
-- means, where it helps, what to watch for, and statements people with the
-- result tend to recognise. Global reference content (like dynamic_band),
-- read by any authenticated member; the report falls back to the dimension
-- blurb when a row is absent.
-- =====================================================================

create table if not exists public.assessment_trait_copy (
  id            uuid primary key default gen_random_uuid(),
  template_key  text not null,
  dimension_key text not null,
  definition    text not null,
  advantages    text[] not null default '{}',
  risks         text[] not null default '{}',
  statements    text[] not null default '{}',
  created_at    timestamptz not null default now(),
  unique (template_key, dimension_key)
);

grant select on public.assessment_trait_copy to authenticated;
alter table public.assessment_trait_copy enable row level security;
drop policy if exists assessment_trait_copy_select on public.assessment_trait_copy;
create policy assessment_trait_copy_select on public.assessment_trait_copy
  for select to authenticated using (true);

insert into public.assessment_trait_copy (template_key, dimension_key, definition, advantages, risks, statements) values
-- Working Style
('working_style','structure',
 'How much you plan, organise and rely on clear processes rather than improvising.',
 array['Brings order to ambiguous work and keeps commitments visible','Others can depend on follow-through and predictable delivery'],
 array['Can resist useful change once a plan is set','May over-engineer process for work that needs speed'],
 array['I like to map out the steps before I start','I feel uneasy when things are left loosely defined']),
('working_style','pace',
 'The speed and urgency you prefer to work at, and how comfortable you are with fast change.',
 array['Creates momentum and pushes work to a finish','Comfortable making progress under time pressure'],
 array['Can move before others are ready or aligned','May undervalue reflection and slower, careful work'],
 array['I get impatient when things move slowly','I would rather decide and adjust than wait for certainty']),
('working_style','focus',
 'Whether you go deep on one thing at a time or range broadly across many.',
 array['Sustains attention and produces thorough, detailed work','Hard to distract once engaged in a problem'],
 array['Can be hard to interrupt or re-prioritise','May lose the wider picture while deep in detail'],
 array['I prefer to finish one thing before starting another','I notice details others miss']),
('working_style','social',
 'How much energy you draw from working with and around other people.',
 array['Builds connection and brings people into the work','Comfortable thinking out loud and collaborating live'],
 array['Can find solo, heads-down stretches draining','May fill quiet that others need to think'],
 array['I do my best thinking in conversation','I seek out other people when I am working on something']),
-- Strengths Snapshot
('strengths_snapshot','executing',
 'Turning intentions into finished work — drive, discipline and follow-through.',
 array['Reliably gets things done and closes the loop','Holds standards and keeps work moving to completion'],
 array['Can push through when a pause would serve better','May take on too much rather than delegate'],
 array['I feel best when I have finished what I set out to do','People count on me to deliver']),
('strengths_snapshot','influencing',
 'Reaching out, speaking up and moving others to act.',
 array['Makes the case and rallies people behind an idea','Comfortable taking the lead in a room'],
 array['Can dominate airtime or decide too quickly','May persuade past genuine disagreement'],
 array['I enjoy convincing people of a direction','I step forward when no one else does']),
('strengths_snapshot','relating',
 'Building trust, reading people and strengthening relationships.',
 array['Creates safety and looks after how people are doing','Notices tension early and tends the team''s bonds'],
 array['Can avoid necessary conflict to keep harmony','May carry others'' feelings more than is healthy'],
 array['I quickly sense how someone in the room is feeling','I invest in the people I work with']),
('strengths_snapshot','thinking',
 'Making sense of information — analysis, ideas and learning.',
 array['Brings rigour, fresh angles and good questions','Sees patterns and weighs options before acting'],
 array['Can over-analyse and delay a decision','May value the idea over getting it shipped'],
 array['I like to understand why before I act','I often see options other people miss']),
-- Psychological Safety — Leadership Teams
('psych_safety_bang','safety',
 'Whether people can speak up, take risks and admit doubt without fear of being judged.',
 array['People raise problems and bad news early','Mistakes become learning rather than blame'],
 array['Low safety hides risks until they are expensive','Quietest voices and dissent get lost'],
 array['It is easy to raise tough issues in this team','It is safe to take a risk here']),
('psych_safety_bang','integration',
 'How well the team collaborates, shares information and owns its decisions together.',
 array['Decisions are jointly owned and information flows','Members help each other and share resources'],
 array['Weak integration fragments into silos','Accountability for shared work gets diffuse'],
 array['We feel mutually responsible for our decisions','We share relevant information with each other']),
-- Team Effectiveness — Leadership Teams
('team_effectiveness_bang','task',
 'How well the team creates value, decides well and follows through on its work.',
 array['The team delivers and decisions hold up','Energy goes to the work that matters most'],
 array['Persistent delivery gaps erode trust in the team','Unclear priorities scatter effort'],
 array['This team makes good decisions','We follow through on what we commit to']),
('team_effectiveness_bang','satisfaction',
 'Whether being on the team helps members learn, grow and stay motivated.',
 array['People are motivated and developing','Membership is energising, not draining'],
 array['Low satisfaction shows up later as turnover','Disengagement quietly lowers contribution'],
 array['Being on this team helps me grow','I am motivated by the work we do together']),
-- Team Learning
('team_learning_edmondson','learning',
 'How readily the team seeks feedback, surfaces errors, experiments and reflects.',
 array['The team improves deliberately over time','Errors and feedback are used, not hidden'],
 array['Without learning, the same mistakes repeat','Reflection gets crowded out by delivery'],
 array['We regularly take time to reflect on how we work','We talk openly about errors to learn from them']);
