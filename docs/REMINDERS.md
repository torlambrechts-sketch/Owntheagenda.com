# Action reminders

Closes the accountability loop: when an action is **due soon** or **overdue**, the
person responsible gets nudged — in-app today, by email once a provider is configured.

## How it works

```
pg_cron (07:00 UTC daily)
  └─ private.generate_due_reminders()        ← in-app nudges (always on)
        └─ writes public.notification rows (via the existing bell)

pg_cron (07:10 UTC daily)
  └─ private.dispatch_reminder_emails()      ← email (dormant until keyed)
        └─ pg_net POST → Edge Function `due-reminders`
              ├─ verify_cron_secret(...)     ← shared-secret auth
              ├─ digests pending reminders per recipient
              └─ sends via Resend if RESEND_API_KEY is set
```

### Targeting
Recipient = the action's linked **owner** (`action_item.owner_id`), falling back to its
**creator** (`created_by`) when no owner account is attached. Assign an owner from the
Actions board editor ("Owner" → pick a teammate) to make the nudge land on the right person.

### Idempotency
- **Due-soon** (due within 2 days): fires **once** per action.
- **Overdue**: re-nudges **at most weekly** per action.

Re-running the generator is safe — it never double-sends. Verified with a rolled-back
role test (overdue + due-soon + done + no-due fixtures; two runs → still one of each).

## In-app reminders — already live

Nothing to configure. The daily cron writes to the notification bell (top-right), which
shows an unread badge, marks-read on click, and deep-links to `/actions`.

## Turning on email (optional)

Email is built and tested but **dormant** until you set a provider key. To enable:

1. Create a [Resend](https://resend.com) API key and verify a sending domain.
2. Set the Edge Function secrets (Dashboard → Edge Functions → `due-reminders` → Secrets,
   or `supabase secrets set`):
   - `RESEND_API_KEY` — required to actually send.
   - `REMINDER_FROM` — e.g. `OwnTheAgenda <reminders@yourdomain.com>` (defaults to the
     Resend sandbox sender, which only delivers to the account owner).
   - `APP_URL` — your app origin, so the email's "Open your actions" link resolves.

That's it — the next dispatch run picks them up. No redeploy needed.

### Verifying
```sql
-- generate against live data now (instead of waiting for 07:00)
select private.generate_due_reminders();

-- trigger an email dispatch and read the function's response
select private.dispatch_reminder_emails();
select status_code, content::text from net._http_response order by id desc limit 1;
-- => 200 {"pending":N,"emailed":M,"emailEnabled":true}  once RESEND_API_KEY is set
```

## Security notes

- The Edge Function runs with `verify_jwt = false` but authenticates every call against a
  random secret stored in `private.app_secret` (checked via `public.verify_cron_secret`,
  which is revoked from `anon`/`authenticated` and granted only to `service_role`).
- `pg_net` is registered in `public` (it is `extrelocatable = false`); its HTTP API is
  namespaced under `net`. This is the lone `extension_in_public` advisor notice.
