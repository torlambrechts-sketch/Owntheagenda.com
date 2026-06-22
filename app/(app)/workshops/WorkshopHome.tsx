"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORY, ACTIVITY, initials } from "@/lib/util";
import { SideWindow } from "@/components/SideWindow";
import { buildFromTemplate, deleteWorkshop, quickStart } from "./actions";
import { Icon, catVis, statusVis, WA } from "./visuals";
import type { TemplateCard, WorkshopRow, Recommendation } from "./WorkshopsClient";

const QUICK_MODULES = [
  { kind: "canvas", label: "Canvas", blurb: "Freeform board — notes, shapes, connectors" },
  { kind: "brainstorm", label: "Brainstorm", blurb: "Gather ideas, then cluster" },
  { kind: "vote", label: "Vote", blurb: "Dot-vote to prioritize" },
  { kind: "discuss", label: "Discuss", blurb: "A guided discussion prompt" },
  { kind: "feedback", label: "Feedback", blurb: "Sort thoughts into lanes" },
  { kind: "checkin", label: "Check-in", blurb: "A quick round to open" },
  { kind: "outcome", label: "Outcomes", blurb: "Capture decisions & actions" },
  { kind: "manual", label: "Notes", blurb: "Facilitator notes / freeform" },
];

// Filter tabs map the mockup's labels onto the app's workshop_status values.
const FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "live", label: "Active", match: (s) => s === "live" },
  { key: "scheduled", label: "Upcoming", match: (s) => s === "scheduled" || s === "draft" },
  { key: "done", label: "Completed", match: (s) => s === "done" },
];

