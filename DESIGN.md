# OwnTheAgenda Design System

The shared visual + interaction language for OwnTheAgenda — the session-running OS
for leadership teams (Dashboard, Assessments, Workshops/Sessions, Flows, Teams,
Organisation). Hand-rolled and token-driven, no component-library dependency: the
whole system lives in [`app/globals.css`](app/globals.css) and a handful of React
components (`components/Shell.tsx`, `components/SideWindow.tsx`,
`components/AssessmentRunner.tsx`, …). Everything below is reproduced from the
actual CSS so the doc and the code stay in lock-step.

> This file is the **source-of-truth spec**. For *how the design handoffs map onto
> real routes* (the implementation tracker that used to live here) and the
> backlog, see [`docs/`](docs/) — the gap-analyses
> ([`ASSESSMENT_ENGINE_GAP_ANALYSIS.md`](docs/ASSESSMENT_ENGINE_GAP_ANALYSIS.md),
> [`WORKFLOW_DESIGN_GAP_ANALYSIS.md`](docs/WORKFLOW_DESIGN_GAP_ANALYSIS.md)) and the
> surface map in §10.

---

## 1. Principles
1. **Calm, editorial, dense-but-legible.** Cream canvas, forest-green structure,
   Playfair Display headings over Inter body. Information-rich without feeling like
   a spreadsheet.
2. **One system, every surface.** The same shell, tokens, tables, pills, and panels
   appear in every module. Learn one screen, you know them all.
3. **The score informs; a person decides.** No single-verdict numbers; show
   ranges/bands and keep a human in the loop (`.humannote`, the **Grounded** chip).
4. **Edit in place, in context.** Creating or editing happens in a **Side Window**
   over the page you're on — you never lose your place (§7).
5. **Tokens, not hex.** Every colour, radius, and shadow is a CSS variable.
   Components never hard-code raw hex.

---

## 2. Design tokens

All tokens are declared in `:root` in `app/globals.css`.

### 2.1 Colour
| Token | Value | Use |
|---|---|---|
| `--canvas` | `#f3f1e8` | app background |
| `--canvas-2` | `#eceadf` | sunken fills, hover, tracks |
| `--surface` | `#ffffff` | cards, panels, table surface |
| `--forest` | `#3a4d3f` | primary structure, tab band, primary buttons |
| `--forest-2` | `#2f4034` | primary hover |
| `--rail` | `#2c3b30` | legacy dark rail token |
| `--shell` | `#4b6153` | section-nav column background |
| `--shell-rail` | `#3f5548` | left icon-rail background |
| `--shell-active` | `#566d60` | active rail icon |
| `--green` | `#3f7d5a` | accent, active, success, **person** entity |
| `--ink` | `#2a2a26` | primary text |
| `--muted` | `#8a8a7e` | secondary text |
| `--faint` | `#a6a698` | tertiary text, placeholder icons |
| `--line` | `#e4e1d5` | hairline borders |
| `--line-2` | `#d8d4c6` | input borders, stronger dividers |

**Status / pill tints** (background / foreground):
| Status | bg | fg | token pair |
|---|---|---|---|
| open / success | `#dcebdf` | `#3f7d5a` | `--open-bg` / `--open-fg` |
| draft / neutral | `#ece7d6` | `#8a7a52` | `--draft-bg` / `--draft-fg` |
| internal / amber | `#f3e9cf` | `#a8862f` | `--internal-bg` / `--internal-fg` |
| interview / blue | `#dde7f0` | `#42729e` | `--interview-bg` / `--interview-fg` |
| reject / rust | `#f4dedb` | `#b8584a` | `--reject-bg` / `--reject-fg` |

