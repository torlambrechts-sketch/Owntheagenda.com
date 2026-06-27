-- Channel dedup for reminder delivery to chat webhooks (Slack/Teams/generic),
-- mirroring notification.emailed_at for email. The due-reminders Edge Function
-- posts a per-workspace digest to any connected webhook integration and stamps
-- posted_at so a reminder is delivered to a channel at most once.
alter table public.notification add column if not exists posted_at timestamptz;
