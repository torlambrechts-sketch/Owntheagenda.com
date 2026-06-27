-- Move the builder kanban to the comp's four facilitation phases
-- (Open / Explore / Decide / Close). "Explore" absorbs the old Diverge + Converge.
-- phase is a nullable override (null = derive from activity_type), so existing
-- rows (all null today) are unaffected; the remap is for safety on other envs.

update public.block set phase = 'explore' where phase in ('diverge', 'converge');

alter table public.block drop constraint if exists block_phase_check;
alter table public.block
  add constraint block_phase_check
  check (phase is null or phase in ('open', 'explore', 'decide', 'close'));