**Entity / semantic accents** (the system's signature set): role/blue
`--role #42729e`, person/green `--green #3f7d5a`, amber `--amber #a8862f`, rust
`--rust #b8584a`. Member-role pills reuse these tints (`.pill.role-owner` → reject,
`role-admin` → internal, `role-manager` → open, `role-facilitator` → draft,
`role-member` → interview).

### 2.2 Typography
Both families are loaded via `next/font` and exposed as `--font-playfair` /
`--font-inter`, then aliased to:
- **Display / headings:** `--font-display` → `"Playfair Display", Georgia, serif`,
  weights 500/600. Page titles **30px** (`.page-title`), org H1 25px, panel/section
  titles 18–21px, summary numbers 25px, KPI numbers 27px.
- **Body / UI:** `--font-ui` → `"Inter", system-ui, sans-serif`. **13px base**
  (`body`); 12px controls; 11px labels.
- **Labels** (the uppercase eyebrow on stats, fields, group headers): typically
  `11px / 700 / uppercase / letter-spacing .6–1px / --muted` (`.eyebrow`,
  `.a-gt`, `thead th`). Optional `(optional)` suffix in sentence-case `--faint`.

### 2.3 Space, radius, shadow, motion
- Radius: `--radius 6px` (controls, buttons, inputs), `--radius-lg 8px` (cards,
  panels, tab band). Larger surfaces use 10–16px directly; the Side Window's left
  edge is `14px`.
- Shadow: `--shadow: 0 1px 2px rgba(58,77,63,.05), 0 6px 18px rgba(58,77,63,.05)`
  for cards. The Side Window uses a heavier left shadow (§7).
- Motion: **150ms** for state (hover/toggle), **220ms** for the scrim/toast,
  **260ms** `cubic-bezier(.22,.61,.36,1)` for the panel slide. `prefers-reduced-motion`
  drops the transitions on `.sw`, `.scrim`, `.toast`, and progress fills.
- Focus: global `:focus-visible { outline:2px solid var(--green); outline-offset:2px }`;
  text inputs additionally get a green border + `0 0 0 2px rgba(63,125,90,.15)` ring.

---

## 3. Layout shell (`components/Shell.tsx`)
Three columns, fixed, via `.app { display:grid; grid-template-columns:60px 220px 1fr; height:100vh }`.
Collapsed state is `.app.collapsed → 60px 1fr`; under 1180px the nav hides
(`60px 1fr`).

- **Icon rail — 60px**, `--shell-rail` background (`.rail`). Logo tile, then circular
  section icons `.ri` (42×42, 50% radius, faint border; `.active` = `--shell-active`
  fill, white icon), a spacer, settings, avatar.
- **Section nav — 220px**, `--shell` background (`.nav`). Wordmark (`.wm`, Playfair
  21px) + collapse chevron; grouped nav with uppercase group headers (`.grp h4`) and
  link rows (`.nav a`, active = white text on `rgba(255,255,255,.1)` + a `#9fd3ad`
  dot).
- **Main** — `.appbar` (54px: breadcrumb left; org chip + search + bell + avatar
  right) then `.content` (`flex:1; overflow:auto; padding:26px clamp(20px,3vw,40px)`).
  `.page-title` (30px Playfair) + `.page-sub`.

Supporting structural pieces: **forest tab band** (`.tabband` / org `.otabband`
folder tabs into a connected `.opanel`); **summary strip** (`.summary` — Playfair
`.num` + uppercase `.lab`, `.vr` hairline dividers, `.actions` right); **cards**
(`.card` / `.tbl-card`: `--surface`, `--line`, `--shadow`, `.eyebrow` header).

---

## 4. Core components
- **Buttons.** `.btn-prim` (forest fill, white, 12px/700 uppercase .6px, 6px radius),
  hover `--forest-2`, `:disabled` → `--line-2`/`--faint`. `.btn-sec` (surface,
  `--line-2` border, 12px/600 ink), hover `--canvas`. `.btn-sec.danger` (rust text,
  `#e8cfca` border). `.btn-full` stretches + centres. `.addlink` (green, uppercase,
  icon + text, no chrome). `.linkbtn` (muted text button).
- **Pills / chips.** `.pill` (11px/700 uppercase, 20px radius, 4×10 padding) + `.sm`.
  Variants map to the status tints in §2.1 (`.open`, `.draft`, `.internal`,
  `.interview`, `.reject`) and the role aliases. Never invent a new colour for a
  status — reuse the five. `.grounded` is the green "Grounded" verification chip.
- **Avatars.** `.av` — circular, forest fill, white initials; `.sm 24px`, base 30px,
  `.lg 46px`; `.av.green` for person entities; overlapping `.avrow` with a 2px
  surface ring.
- **Form controls.** `.inp` — surface, `--line-2` border, 6px radius, 13px;
  **focus = green border + `0 0 0 2px rgba(63,125,90,.15)` ring**. `.inp.sm` and
  `.inp.mono` modifiers. Checkboxes `.chk` (16px, `--green` when `.on`); segmented
  controls `.seg` / `.segbar`. Labels per §2.2.
- **Toast.** `.toast` — bottom-centre dark pill (`--ink`, white text, 8px radius),
  leading icon, slides up 20px + fades over 220ms (`.show`). Confirms Side-Window
  saves ("Stage updated", "Task added").

---

## 5. Tables (`.tbl` — the canonical data table)
The workhorse. One table style, several row patterns; usually wrapped in a
`.tbl-card`.

**Anatomy.** `thead th` = 11px/700 uppercase `--muted`, hairline bottom, 10×12
padding; `tbody td` = 13px, 12px padding, hairline rows, last row no border. Right-
align numerics (`.r`); `font-variant-numeric:tabular-nums` for figures. `.person`
cell = avatar + name with a `--faint` `small` sub-line.

**Rows & density.** Row hover = `--canvas`. Optional leading `.chk` checkbox column
for bulk select; optional drag handle for sortable rows.

**Row actions → the Side Window.** Editable tables carry a header **"Add …"
`.btn-prim`** and per-row controls using **`.icon-btn`** (30×30, `--line-2` border)
— pencil to **Edit**, `.icon-btn.danger` (rust) to **Delete**.

**Add and Edit both open the Side Window (§7), not a center modal.** Delete uses a
small inline confirm or a center confirm dialog (the one place a center dialog is
still allowed, §7.5). Expandable detail rows remain valid for *read*; *editing* that
detail still opens the Side Window.

**Status & entities in cells.** Use `.pill` for status and the entity accents for
role/person/amber/rust. Progress shown as a track + fill bar (e.g. `.a-progress`,
`.as-scoretrack/.as-scorefill`, `.ast-secbar`), never a bare number when a target
exists.

---

## 6. Signatures (do not lose these)
- **Trait-range "band" control** — `.bandrow` / `.bandtrack`: role-blue band edges
  (`.target`) + green person `.marker` on a track; "bands, not more-is-better".
  Legend via `.bandlegend` (`.swatch-band` + `.swatch-mark`).
- **Multi-dimensional fit bars** + "N of M bands in" phrasing instead of a single
  ranking score.
- **Consent / privacy as a first-class signal** (e.g. `.arun-priv`, anonymity notes
  in the runner).
- **Human-in-the-loop note** — `.humannote` (canvas card, shield/lock icon, italic
  body + `.src` citation) and a **`.grounded`** chip wherever a number could be
  mistaken for a verdict.

---

## 7. Side Window (slide-over) — **the default for create / edit / configure**

> **Rule.** Any action that creates, edits, invites, configures, or opens a record
> for editing uses the Side Window (`components/SideWindow.tsx`). This includes **Add
> task, Add row, Edit, Invite, Edit workflow/stage, Schedule, Configure**. Do **not**
> use a centered modal for these. Centered dialogs are reserved for destructive
> confirms and tiny one-line prompts (§7.5).

### 7.1 Why
You keep your place. The page you were on stays visible (dimmed) on the left, so
editing a row, inviting a candidate, or adding a task never yanks you out of context.
It scales from a one-field form to a full master-detail editor without changing
pattern.

### 7.2 Anatomy
```
┌───────────────────────── viewport ─────────────────────────┐
│  page (dimmed, still visible) │   ╔══════ side window ══════╗ │
│                               │   ║ HEADER  title      ✕     ║ │
│                               │   ║         subtitle         ║ │
│                               │   ╟──────────────────────────╢ │
│                               │   ║ BODY (scrolls)           ║ │
│                               │   ╟──────────────────────────╢ │
│                               │   ║ FOOTER  [Cancel] [Save▸] ║ │
│                               │   ╚══════════════════════════╝ │
└─────────────────────────────────────────────────────────────┘
        scrim: rgba(44,59,48,.34)
```
- **Header** (`.sw-head`) — cream band (`--canvas`), Playfair title (`h2`, 21px),
  optional `--muted` `.sub`, close ✕ (`.sw-x`, 34px square `btn-sec`-style) top-right.
- **Body** (`.sw-body`) — `--surface`, scrolls independently, 22×24 padding. Holds a
  sectioned form (uppercase labels, green-focus inputs), a two-pane master-detail, or
  a list with a "Select … to edit" empty state.
- **Footer** (`.sw-foot`) — sticky bottom bar, hairline top, **primary action
  right-aligned** inside `.right` (`btn-prim`, e.g. "Save"), "Cancel" to its left.

### 7.3 Sizes
| Size | Width | Use |
|---|---|---|
| `.sw.compact` | `min(92vw, 460px)` | a single short form — **Add task**, add a row, quick edit |
| *default* `.sw` | `min(86vw, 720px)` | sectioned forms, invite/schedule, entity edit |
| `.sw.wide` | `min(92vw, 1040px)` | master-detail editors — **Edit workflow**, multi-pane config |

Panel is right-anchored, full height, left edge rounded `14px 0 0 14px`, left border
`--line`, heavy left shadow `-18px 0 50px rgba(42,42,38,.16)`. Enters via
`translateX(100%) → 0` over 260ms `cubic-bezier(.22,.61,.36,1)`.

### 7.4 Behaviour
- Opens from any **Add/Edit/Invite/Configure** trigger.
- **Close:** ✕, **Esc**, **click the scrim**, Cancel, or after a successful Save.
- **Save:** validate → write → close → **toast** confirmation (§4).
- **Focus:** move focus to the first field on open; trap focus inside; restore to the
  trigger on close.
- **Scroll:** body scrolls; header and footer stay pinned.
- **Nesting:** avoid stacking. A drill-in within a wide panel replaces the detail
  pane (master-detail), it does not open a second window.

### 7.5 When *not* to use it
- **Destructive confirm** ("Delete this stage?") → small **center confirm dialog**,
  rust primary. This is the only sanctioned center modal.
- **Full-page work** (a multi-step flow build, a long report) → its own route
  (`/flow/[id]`, `/builder`, …), not a panel.
- **Transient feedback** → toast, not a window.

### 7.6 Reference implementation
The CSS contract (tokens assumed defined; verbatim from `app/globals.css`):
```css
.scrim{position:fixed;inset:0;background:rgba(44,59,48,.34);opacity:0;visibility:hidden;
  transition:opacity .22s ease;z-index:80}
.scrim.open{opacity:1;visibility:visible}

.sw{position:fixed;top:0;right:0;height:100vh;width:min(86vw,720px);background:var(--surface);
  border-left:1px solid var(--line);border-radius:14px 0 0 14px;
  box-shadow:-18px 0 50px rgba(42,42,38,.16);
  transform:translateX(100%);transition:transform .26s cubic-bezier(.22,.61,.36,1);
  z-index:81;display:flex;flex-direction:column}
.sw.open{transform:translateX(0)}
.sw.compact{width:min(92vw,460px)} .sw.wide{width:min(92vw,1040px)}

.sw-head{display:flex;align-items:flex-start;gap:14px;padding:20px 24px;
  border-bottom:1px solid var(--line);background:var(--canvas);border-radius:14px 0 0 0}
.sw-head h2{font-family:var(--font-display);font-size:21px;font-weight:600;letter-spacing:-.3px;margin:0}
.sw-head .sub{font-size:12.5px;color:var(--muted);margin-top:3px}
.sw-x{margin-left:auto;width:34px;height:34px;border-radius:8px;border:1px solid var(--line-2);
  background:var(--surface);cursor:pointer;color:var(--muted);font-size:16px;flex:none}
.sw-body{flex:1;overflow:auto;padding:22px 24px}
.sw-foot{display:flex;align-items:center;gap:10px;padding:16px 24px;border-top:1px solid var(--line)}
.sw-foot .right{margin-left:auto;display:flex;gap:10px}
```
React mapping: `components/SideWindow.tsx` renders `.scrim` + `.sw` with a `size`
(`'compact' | 'default' | 'wide'`), `title`, `subtitle`, `onClose`, and a `footer`
slot; Esc + scrim click are wired to `onClose`. Confirm dialogs (§7.5) and the
post-save `.toast` are the only other overlays.

---

## 8. Accessibility & motion
- Contrast: ink/muted on canvas/surface meet AA for body text; never rely on an
  entity colour alone — pair with a label or icon.
- All interactive controls keyboard-reachable; the Side Window traps focus and
  restores it; global `:focus-visible` ring is green.
- Respect `prefers-reduced-motion`: the CSS drops the slide/translate and toast
  transitions, keeping an instant show with a brief opacity change.

---

## 9. Where the tokens & components live
- **`app/globals.css`** — every token and class in this spec (~2,400 lines, one
  hand-rolled system, no Tailwind/component lib).
- **`components/Shell.tsx`** — the rail + nav + appbar + content shell (§3).
- **`components/SideWindow.tsx`** — the slide-over (§7).
- **`components/AssessmentRunner.tsx`** — the taking engine (`.arun-*`).
- **`app/layout.tsx`** — loads Playfair Display + Inter via `next/font` into
  `--font-playfair` / `--font-inter`; sets the `OwnTheAgenda` document title.

---

## 10. Surface map (handoff → route)
| Surface | Route | State |
|---|---|---|
| Dashboard | `/dashboard` | ✅ |
| Assessment Builder | `/builder`, `/library/builder` | ✅ |
| Assessment Suite (overview) | `/assessments` | ✅ |
| Assessment Engine — runner | `components/AssessmentRunner.tsx` | ✅ |
| Assessment run status | `/assessments/status/[id]` | ✅ |
| Flow Builder (in-shell views) | `/workflow`, `/workflow/[id]` | ✅ |
| Flow Builder (full-screen canvas) | `/flow/[id]` | ✅ |
| Quick Start wizard | `/start` | ✅ |
| Workshops home + templates | `/workshops`, `/workshops/templates` | ✅ |
| Workshop builder / overview | `/workshops/[id]`, `/workshops/[id]/overview` | ✅ |
| Run cockpit | `/run/[id]` | ✅ |
| Organisation & Security | — | ⛔ not yet adopted |

Detailed gap analyses + backlog live in [`docs/`](docs/).

## 11. Verification
Every shipped surface is kept green: `tsc --noEmit`, `next lint`, `next build`, and
the `vitest` suite all pass on `main`; SQL changes ship as
`supabase/migrations/*` and grant posture is checked after each.
