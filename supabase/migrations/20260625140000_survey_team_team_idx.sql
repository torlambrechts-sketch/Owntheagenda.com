-- Cover the survey_team.team_id foreign key. The PK leads with survey_id, so a
-- by-team lookup (the take path: "open surveys for any of my teams" via
-- survey_team) and cascade-on-team-delete would otherwise sequential-scan.
-- Flagged by Supabase's unindexed_foreign_keys advisor. (survey_invite.survey_id
-- is already covered by survey_invite_uq's leading column.)
create index if not exists survey_team_team_idx on public.survey_team (team_id);
