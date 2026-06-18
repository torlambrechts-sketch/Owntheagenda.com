-- More content. Articles key on slug (idempotent); new FAQ rows guard on question.
insert into public.help_article (kind, slug, title, summary, category, topic_key, icon, sort, status, body) values
('science','team-effectiveness-sessions','Team effectiveness sessions','Working on the team, not just in it.','methods','workshop:team','teams',10,'published',
$b$Most teams spend all their time working *in* the team and almost none working *on* it. Team effectiveness sessions create that missing space: a structured look at purpose, roles, norms and relationships, usually anchored by a **team canvas** or **charter** that makes the implicit explicit.

## Why it works
- Shared mental models cut coordination cost — when everyone holds the same picture of purpose and roles, less is lost in translation.
- Writing things down turns vague assumptions into agreements you can revisit.
- Doing it together (rather than cascading a leader's version) builds ownership.

## What a good session covers
- **Purpose** — why this team exists and what success looks like.
- **Roles & decision rights** — who does what, and who decides.
- **Norms** — how you work, meet and disagree.

Treat the canvas as a living document: revisit it whenever the team or its mission changes.$b$),

('science','retrospectives','Retrospectives','Continuous improvement, done blamelessly.','methods','workshop:retro','spark',11,'published',
$b$A retrospective is a regular, structured look back so a team can improve how it works — the engine of continuous improvement at the heart of agile and lean.

Norm Kerth's **Prime Directive** sets the tone: *"Regardless of what we discover, we understand and truly believe that everyone did the best job they could."* Retros examine the system, not the people — they're **blameless**.

## A simple structure
1. Set the stage (safety first).
2. Gather data — what happened (e.g. Start / Stop / Continue, or Mad / Sad / Glad).
3. Generate insight — why.
4. Decide a few owned actions.
5. Close.

## What makes them work
- A regular cadence beats heroic one-offs — small, frequent adjustments compound.
- Ending with a *small* number of owned actions is what turns reflection into change.$b$),

('science','ideation','Ideation & brainstorming','Diverge before you converge.','methods','workshop:ideation','layers',12,'published',
$b$Generating ideas well is a discipline, not a free-for-all. Alex Osborn's original rules still hold: **defer judgment**, go for **quantity**, welcome wild ideas, and build on others'.

## The counter-intuitive finding
Traditional verbal group brainstorming under-performs. People can only talk one at a time (production blocking), anchor on the first ideas, and hold back (evaluation apprehension). **Brainwriting** — everyone generates silently and independently first, then shares — reliably produces more, and more diverse, ideas.

## Run it in two phases
- **Diverge:** generate lots of options without judging. Quantity breeds quality.
- **Converge:** cluster, discuss and select.

Keeping divergence and convergence separate is the single biggest lever for better ideation.$b$),

('science','prioritization','Prioritization','When everything is important, nothing is.','methods','workshop:prioritization','target',13,'published',
$b$Prioritization workshops force a group to choose — and choosing together beats choosing by the loudest voice.

## Useful methods
- **Dot voting** — everyone gets a few votes; surfaces collective priorities fast.
- **Impact / effort (2×2)** — plot options and do the high-impact, low-effort ones first.
- **RICE / WSJF** — score by reach, impact, confidence and effort (or cost of delay) when you need more rigor.

## Watch the biases
Groups anchor on the first number, defer to seniority, and over-value sunk cost. Independent scoring *before* discussion, then debating the outliers, keeps the ranking honest.$b$),

('science','strategy-sessions','Strategy sessions','Strategy is a set of choices, not a wish list.','methods','workshop:strategy','compass',14,'published',
$b$Strategy is a set of **choices** about where to play and how to win — not a list of aspirations. Roger Martin and A.G. Lafley's *Playing to Win* frames it as five linked questions: winning aspiration, where to play, how to win, capabilities, and management systems.

## What good strategy sessions do
- Make the choices explicit — including what you're choosing *not* to do.
- Surface the assumptions the strategy depends on, and how you'd test them.
- Run a **pre-mortem** (Gary Klein): imagine it has failed a year from now — why? — to find risks while you can still act.

The output isn't a deck; it's a small set of bets the team understands and owns.$b$),

('science','design-thinking','Design thinking','Frame the problem, then build to think.','methods','workshop:design','book',15,'published',
$b$Design thinking is a human-centered way to tackle ambiguous problems, popularized by IDEO and Stanford's d.school. It runs in five non-linear modes: **empathize, define, ideate, prototype, test**.

## Principles that make it work
- **Frame the problem before solving it.** Most failures solve the wrong problem well; a sharp "How might we…" reframes scope.
- **Build to think.** Rough prototypes make ideas tangible and testable, surfacing flaws cheaply before you commit.
- **Test with real users.** Evidence over opinion.

In a workshop it pulls a team out of debating abstractions and into making and learning.$b$),

('science','kickoffs','Kickoffs','How you start shapes everything that follows.','methods','workshop:kickoff','rocket',16,'published',
$b$How a team or project starts shapes everything that follows. A kickoff aligns people on purpose, goals, roles and working agreements before the work — and the habits — set.

Bruce Tuckman's **forming → storming → norming → performing** reminds us that early friction is normal; a good kickoff does the norming deliberately instead of leaving it to chance.

## A strong kickoff covers
- **Purpose & goals** — why this exists and what success looks like.
- **Roles & decision rights** — who owns what, and who decides.
- **Working agreements** — how you'll communicate, meet and handle disagreement.

Chartering up front is cheap; re-litigating roles mid-project is expensive.$b$),

('science','check-ins','Check-ins','A five-minute ritual with outsized impact.','methods','workshop:checkin','heart',17,'published',
$b$A check-in is a short, recurring ritual that takes the team's temperature — how people are doing, what's on their mind, what needs attention. Small, but disproportionately powerful.

## Why a five-minute ritual matters
- **Rounds** (everyone speaks, briefly) interrupt the tendency for a few voices to dominate, and signal that every voice counts — a building block of psychological safety.
- Regular check-ins surface small issues before they become big ones.
- Patrick Lencioni argues teams need a *cadence* of conversations; the lightweight check-in is the most frequent beat.

Keep it short, make it a habit, and let everyone speak.$b$),

('guide','facilitate-live-session','Facilitate a live session','Hold the process; let the group find the answers.','workshops',null,'calendar',6,'published',
$b$Facilitating isn't about having the answers — it's about running a process that lets the group find them. The structure does most of the work; your job is to hold it.

## In the room
- **Keep time.** Honor the time-boxes; a visible clock keeps energy up.
- **Make space.** Use rounds and silent writing so quieter people contribute; gently redirect dominant voices.
- **Reveal together.** Generate independently, then reveal — it avoids anchoring and protects honesty.
- **Stay neutral on content.** Guard the process, not a particular outcome.

## Close well
End every session with a few **owned actions** — who, what, by when — and a quick readout. That's what turns a good conversation into change.$b$),

('guide','turn-talk-into-action','Turn talk into action','Owners and due dates beat good intentions.','basics',null,'actions',7,'published',
$b$The difference between a session that mattered and one that didn't is what happens *after*. OwnTheAgenda captures **actions** as a session runs, so commitments don't evaporate.

## Make actions stick
- Every action needs an **owner** and a **due date** — "we should…" with no name is a wish.
- Keep the list short. Three things that happen beat ten that don't.
- Review open actions at the next check-in or retrospective.

You can see and manage everything on the **Actions** page, filtered by team.$b$),

('guide','manage-organization-data','Manage your organization & data','Settings, data residency, retention and privacy.','admin',null,'shield',8,'published',
$b$Company Admins control how the organization is set up and how its data is handled, all under **Organization**.

## What you can manage
- **Company profile** — name, logo and your shareable **Company ID**.
- **Data residency** — where your data is stored (EU, UK or US).
- **Retention** — automatically purge old personal data after a chosen window.

## Privacy requests
On the **Members** page you can **export** a person's data as JSON, or **erase** it to satisfy a GDPR request — erasure removes their personal data and anonymizes their contributions. External facilitators only ever see the teams and sessions they're assigned to.$b$)
on conflict (slug) do nothing;

-- New FAQ (idempotent per question)
insert into public.help_faq (question, answer, category, sort, status)
select v.* from (values
  ('Can external facilitators see all our company data?','No. A facilitator is scoped to the teams and sessions they''re assigned to — they don''t see org-wide health, the full member list, or other teams. Employees and above see the whole workspace.','privacy',10,'published'),
  ('Who maintains the Help & Science content?','It''s maintained by the OwnTheAgenda team and is the same for every company. Platform editors see a "Manage content" link on the Help page.','account',11,'published'),
  ('How do I suggest a feature?','Open Help & Science → Roadmap and use "Request a feature". You can also upvote existing items to help us prioritize.','account',12,'published'),
  ('Can I run a workshop without a template?','Yes. Use Quick start to assemble blocks yourself, or start from a template and edit it — templates just give you a proven starting agenda.','workshops',13,'published'),
  ('Can I change our data region later?','Yes — a Company Admin can change data residency in Organization settings at any time.','privacy',14,'published')
) as v(question, answer, category, sort, status)
where not exists (select 1 from public.help_faq f where f.question = v.question);
