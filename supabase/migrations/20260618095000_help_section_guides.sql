-- A guide for every remaining product section (idempotent on slug). topic_key
-- section:<route> lets the appbar "?" deep-link each page to its guide.
insert into public.help_article (kind, slug, title, summary, category, topic_key, icon, sort, status, body) values
('guide','your-dashboard','Your dashboard','Where your teams stand, at a glance.','sections','section:dashboard','dashboard',9,'published',
$b$The dashboard is your starting point — a quick read on where your teams stand and what needs attention.

## What you'll see
- **Headline health** across your teams, so you can spot which ones need a closer look.
- **Recent activity** — sessions run, assessments completed, actions coming due.
- **Quick ways in** to running a workshop or inviting people.

Use it as a daily or weekly check-in: scan for anything red, then click through to the team, session or action that needs you.$b$),

('guide','the-canvas','The canvas','A shared space for visual collaboration.','sections','section:canvas','canvas',10,'published',
$b$The canvas is a shared, freeform space for visual collaboration — sticky notes, clusters, arrows and frames that everyone can edit together in real time.

## When to use it
- Mapping a problem or a process.
- Clustering ideas from a brainstorm.
- Building a team canvas or a simple diagram together.

## Tips
- Generate notes independently first, then cluster — it keeps the thinking honest.
- Use color and frames to group related ideas.
- Snapshots capture the board so you can refer back after the session.$b$),

('guide','the-template-library','The template library','Proven agendas, ready to run.','sections','section:library','library',11,'published',
$b$The library is your catalog of ready-to-run workshop templates — proven agendas you can launch as-is or adapt.

## Using the library
- Browse by **category** (retrospectives, ideation, strategy and more) or search.
- Open a template to see its steps, timings and prompts before you commit.
- Launch it for a team and the agenda is built for you.

Each category carries a *Learn the science* link explaining the method behind it. When in doubt, start from a template and edit — it's faster than a blank page.$b$),

('guide','integrations-guide','Integrations','Connect the tools your teams already use.','sections','section:integrations','integrations',12,'published',
$b$Integrations connect OwnTheAgenda to the tools your teams already use. You'll find them under **Integrations** (Company Admins).

## Connecting a tool
- **Slack** and **Webhooks** are available now — paste an incoming webhook or endpoint URL to start receiving events.
- **Microsoft Teams**, **Google Calendar**, **Zoom** and **Entra ID (SSO)** are on the roadmap.

Connect, configure or disconnect any integration at any time. Configuration (like a webhook URL) is only visible to admins.$b$),

('guide','get-help','Get help & shape the roadmap','How to use this Help & Science center.','sections','section:help','help',13,'published',
$b$Everything you need to learn the product and the thinking behind it lives here in **Help & Science**.

## What's here
- **Guides** — how to use each part of the product.
- **The science** — the research behind the assessments and workshops, with *Learn the science* links throughout the app.
- **FAQ** — quick answers to common questions.
- **Roadmap** — see what we're building, **upvote** what matters, and **request** something new.

Use the search box at the top to find anything fast.$b$)
on conflict (slug) do nothing;