function fmtWhen(w: WorkshopRow): string {
  if (w.status === "live") return "In progress";
  if (w.status === "draft") return "Not scheduled";
  if (w.status === "scheduled" && w.scheduledAt) {
    const d = new Date(w.scheduledAt);
    if (!isNaN(d.getTime())) return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  return w.editedLabel;
}
function outcomeChips(w: WorkshopRow): { icon: string; label: string }[] {
  const out: { icon: string; label: string }[] = [];
  if (w.decisions) out.push({ icon: "Gavel", label: `${w.decisions} decision${w.decisions === 1 ? "" : "s"}` });
  if (w.actions) out.push({ icon: "ListTodo", label: `${w.actions} action${w.actions === 1 ? "" : "s"}` });
  return out;
}

export function WorkshopHome({
  teamId,
  canManage,
  templates,
  workshops,
  recommendation,
  surveyInsts = [],
  scienceByCategory = {},
  kpis = [],
}: {
  teamId: string;
  canManage: boolean;
  templates: TemplateCard[];
  workshops: WorkshopRow[];
  recommendation: Recommendation | null;
  surveyInsts?: { kind: string; name: string }[];
  scienceByCategory?: Record<string, string>;
  kpis?: { label: string; value: string; sub: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [layout, setLayout] = useState<"A" | "B">("A");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickKind, setQuickKind] = useState("canvas");
  const [quickInst, setQuickInst] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [preview, setPreview] = useState<TemplateCard | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }
  function runQuick() {
    startTransition(async () => {
      const res = await quickStart(teamId, quickTitle, quickKind, quickKind === "survey" ? quickInst : undefined);
      if (res.error) flash(res.error);
      else if (res.workshopId) router.push(`/run/${res.workshopId}`);
    });
  }
  function use(templateId: string, pulseId?: string | null) {
    startTransition(async () => {
      const res = await buildFromTemplate(teamId, templateId, pulseId ?? undefined);
      if (res.error) flash(res.error);
      else if (res.id) router.push(`/workshops/${res.id}`);
    });
  }
  function remove(id: string) {
    setMenuFor(null);
    if (!confirm("Delete this workshop?")) return;
    startTransition(async () => {
      const res = await deleteWorkshop(id);
      if (res.error) flash(res.error);
      else { flash("Workshop deleted"); router.refresh(); }
    });
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = workshops.filter((w) => f.match(w.status)).length;
    return c;
  }, [workshops]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const f = FILTERS.find((x) => x.key === filter)!;
    return workshops.filter(
      (w) => f.match(w.status) && (!needle || w.title.toLowerCase().includes(needle) || (w.templateName ?? "").toLowerCase().includes(needle)),
    );
  }, [workshops, filter, query]);

  const seg = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 7,
    padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    background: active ? "#fff" : "transparent", color: active ? WA.accent : "#6b6f68",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
  });

  return (
    <div style={{ color: WA.ink2 }}>
      {/* action bar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 10, margin: "2px 0 18px" }}>
        <div style={{ display: "inline-flex", gap: 3, padding: 3, background: WA.segBg, borderRadius: 9 }}>
          <button onClick={() => setLayout("A")} style={seg(layout === "A")}><Icon name="List" size={14} color={layout === "A" ? WA.accent : "#6b6f68"} />List</button>
          <button onClick={() => setLayout("B")} style={seg(layout === "B")}><Icon name="LayoutGrid" size={14} color={layout === "B" ? WA.accent : "#6b6f68"} />Board</button>
        </div>
        <button onClick={() => setBrowseOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: "#404040", border: "1px solid #d4d4d4", borderRadius: 7, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <Icon name="Layers" size={15} color="#404040" /> Browse templates
        </button>
        {canManage ? (
          <button onClick={() => setQuickOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: WA.accent, color: "#fff", border: "none", borderRadius: 7, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <Icon name="Plus" size={16} color="#fff" /> New workshop
          </button>
        ) : null}
      </div>

      {/* grounded recommendation (kept — a real, valuable app feature) */}
      {recommendation ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${WA.cardBorder}`, borderRadius: 13, padding: "16px 18px", marginBottom: 18, boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: WA.accent, marginBottom: 6 }}>
              <Icon name="Sparkles" size={12} color={WA.accent} /> Grounded recommendation
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: WA.ink }}>
              {recommendation.dynamicLabel} {recommendation.belowBand ? "is below target" : "is your lowest reading"}
              {recommendation.pct != null ? ` · ${recommendation.pct}% vs ${recommendation.targetLow}%+` : ""}
            </div>
            <div style={{ fontSize: 13, color: WA.muted, marginTop: 2 }}>
              Run <b>{recommendation.templateName}</b> to {recommendation.why}.
              {recommendation.scienceSlug ? <> <Link href={`/help/${recommendation.scienceSlug}`} style={{ color: WA.accent, fontWeight: 600 }}>Learn the science →</Link></> : null}
            </div>
          </div>
          {canManage ? (
            <button disabled={pending} onClick={() => use(recommendation.templateId, recommendation.pulseId)} style={{ background: WA.accent, color: "#fff", border: "none", borderRadius: 7, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Build it ▸</button>
          ) : null}
        </div>
      ) : null}

      {/* KPI strip */}
      {kpis.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ background: WA.kpiBg, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: WA.ink, lineHeight: 1 }}>{k.value}</div>
              <div style={{ marginTop: 7, fontSize: 13, fontWeight: 600, color: WA.ink }}>{k.label}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: "#6b6f68" }}>{k.sub}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* templates gallery */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
          <span style={{ fontFamily: WA.serif, fontSize: 19, fontWeight: 600, color: WA.ink }}>Start from a template</span>
          <span style={{ fontSize: 12.5, color: WA.faint2 }}>{templates.length} curated for leadership teams</span>
        </div>
        <Link href="/workshops/templates" style={{ fontSize: 12.5, fontWeight: 600, color: WA.accent, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>Manage templates <Icon name="ChevronRight" size={14} color={WA.accent} /></Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 30 }}>
        {templates.slice(0, 6).map((t) => {
          const v = catVis(t.category);
          return (
            <button key={t.id} type="button" onClick={() => setPreview(t)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${WA.cardBorder}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(0,0,0,.04)", padding: "16px 16px 14px", display: "flex", flexDirection: "column", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={21} color={v.accent} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: WA.ink, lineHeight: 1.25 }}>{t.name}</div>
                  <div style={{ marginTop: 2, fontSize: 12.5, color: WA.faint, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.description ?? `${CATEGORY[t.category] ?? t.category} workshop`}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 13, paddingTop: 12, borderTop: `1px solid ${WA.hair}`, fontSize: 11.5, color: WA.faint }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="Clock" size={13} color={WA.faint2} />{t.minutes} min</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="Layers" size={13} color={WA.faint2} />{t.steps} blocks</span>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600, color: v.accent }}>Use <Icon name="ArrowRight" size={13} color={v.accent} /></span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ===== Layout A: combined table ===== */}
      {layout === "A" ? (
        <div style={{ background: "#fff", border: "1px solid rgba(229,229,229,.8)", borderRadius: 13, boxShadow: "0 1px 2px rgba(0,0,0,.04)", overflow: "hidden", marginBottom: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderBottom: `1px solid #f0eee8` }}>
            <div style={{ fontFamily: WA.serif, fontSize: 18, fontWeight: 600, color: WA.ink }}>All workshops <span style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: WA.faint2 }}>· {workshops.length}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", gap: 2, padding: 3, background: WA.segBg2, borderRadius: 8 }}>
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  return (
                    <button key={f.key} onClick={() => setFilter(f.key)} style={{ border: "none", borderRadius: 6, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: active ? "#fff" : "transparent", color: active ? WA.accent : "#6b6f68", boxShadow: active ? "0 1px 2px rgba(0,0,0,.07)" : "none" }}>
                      {f.label} <span style={{ color: active ? WA.faint2 : "#cbcbc3", fontVariantNumeric: "tabular-nums" }}>{counts[f.key]}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid #d4d4d4", borderRadius: 7, padding: "7px 11px", minWidth: 200, background: "#fff" }}>
                <Icon name="Search" size={15} color={WA.faint2} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workshops…" style={{ border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", color: WA.ink2, width: "100%", background: "transparent" }} />
              </div>
            </div>
          </div>

          {/* column header */}
          <div className="wa-row" style={{ padding: "10px 18px", borderBottom: "1px solid #f0eee8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: WA.faint }}>
            <div>Workshop</div><div>Status</div><div>When</div><div>Owner</div><div style={{ textAlign: "center" }}>People</div><div>Outcome</div><div style={{ textAlign: "right" }}>Actions</div>
          </div>

          {visible.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: WA.faint, fontSize: 13 }}>No workshops match your filters.</div>
          ) : visible.map((w) => {
            const v = catVis(w.category);
            const s = statusVis(w.status);
            const chips = outcomeChips(w);
            const prim = w.status === "live"
              ? { label: "Enter", icon: "Play", href: `/run/${w.id}`, solid: true }
              : w.status === "done"
                ? { label: "Results", icon: "ChartColumnBig", href: `/workshops/${w.id}/overview`, solid: true }
                : { label: w.status === "draft" ? "Edit" : "Open", icon: "PenLine", href: `/workshops/${w.id}`, solid: false };
            return (
              <div key={w.id} className="wa-row wa-rowline" style={{ alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${WA.rowHair}` }}>
                <div style={{ minWidth: 0, paddingRight: 14, display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={17} color={v.accent} /></span>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/workshops/${w.id}`} style={{ fontSize: 14, fontWeight: 600, color: WA.ink, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{w.title}</Link>
                    <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: WA.faint2 }}>#{w.id.slice(0, 4).toUpperCase()}</span>
                      {w.templateName ? <><span style={{ color: "#e5e5e5" }}>·</span><span style={{ fontSize: 11.5, color: WA.faint2 }}>{w.templateName}</span></> : null}
                    </div>
                  </div>
                </div>
                <div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", padding: "3px 9px", borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                    <span className={s.live ? "wa-pulse" : undefined} style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />{s.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: WA.muted }}>{fmtWhen(w)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {w.creatorName ? (
                    <>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", background: "#e7efe9", color: WA.accent, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(w.creatorName)}</span>
                      <span style={{ fontSize: 12.5, color: "#404040", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.creatorName}</span>
                    </>
                  ) : <span style={{ fontSize: 12, color: "#cbd5d2" }}>—</span>}
                </div>
                <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#404040" }}>{w.participants || <span style={{ color: "#cbd5d2" }}>—</span>}</div>
                <div style={{ paddingRight: 12 }}>
                  {chips.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {chips.map((o, i) => (
                        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: WA.muted, background: "#f3f4f1", border: "1px solid #e8e6df", borderRadius: 6, padding: "2px 7px" }}><Icon name={o.icon} size={11} color={WA.faint} />{o.label}</span>
                      ))}
                    </div>
                  ) : <span style={{ fontSize: 12, color: "#cbd5d2" }}>—</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, position: "relative" }}>
                  <Link href={prim.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${prim.solid ? WA.accent : "#d4d4d4"}`, background: prim.solid ? WA.accent : "#fff", color: prim.solid ? "#fff" : "#404040", borderRadius: 7, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                    <Icon name={prim.icon} size={14} color={prim.solid ? "#fff" : "#404040"} />{prim.label}
                  </Link>
                  <button onClick={() => setMenuFor(menuFor === w.id ? null : w.id)} aria-label="Workshop actions" style={{ border: "1px solid #e5e5e5", background: "#fff", color: WA.faint, cursor: "pointer", width: 32, height: 32, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="MoreHorizontal" size={16} color={WA.faint} />
                  </button>
                  {menuFor === w.id ? (
                    <>
                      <div onClick={() => setMenuFor(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      <div style={{ position: "absolute", top: 38, right: 0, background: "#fff", border: `1px solid ${WA.cardBorder}`, borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 6, zIndex: 41, minWidth: 150, display: "flex", flexDirection: "column" }}>
                        <Link href={`/workshops/${w.id}/overview`} onClick={() => setMenuFor(null)} style={{ padding: "8px 10px", fontSize: 13, color: WA.ink2, textDecoration: "none", borderRadius: 6 }}>Overview</Link>
                        <Link href={`/workshops/${w.id}`} onClick={() => setMenuFor(null)} style={{ padding: "8px 10px", fontSize: 13, color: WA.ink2, textDecoration: "none", borderRadius: 6 }}>Open builder</Link>
                        <Link href={`/run/${w.id}`} onClick={() => setMenuFor(null)} style={{ padding: "8px 10px", fontSize: 13, color: WA.ink2, textDecoration: "none", borderRadius: 6 }}>Run ▸</Link>
                        {canManage ? <button onClick={() => remove(w.id)} style={{ textAlign: "left", padding: "8px 10px", fontSize: 13, color: "#b8584a", background: "none", border: "none", cursor: "pointer", borderRadius: 6 }}>Delete</button> : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <WorkshopBoard workshops={visible} canManage={canManage} onNew={() => setQuickOpen(true)} />
      )}

      {/* ---- side windows ---- */}
      <SideWindow
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="New workshop"
        subtitle="Start a live session now — add steps as you go"
        size="compact"
        footer={<>
          <button className="btn-sec" onClick={() => setQuickOpen(false)}>Cancel</button>
          <div className="right"><button className="btn-prim" disabled={pending || (quickKind === "survey" && !quickInst)} onClick={runQuick}>Start session ▸</button></div>
        </>}
      >
        <div className="field">
          <label htmlFor="qs-title">Session name <span className="opt">(optional)</span></label>
          <input className="inp" id="qs-title" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder="Quick session" />
        </div>
        <div className="field">
          <label>Starting module</label>
          <div className="quickmods">
            {QUICK_MODULES.map((m) => (
              <button key={m.kind} type="button" className={`quickmod${quickKind === m.kind ? " on" : ""}`} onClick={() => { setQuickKind(m.kind); setQuickInst(""); }}>
                <span className="quickmod-t">{m.label}</span>
                <span className="quickmod-s">{m.blurb}</span>
              </button>
            ))}
          </div>
        </div>
        {surveyInsts.length ? (
          <div className="field">
            <label>Or an assessment</label>
            <div className="quickmods">
              {surveyInsts.map((sv) => (
                <button key={sv.kind} type="button" className={`quickmod${quickKind === "survey" && quickInst === sv.kind ? " on" : ""}`} onClick={() => { setQuickKind("survey"); setQuickInst(sv.kind); }}>
                  <span className="quickmod-t">{sv.name}</span>
                  <span className="quickmod-s">Anonymous team survey</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </SideWindow>

      {preview ? (
        <SideWindow
          open={!!preview}
          onClose={() => setPreview(null)}
          title={preview.name}
          subtitle={`${preview.steps} steps · ${preview.minutes} min`}
          footer={canManage ? <div className="right"><button className="btn-prim" disabled={pending} onClick={() => { const id = preview.id; setPreview(null); use(id); }}>Use template ▸</button></div> : null}
        >
          {preview.source ? <div className="src" style={{ marginTop: 0 }}>{preview.source}</div> : null}
          {preview.description ? <p style={{ color: "var(--muted)", fontSize: 13 }}>{preview.description}</p> : null}
          {scienceByCategory[preview.category] ? <Link className="cat-sci" href={`/help/${scienceByCategory[preview.category]}`} style={{ display: "inline-block", marginBottom: 10 }}>Learn the science →</Link> : null}
          <ol className="agenda">
            {(preview.phases ?? []).map((p, i) => (
              <li key={i} className="agenda-step">
                <div className="agenda-h"><span className="agenda-t">{p.title}</span><span className="agenda-meta">{ACTIVITY[p.type]?.label ?? p.type} · {p.minutes}m</span></div>
                {p.prompt ? <div className="agenda-p">{p.prompt}</div> : null}
              </li>
            ))}
          </ol>
        </SideWindow>
      ) : null}

      <SideWindow open={browseOpen} onClose={() => setBrowseOpen(false)} title="All templates" subtitle={`${templates.length} proven frameworks — pick one to preview`}>
        {Array.from(new Set(templates.map((t) => t.category))).map((cat) => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div className="a-gt" style={{ marginBottom: 8 }}>{CATEGORY[cat] ?? cat}</div>
            <div className="browse-list">
              {templates.filter((t) => t.category === cat).map((t) => (
                <button key={t.id} type="button" className="browse-row" onClick={() => { setBrowseOpen(false); setPreview(t); }}>
                  <span className="browse-nm">{t.name}</span>
                  <span className="browse-meta">{t.steps} steps · {t.minutes} min</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}

// ===== Layout B: focus cards + completed history =====
function WorkshopBoard({ workshops, canManage, onNew }: { workshops: WorkshopRow[]; canManage: boolean; onNew: () => void }) {
  const focus = workshops.filter((w) => w.status === "live" || w.status === "scheduled" || w.status === "draft");
  const history = workshops.filter((w) => w.status === "done");

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12, marginBottom: 20 }}>
        {focus.map((w) => {
          const v = catVis(w.category);
          const s = statusVis(w.status);
          const live = w.status === "live";
          return (
            <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: 10, background: "#fff", border: `1px solid ${live ? "#c5d3c8" : WA.cardBorder}`, borderRadius: 13, padding: "16px 17px", boxShadow: live ? "0 0 0 2px rgba(26,61,50,.08), 0 6px 18px rgba(58,77,63,.07)" : "0 1px 2px rgba(0,0,0,.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={19} color={v.accent} /></span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.text }}><span className={s.live ? "wa-pulse" : undefined} style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />{s.label}</span>
              </div>
              <div>
                <Link href={`/workshops/${w.id}`} style={{ fontSize: 15, fontWeight: 600, color: WA.ink, textDecoration: "none", lineHeight: 1.3 }}>{w.title}</Link>
                <div style={{ fontSize: 12, color: WA.faint, marginTop: 3 }}>{w.templateName ?? "Workshop"} · {fmtWhen(w)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                <Link href={live ? `/run/${w.id}` : `/workshops/${w.id}`} style={{ flex: 1, textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: WA.accent, color: "#fff", borderRadius: 7, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
                  <Icon name={live ? "Play" : "PenLine"} size={14} color="#fff" />{live ? "Enter live" : "Open agenda"}
                </Link>
                <Link href={`/workshops/${w.id}/overview`} aria-label="Overview" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, border: "1px solid #d4d4d4", borderRadius: 7, color: WA.muted, textDecoration: "none" }}>
                  <Icon name="ChartColumnBig" size={15} color={WA.muted} />
                </Link>
              </div>
            </div>
          );
        })}
        {canManage ? (
          <button onClick={onNew} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 130, background: "transparent", border: "1.5px dashed #cbd5d2", borderRadius: 13, color: WA.accent, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ width: 42, height: 42, borderRadius: "50%", border: "2px solid currentColor", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="Plus" size={20} color={WA.accent} /></span>
            New workshop
          </button>
        ) : null}
      </div>

      <div style={{ fontFamily: WA.serif, fontSize: 18, fontWeight: 600, color: WA.ink, marginBottom: 12 }}>Completed <span style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: WA.faint2 }}>· {history.length}</span></div>
      {history.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: WA.faint, fontSize: 13, background: "#fff", border: `1px solid ${WA.cardBorder}`, borderRadius: 13 }}>No finished workshops yet.</div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${WA.cardBorder}`, borderRadius: 13, overflow: "hidden" }}>
          {history.map((w) => {
            const v = catVis(w.category);
            const chips = outcomeChips(w);
            return (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: `1px solid ${WA.rowHair}` }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, background: v.tint, border: `1px solid ${v.border}`, color: v.accent, flexShrink: 0 }}><Icon name={v.icon} size={16} color={v.accent} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/workshops/${w.id}/overview`} style={{ fontSize: 14, fontWeight: 600, color: WA.ink, textDecoration: "none" }}>{w.title}</Link>
                  <div style={{ fontSize: 11.5, color: WA.faint2, marginTop: 1 }}>{w.editedLabel}{w.creatorName ? ` · ${w.creatorName}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {chips.map((o, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: WA.muted, background: "#f3f4f1", border: "1px solid #e8e6df", borderRadius: 6, padding: "2px 7px" }}><Icon name={o.icon} size={11} color={WA.faint} />{o.label}</span>
                  ))}
                </div>
                <Link href={`/workshops/${w.id}/overview`} style={{ fontSize: 12.5, fontWeight: 600, color: WA.accent, textDecoration: "none", whiteSpace: "nowrap" }}>Results →</Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
