# Flows — design previews

Static HTML mocks of the **Flows** page (`/workflow`) that load the real
[`app/globals.css`](../../app/globals.css) and the exact component markup. They
let anyone regenerate accurate design screenshots **without** running the app,
a Supabase env or an authenticated session — handy for PRs, design review and
docs.

## Files

| File | Shows |
|------|-------|
| `flows-main.html` | Page header, the **composer** (step boxes + presets + quick-create), the collapsed **Plays** bar, and the tabbed green **flows table** with a row expanded to its run stages + readiness gate. |
| `flows-builder.html` | The **Plays** gallery expanded, and the **Flow Builder** edit mode with a branch node (incl. the "Needs condition" warning) and its condition editor. |
| `render.sh` | Renders both fixtures to `out/*.png` with headless Chromium. |

## Regenerate

```bash
scripts/preview/render.sh        # → scripts/preview/out/*.png
```

Chromium is resolved from `$CHROME_BIN`, then `PATH`
(`google-chrome` / `chromium`), then a Playwright install. If none is found:

```bash
npx playwright install chromium
```

You can also just open either `.html` in a browser.

## Keeping them honest

These are **hand-maintained mocks**, not generated from the components — if you
change the markup or classes in `app/(app)/workflow/*.tsx`, update the matching
fixture so the preview stays faithful. `out/` is git-ignored.
