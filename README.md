# OwnTheAgenda — landing page

The welcome / landing page for **OwnTheAgenda** — *the session-running OS for leadership teams.*

A guided, assessment-fueled workshop a leader can run themselves, plus the action loop
that proves it worked: **Assess → Generate the agenda → Run it live → Capture commitments → Re-measure.**

## What's here

- **`index.html`** — a single, self-contained landing page. No build step, no dependencies.
  - Hero with the core positioning and a live "run mode" session preview
  - The loop, explained in five steps
  - Why OwnTheAgenda (leader-as-operator, owned assessment science, session-as-hero, the loop)
  - An assessment preview showing team dynamics against healthy bands
  - A **brand & logo** section: the wordmark, three logo directions (Lead line, Checkpoint,
    Open agenda), the palette, and the type pairing
  - An email-capture call to action

## View it

Open `index.html` in any browser:

```bash
# macOS
open index.html
# Linux
xdg-open index.html
# or serve it
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Design system

Lifted directly from the product mockup so the site feels native to the app.

| Token | Value |
|---|---|
| Forest | `#3A4D3F` |
| Green (active) | `#3F7D5A` |
| Canvas (cream) | `#F3F1E8` |
| Ink | `#2A2A26` |
| Amber | `#A8862F` |
| Display type | Playfair Display |
| Interface / body type | Inter |

Fonts load from Google Fonts; everything else (including the logo SVGs and favicon) is inline,
so the page works as a single file.
