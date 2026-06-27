-- Insight Reports delivery plumbing: scheduled email delivery (pg_cron + an
-- edge function over pg_net) and anonymized survey-response import.
--
-- Mirrors the reminder-email dispatcher (20260617123000): a per-dispatcher
-- shared secret in private.app_secret, verified by public.verify_cron_secret so
-- the (verify_jwt=false) edge function stays private to our scheduler. Email
-- stays DORMANT until RESEND_API_KEY is set on the function's secrets — the
-- schedules/exports in the Reports tab work regardless.

create extension if not exists pg_net;

-- Shared secret for the send-reports dispatcher (reuses the reminder table).
insert into private.app_secret (name, value)
values (
  'report_cron',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (name) do nothing;

-- Advance a recurring schedule's next run. NULL for one-off ('once') schedules.
create or replace function private.report_next_run(p_freq text, p_from timestamptz)
returns timestamptz
language sql
immutable
as $$
  select case p_freq
    when 'weekly' then p_from + interval '7 days'
    when 'monthly' then p_from + interval '1 month'
    else null
  end;
$$;

-- Scheduler → async POST to the send-reports Edge Function with the shared
-- secret. The function itself selects due/queued work and logs report_run rows.
create or replace function private.dispatch_reports()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_secret text; v_req bigint;
begin
  select value into v_secret from private.app_secret where name = 'report_cron';
  if v_secret is null then return null; end if;
  select net.http_post(
    url := 'https://fqeohcfkimoopwjxxcft.supabase.co/functions/v1/send-reports',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  ) into v_req;
  return v_req;
end;
$$;
revoke execute on function private.dispatch_reports() from public;

-- App-facing "Send now": an admin kicks the dispatcher after queueing a run.
-- Admin-gated so a member can't trigger sends for a workspace they don't manage.
create or replace function public.request_report_dispatch(p_workspace uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'not authorized';
  end if;
  perform private.dispatch_reports();
end;
$$;
revoke execute on function public.request_report_dispatch(uuid) from public, anon;
grant execute on function public.request_report_dispatch(uuid) to authenticated;

-- Anonymized survey-response import. Each element of p_rows is
-- { "scores": {item_key: value, ...}, "comments": [...]?, "hash": text? }.
-- respondent_id is left NULL (external/anonymous); respondent_hash dedupes a
-- re-import of the same file. Admin-gated; runs as definer to write responses.
create or replace function public.import_survey_responses(p_survey uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare v_ws uuid; v_count int := 0; v_row jsonb; v_hash text;
begin
  select workspace_id into v_ws from public.survey where id = p_survey;
  if v_ws is null then raise exception 'survey not found'; end if;
  if not private.is_workspace_admin(v_ws) then raise exception 'not authorized'; end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if (v_row->'scores') is null or jsonb_typeof(v_row->'scores') <> 'object' then
      continue; -- skip malformed rows
    end if;
    v_hash := coalesce(
      nullif(v_row->>'hash', ''),
      'import:' || md5(p_survey::text || (v_row->'scores')::text || v_count::text)
    );
    insert into public.survey_response (survey_id, respondent_id, respondent_hash, scores, comments)
    values (
      p_survey,
      null,
      v_hash,
      v_row->'scores',
      coalesce(v_row->'comments', '[]'::jsonb)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.import_survey_responses(uuid, jsonb) from public, anon;
grant execute on function public.import_survey_responses(uuid, jsonb) to authenticated;

-- Run the recurring dispatcher daily (idempotent by job name). Picks up due
-- weekly/monthly schedules and any queued one-off runs.
select cron.schedule('report-dispatch', '20 7 * * *',
  $$select private.dispatch_reports();$$);
