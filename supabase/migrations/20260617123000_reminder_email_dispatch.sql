-- Reminder email dispatch — schedules the due-reminders Edge Function.
-- Email stays DORMANT until RESEND_API_KEY is set on the function's secrets;
-- the in-app reminders (0025) work regardless of this.

-- Track which reminder notifications have been emailed (dedupes the digest).
alter table public.notification add column if not exists emailed_at timestamptz;

-- Shared secret so only our scheduler can invoke the (verify_jwt=false) function.
create table if not exists private.app_secret (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
insert into private.app_secret (name, value)
values (
  'reminder_cron',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (name) do nothing;

-- The Edge Function (service role) calls this to authorize an incoming request.
create or replace function public.verify_cron_secret(p_name text, p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.app_secret
    where name = p_name and value = p_secret
  );
$$;
revoke execute on function public.verify_cron_secret(text, text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text, text) to service_role;

-- Scheduler → async POST to the Edge Function with the shared secret.
create extension if not exists pg_net;
create or replace function private.dispatch_reminder_emails()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_secret text; v_req bigint;
begin
  select value into v_secret from private.app_secret where name = 'reminder_cron';
  if v_secret is null then return null; end if;
  select net.http_post(
    url := 'https://fqeohcfkimoopwjxxcft.supabase.co/functions/v1/due-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  ) into v_req;
  return v_req;
end;
$$;
revoke execute on function private.dispatch_reminder_emails() from public;

-- Run shortly after the in-app generator. Idempotent by job name.
select cron.schedule('reminder-emails', '10 7 * * *',
  $$select private.dispatch_reminder_emails();$$);
