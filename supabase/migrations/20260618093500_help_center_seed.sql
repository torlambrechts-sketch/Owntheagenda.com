-- Initial published content. Idempotent: articles key on slug; FAQ seeds only
-- when empty. Staff can edit/extend everything later via the in-app CMS.

insert into public.help_article (kind, slug, title, summary, category, topic_key, icon, sort, status, body) values
('guide','getting-started','Welcome to OwnTheAgenda','A 5-minute tour of how the product fits together.','basics',null,'rocket',0,'published',
$b$OwnTheAgenda turns leadership intent into team momentum. You run **assessments** to see how a team is really doing, facilitate **workshops** that act on what you learn, and track the **actions** and **health** that come out of them.

## The shape of the product
- **Teams** are the unit everything hangs off — people, assessments and workshops all belong to a team.
- **Assessments** measure five research-backed dynamics and feed your **Health** dashboard.
- **Workshops** are structured, time-boxed sessions you run live with a team.
- **Actions** capture the commitments a session produces so nothing falls through.

## Your first 15 minutes
1. Create or join your company.
2. Add a team and a few people.
3. Run a quick assessment or a check-in workshop.
4. Review the readout and assign a couple of actions.

That loop — measure, meet, commit — is the whole game.$b$),

('guide','invite-your-company','Invite your company','Bring people in by email, Company ID, or CSV.','basics',null,'users',1,'published',
$b$There are three ways to get people into your workspace.

## 1. Invite by email
On **Members → Invite member**, enter an email and pick a role. They get a link to accept.

## 2. Share your Company ID
Every company has a short **Company ID** (Members or Organization). Anyone with it can self-join at signup. Employees and facilitators are active immediately; Team Managers and Company Admins wait for an admin to approve them.

## 3. Import a CSV
For a whole team at once, use **Members → Import CSV** with columns `email, role, team, role_title`. You'll see a preview of which rows are valid before anything is sent.$b$),

('guide','set-up-teams','Set up your teams','Teams are the backbone — here''s how to structure them.','teams',null,'teams',2,'published',
$b$A **team** is a group of people who work together and whose effectiveness you want to improve. Most companies mirror their org chart, but you can also create teams for projects or leadership groups.

## Good practice
- Keep teams to the people who actually collaborate week to week (roughly 4–9 people).
- Give each team a **lead** — they can run workshops and see their team's health.
- Add a **role title** for each member so role clarity is obvious from day one.

Once a team exists, you can assess it, run workshops for it, and watch its health trend over time.$b$),

('guide','run-first-workshop','Run your first workshop','Pick a template, invite the team, facilitate live.','workshops',null,'calendar',3,'published',
$b$Workshops are structured sessions you run live. Each is built from time-boxed **blocks** — brainstorm, vote, discuss, decide — so the conversation stays focused.

## Steps
1. Go to **Workshops → New** and choose a template (or start from a category like Retrospective or Kickoff).
2. Attach it to a team and schedule it.
3. When it's time, open the session and share the join link. Everyone joins on their own device.
4. Move block by block. The tool reveals contributions, runs the votes, and captures decisions.
5. Close out with **actions** and an automatic readout.

You don't need to be a professional facilitator — the structure does the heavy lifting.$b$),

('guide','run-an-assessment','Run a team assessment','Measure five dynamics in a few minutes per person.','assessments',null,'chart',4,'published',
$b$An assessment asks each team member a short set of questions and rolls the answers into five dynamics: psychological safety, trust, healthy conflict, role clarity and decision rights.

## How to run one
1. From a team or **Assessments**, start a new assessment.
2. Everyone responds privately — individual answers are never shown to teammates.
3. Once enough people respond, the team-level results appear on **Health**.

Because responses are private and aggregated, people answer honestly — which is the whole point. Re-run quarterly to see the trend.$b$),

('guide','read-team-health','Read your team health','What the scores mean and where to focus.','health',null,'pulse',5,'published',
$b$**Health** turns assessment responses into a clear picture of how a team is doing across the five dynamics, with a benchmark percentile so you know what''s strong and what needs attention.

## Reading it well
- Look at the **lowest** dynamic first — it's usually the constraint holding the others back.
- Watch the **trend**, not just the snapshot. A 60 that's climbing beats a 70 that's falling.
- Pair a weak dynamic with a workshop designed to move it (see *Learn the science* links on each dynamic).

Health is a conversation starter, not a verdict. Bring it to the team and decide together what to try next.$b$),

('science','team-effectiveness','The science of team effectiveness','Why how a team works together beats who is on it.','foundations',null,'book',0,'published',
$b$Great teams aren't an accident, and they aren't just a matter of hiring stars. Decades of research — Bruce Tuckman's stages of group development (1965), the Aristotle study at Google (2015), and Amy Edmondson's work on psychological safety — converge on one idea: **how** a team works together predicts performance more reliably than **who** is on it.

OwnTheAgenda measures the five dynamics the evidence links most strongly to team performance:

- **Psychological safety** — can people speak up without fear?
- **Trust** — will they be vulnerable with each other?
- **Healthy conflict** — can they disagree productively?
- **Role clarity** — does everyone know who does what?
- **Decision rights** — is it clear who decides?

These build on each other. Patrick Lencioni's *Five Dysfunctions of a Team* describes a similar pyramid: trust at the base, then the ability to engage in conflict, commit, hold each other accountable, and focus on results. Measure the dynamics, talk about them openly, and run sessions that move the weakest one — that's the loop this product is built around.$b$),

('science','psychological-safety','Psychological safety','The single biggest predictor of team performance.','dynamics','dynamic:psych_safety','shield',1,'published',
$b$**Psychological safety** is the shared belief that a team is safe for interpersonal risk-taking — that you can ask a question, admit a mistake, or challenge an idea without being punished or humiliated. The term comes from Harvard's **Amy Edmondson**, whose research on hospital teams found that the *best* teams reported *more* errors — not because they made more, but because they felt safe enough to surface them.

When Google studied 180 of its own teams (Project Aristotle), psychological safety was the strongest differentiator of high-performing teams, ahead of dependability, structure, meaning and impact.

## What it looks like
- People ask "naive" questions and admit when they don't know.
- Mistakes are treated as learning, not ammunition.
- Quieter voices get heard, not just the loudest.

## How to build it
- Leaders go first: model curiosity and admit your own mistakes.
- Frame work as a learning problem, not an execution problem.
- Respond to bad news with appreciation, not blame.$b$),

('science','trust','Trust','Vulnerability-based trust is the foundation everything else sits on.','dynamics','dynamic:trust','heart',2,'published',
$b$In a team context, **trust** isn't just predicting that a colleague will deliver — it's **vulnerability-based trust**: the confidence that you can be open about weaknesses, mistakes and needs without it being used against you. Lencioni places it at the base of his pyramid because without it, every other dynamic degrades.

## Why it matters
Teams with high trust spend less energy on self-protection and politics, and more on the work. People ask for help sooner, give honest feedback, and recover from conflict faster.

## How to build it
- Create low-stakes ways to be human with each other (personal histories, user manuals).
- Make help-seeking normal and praised, not a sign of weakness.
- Follow through on small commitments visibly — trust compounds from reliability.$b$),

('science','healthy-conflict','Healthy conflict','Productive disagreement is a feature, not a bug.','dynamics','dynamic:conflict_norms','spark',3,'published',
$b$Researchers distinguish **task conflict** (disagreement about ideas and approaches) from **relationship conflict** (personal friction). The first, handled well, improves decisions; the second corrodes teams. Lencioni calls the avoidance of productive debate the **fear of conflict** — and it leads to artificial harmony, where people nod in the room and disagree in the hallway.

## What good conflict looks like
- Ideas are challenged hard; people are treated with respect.
- Disagreement happens in the open, while it can still change the outcome.
- The team mines for the dissenting view instead of rushing to consensus.

## How to build it
- Name conflict norms explicitly: "we debate ideas, we don't attack people."
- Assign someone to surface the opposing case.
- Separate the idea from its owner — critique the work, not the person.$b$),

('science','role-clarity','Role clarity','Ambiguity is expensive; clarity is calming.','dynamics','dynamic:role_clarity','target',4,'published',
$b$**Role clarity** is the degree to which people understand their responsibilities, authority and how their work connects to others'. Decades of role theory link **role ambiguity** to higher stress, lower satisfaction and weaker performance — when people aren't sure what they own, work gets duplicated, dropped, or stalled in hand-offs.

## What it looks like
- Everyone can state what they're accountable for in a sentence.
- Hand-offs between roles are explicit, not assumed.
- Overlaps and gaps are surfaced and resolved, not worked around.

## How to build it
- Use a simple responsibility map (RACI: Responsible, Accountable, Consulted, Informed).
- Revisit roles when the team or its mission changes.
- Write role titles and ownership down where the team can see them.$b$),

('science','decision-rights','Decision rights','Clear decision-making is a speed multiplier.','dynamics','dynamic:decision_rights','compass',5,'published',
$b$**Decision rights** answer a deceptively simple question: *who gets to decide?* When that's unclear, teams re-litigate the same choices, escalate everything, or stall waiting for permission. Clear decision rights are one of the strongest levers for organizational speed.

Lightweight frameworks make this explicit:
- **RAPID** (Recommend, Agree, Perform, Input, Decide) — Bain's model for untangling who does what in a decision.
- **DACI** (Driver, Approver, Contributors, Informed) — a fast alternative many teams use per decision.

## How to build it
- For recurring decisions, agree the type and the decider in advance.
- Default to the most local decider who has the context.
- Capture each significant decision — what, who decided, and why — so it isn't reopened.$b$),

('science','why-workshops-work','Why structured workshops work','Facilitation, time-boxing and making thinking visible.','foundations',null,'layers',6,'published',
$b$An unstructured meeting defaults to the loudest voice and the highest-paid opinion. A **structured workshop** changes the physics: it gives everyone equal airtime, separates generating ideas from judging them, and time-boxes each step so the group keeps moving.

## What the evidence says
- **Independent generation beats group brainstorming.** People produce more and better ideas writing alone first, then sharing — it sidesteps anchoring and production blocking.
- **Time-boxing** forces prioritization and prevents a single topic from eating the session.
- **Making thinking visible** (cards, votes, a shared canvas) gives quieter members a channel and creates a shared record.
- **Closure matters.** Ending with explicit decisions and owned actions is what turns a good conversation into change.

That's why every workshop here is built from blocks — brainstorm, vote, discuss, decide — rather than a blank agenda.$b$)
on conflict (slug) do nothing;

-- FAQ (seed only when empty so admin edits are never clobbered)
insert into public.help_faq (question, answer, category, sort, status)
select * from (values
  ('Is my assessment response visible to my team?','No. Individual responses are always private. Only aggregated, team-level results appear on the Health dashboard, and only once enough people have responded to protect anonymity.','privacy',0,'published'),
  ('What do the five dynamics measure?','Psychological safety, trust, healthy conflict, role clarity and decision rights — the five factors research links most strongly to team performance. Each has a science explainer in the Science section.','assessments',1,'published'),
  ('Who can see our company data?','Only active members of your workspace. Access is enforced in the database itself (row-level security), and external facilitators only see the teams and sessions they''re assigned to.','privacy',2,'published'),
  ('How do roles work?','Owner and Company Admin run the organization; Team Managers lead their teams; Facilitators run sessions (and can be external, scoped to assigned work); Employees take part. You set roles on the Members page.','account',3,'published'),
  ('How do people join our company?','Invite them by email, share your Company ID for self-signup, or bulk-import a CSV. Elevated roles (Manager, Admin) need an admin to approve the request.','account',4,'published'),
  ('Can we export or delete a person''s data?','Yes. On the Members page an admin can export a member''s data as JSON, or erase it to satisfy a GDPR request. Erasure removes personal data and anonymizes their contributions.','privacy',5,'published'),
  ('Where is our data stored?','You choose a data residency region (EU, UK or US) in Organization settings. You can also set a retention window after which old personal data is purged.','privacy',6,'published'),
  ('Do I need facilitation experience to run a workshop?','No. Workshops are built from time-boxed blocks that guide the conversation step by step — generating ideas, voting, discussing and deciding — so the structure does the heavy lifting.','workshops',7,'published'),
  ('What integrations are available?','Slack and generic webhooks today, with Microsoft Teams, Google Calendar, Zoom and Entra ID on the roadmap. Connect them in the Integrations section.','integrations',8,'published'),
  ('How often should we re-assess a team?','Quarterly is a good default. The value is in the trend — re-running every few months shows whether the changes you''re making are working.','assessments',9,'published')
) as v(question, answer, category, sort, status)
where not exists (select 1 from public.help_faq);
