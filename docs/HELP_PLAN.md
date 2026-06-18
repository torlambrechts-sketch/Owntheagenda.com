# Help & Science engine

Decisions (product owner):
1. Content store: **in-app CMS** — DB-backed, editable in-app. Content is GLOBAL
   (the science/how-to is universal), so writes are gated to **platform staff**
   (`profile.is_staff`), not per-workspace admins. Everyone reads published content.
2. Intelligence: **search + browse** (client-side search/filter; no AI in v1).
3. Roadmap: **interactive** — members upvote + submit requests; staff triage.
4. Science linking: **standalone library + contextual deep-links** via `topic_key`
   to assessment dimensions (`dynamic:<x>`) and workshop categories (`workshop:<x>`).

Product facts:
- Assessment/health dimensions (`team_dynamic`): psych_safety, trust, conflict_norms,
  role_clarity, decision_rights.
- Workshop categories: team, retro, ideation, prioritization, strategy, design,
  kickoff, checkin.
- No markdown lib → ship a small, safe in-house markdown renderer (no new deps).

## Phases (each: migration → rolled-back test → types → UI → gate → commit → ff-merge)

- [x] **H1 · Foundation + read experience** — `profile.is_staff` + `is_staff()`;
      `help_article` + `help_faq` tables (read published to all, write staff); nav
      "Help & Science" (everyone); `/help` landing (search + sections); `/help/[slug]`
      article (markdown); guides & science indexes; FAQ accordion; seed real content.
- [x] **H2 · Roadmap (interactive)** — `roadmap_item` + `roadmap_vote` + vote-count
      trigger + RLS; `/help/roadmap` (columns, upvote, request form); staff triage queue.
- [ ] **H3 · Admin CMS** — staff-only editor for articles/FAQ (list + create/edit/publish)
      and roadmap item management.
- [ ] **H4 · Contextual deep-links** — "Learn the science" links from assessments/health/
      workshops to the matching science article via `topic_key`.

Project: fqeohcfkimoopwjxxcft · Branch: claude/nice-feynman-x7xgh4
