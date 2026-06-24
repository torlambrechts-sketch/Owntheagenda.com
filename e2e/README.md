# E2E (Playwright)

Browser verification of the Workshops design migration, driving the real
auth-gated UI as a seeded test user.

## Running

```bash
npm ci
npx playwright install --with-deps chromium   # one-time (needs open network)
npm run build
npm run test:e2e                               # boots `next start` on :3100
```

Against a deployed preview instead of a local server:

```bash
E2E_BASE_URL=https://<preview-url> npm run test:e2e
```

CI runs this automatically: `.github/workflows/e2e.yml` (push to main, PRs,
manual dispatch). It uploads `playwright-report` as an artifact.

## Test login (isolated fixture)

Tests sign in as **`e2e@owntheagenda.test`** (password `owntheagenda`), an
*owner* of a throwaway **"E2E Sandbox"** workspace with its own team and a
sample 4-block workshop — completely separate from real workspace data.

Config falls back to the public Supabase URL + publishable key
(`lib/supabase/config.ts`) and the demo password, so **CI runs with no secrets**.
Override if you want: repo secret `E2E_PASSWORD`, repo var `E2E_EMAIL`, and
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### Re-create the fixture

The fixture is already applied to the project. To re-create on another DB, run
the seed in `fixtures.sql`. To remove it entirely:

```sql
delete from auth.users where id = 'ee2e0000-0000-4000-8000-000000000001';
delete from public.workspace where id = 'ee2e0000-0000-4000-8000-000000000010';
```

## Coverage

- Home: `Build workshop` + `New workshop` actions
- New-workshop slide-over: three start-point cards + Create
- **Regression:** `Build workshop` → builder route (not the slide-over)
- Builder Board: five phase columns + sample block cards
- Block editor: Phase + Owner fields
- Run launcher: workshop list, role toggle, dry-run
