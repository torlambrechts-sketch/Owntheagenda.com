# Next-step progression — implementation plan

Turn a session into a loop: the Outcome captures decisions + tasks **and** schedules
the next touch; the follow-up opens by reviewing what was committed.

## Phases (each: migration → rolled-back test → repo file + types → UI → gate → commit → merge)

### Phase 1 — Schedule a follow-up
- `follow_up` table (source_session, kind, title, owner, scheduled_at, workshop_id,
  completed_session_id, status). RLS read = workspace member; writes via RPC.
- `schedule_follow_up(session, kind, title, when, owner?, template?)` — creates the
  row; if a template is given, spawns + schedules a workshop and links it.
  `skip_follow_up(id)`. Trigger auto-completes a follow-up when its workshop's
  session ends.
- Readout "Plan the follow-up" panel (kind, date, owner, optional template) +
  list existing follow-ups; `.ics` download for meeting/check-in kinds.

### Phase 2 — Carry-forward (tie to outcome + tasks)
- `seed_plan_from_session(source_session, target_session, block)` — copy the
  source session's still-open plan_task into the follow-up's Outcome plan
  (mirror seed_canvas_from_snapshot), so the follow-up reviews last time's plan.
- When a follow-up workshop's session starts on an outcome step, offer "Pull
  forward last plan" (and auto-seed where unambiguous).

### Phase 3 — Progression surfaces
- Progression strip on the readout + Sessions list: source → follow-up · date ·
  status, with "X/Y commitments done".
- Dashboard / Health board: upcoming + overdue follow-ups; momentum flag
  (open commitments + no scheduled next step).

### Phase 4 — External review
- Senior-dev + design-agency review of the whole feature; close any gaps.

## Invariants
- Scheduling guarded by can_manage_workshop(source); spawned workshop via
  can_manage_team (create_workshop_from_template).
- follow_up readable by workspace members; writes only through SECURITY DEFINER RPCs.
- Carry-forward reuses the seed pattern; min-3 / RLS rules unaffected.
