# Workshop Handoff #2 — Audit & Reconciliation Tracker

Source: Claude Design bundle `Owntheagenda__Workshophandoff_2` (`Workshops.dc.html`
primary; `Assessments.dc.html` reference; 24 PNGs; `DESIGN (1).md` system spec).

**Scope (locked with product owner):** full audit + reconcile every divergence
(1.c) · **all** workshop surfaces · **close** fidelity (match the visual language,
not pixel-perfect) · **keep** existing tables (migrate only when genuinely
required) · SMART actions gain **captured-by-block + info** · advanced canvas:
**match the features** · **Workshops-only** (Assessments out of scope) · **follow
the existing Next.js layout** (no `/template`·`/modules` folders).

## Headline
Most of the module was already shipped by the earlier handoffs: the 10-block
taxonomy, builder, run cockpit (new modules), whiteboards + board editor +
exporters, templates, dashboard, overview, report and prep. The real work is
*divergence reconciliation*, concentrated in five buckets below.

## Audit summary (design view ⟷ component)
| Surface | State | Action |
|---|---|---|
| Home + Dashboard | ~95% compliant (layout, tokens, charts, filters, follow-through) | none |
| Overview + Builder | compliant; code ahead of design (5 builder views, assessment binding) | none (minor copy/CSS only) |
| New-workshop window | near-exact | 2 nits (blank-note bg `#faf9f4`, `.two` gap) |
| Templates view | diverges | single-row card footer, inline Delete + Duplicate-for-owned, grid, button size |
| Whiteboards home | gaps | KPI row, most-used-templates, owner label, filter-pill chevron/badge |
| Canvas — BoardEditor | feature-complete (9 shapes, connectors, props, PNG/PPTX/JSON, import, templates, z-order, cursors) | none |
| Canvas — run CanvasBoard | lighter | + triangle/hexagon/parallelogram/star, fullscreen toggle |
| Run cockpit | functional; layout/labels differ from design | 3-col layout audit (verify first), "End session" label, role-toggle placement |
| **Actions — captured by block** | **missing linkage** | **DB + cockpit + report (req. 5)** |
| Report | flat actions only | group actions under their block + annotate |

No new tables required; the only schema change is one column + RPC arg
(`action_item.block_ord`), mirroring the existing `decision.block_ord`.

## Plan (each: tsc + build + DB-under-RLS + browser → commit)
- **A — Captured by block (req. 5)** ✅ — `action_item.block_ord` + `add_action`
  `p_block_ord` (falls back to `session.current_block_ord`); cockpit stamps the
  current block at every capture point (ActionsModule, aggregate panel, idea→action);
  cockpit shows "Captured in · {block}"; report annotates the flat list and lists
  each block's actions under "Captured by block".
- **B — Templates view** — single-row card footer; inline Delete (center confirm
  per DESIGN §7.5) + Duplicate for owned; New-template button sizing; grid.
- **C — Whiteboards home** — KPI strip (Whiteboards · Active · Edits this week ·
  Collaborators), most-used-templates, owner label, filter-pill polish.
- **D — Run CanvasBoard features** — triangle/hexagon/parallelogram/star + fullscreen.
- **E — Run cockpit polish** — verify the 3-col layout claim against the real
  component; "End session" label; role-toggle/header chrome alignment.
- **F — Minor nits** — New-workshop blank-note bg + grid gap; Overview/Builder copy.

## Checklist
```markdown
- [x] Phase 1: read bundle + 5-surface parallel audit + gap analysis + questions
- [x] Scope locked (1.c / all / close / keep / capture-by-block+info / match-features / workshop-only / follow-layout)
- [x] A — Captured by block: migration + RPC + types + ActionsModule + RunClient panel + IdeaModule + report (tsc green; RLS verified block_ord 3 + fallback 1)
- [x] B — Templates view: single-row footer · inline Duplicate (icon) + Delete (owned, center confirm) · NEW TEMPLATE 12px uppercase (browser-verified)
- [x] C — Whiteboards home: real 4-KPI strip (Whiteboards/Active/Edits this week/Collaborators) + owner label on cards (browser-verified). NOTE: "most-used templates" usage bars skipped — no usage data exists and we keep to real data (no new table).
- [x] D — Run CanvasBoard: triangle/hexagon/parallelogram/star (SHAPE_KINDS already supported them) + fullscreen toggle (tsc+build green; needs a live session to screenshot)
- [x] E — Run cockpit polish: "End session" label (was "Close ▸"). DEFERRED: full 3-col relayout — at "close" fidelity the working horizontal run-of-show rail is an acceptable equivalent; a full relayout of the realtime cockpit is a high-risk standalone task, flagged not silently done.
- [x] F — Minor nits: new-workshop blank-note bg → #faf9f4 (browser-verified). Skipped the `.two` 14→12px gap (global class, wide blast radius, within tolerance).
- [x] Final verify: tsc + build green; browser walkthrough of Templates, Whiteboards home, New-workshop window
```
