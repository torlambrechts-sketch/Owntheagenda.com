"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/util";
import { SideWindow } from "@/components/SideWindow";
import { buildFromTemplate, createBlankWorkshop, createSeededWorkshop, deleteWorkshop, scheduleWorkshop, updateWorkshopTitle } from "./actions";
import { Icon, catVis, statusVis, WA } from "./visuals";
import type { TemplateCard, WorkshopRow, Recommendation, AssessOption } from "./WorkshopsClient";

const SCORE_COLOR = ["var(--rust)", "var(--amber)", "var(--green)"] as const;

type NwMode = "assessment" | "template" | "blank";
const NW_MODES: { key: NwMode; icon: string; title: string; blurb: string }[] = [
  { key: "assessment", icon: "Sparkles", title: "From assessment", blurb: "Auto-suggest an agenda from results" },
  { key: "template", icon: "Layers", title: "From template", blurb: "Start from a curated agenda" },
  { key: "blank", icon: "PenLine", title: "Blank", blurb: "Empty phase columns" },
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
  teamOptions = [],
  assessOptions = [],
}: {
  teamId: string;
  canManage: boolean;
  templates: TemplateCard[];
  workshops: WorkshopRow[];
  recommendation: Recommendation | null;
  surveyInsts?: { kind: string; name: string }[];
  scienceByCategory?: Record<string, string>;
  kpis?: { label: string; value: string; sub: string }[];
  teamOptions?: { id: string; name: string }[];
  assessOptions?: AssessOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [layout, setLayout] = useState<"A" | "B">("A");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // "New workshop" slide-over — Start point (assessment / template / blank),
  // details (name / team / date), then create and land in the builder.
  const [newOpen, setNewOpen] = useState(false);
  const [nwMode, setNwMode] = useState<NwMode>("assessment");
  const [nwName, setNwName] = useState("");
  const [nwTeam, setNwTeam] = useState(teamId);
  const [nwDate, setNwDate] = useState("");
  const [nwTemplate, setNwTemplate] = useState<string | null>(null);
  const [nwAssessment, setNwAssessment] = useState<string | null>(assessOptions.find((a) => a.seedBlocks.length)?.surveyId ?? null);

  function openNew(mode: NwMode) {
    setNwMode(mode);
    setNwName("");
    setNwTeam(teamId);
    setNwDate("");
    setNwTemplate(null);
    setNwAssessment(assessOptions.find((a) => a.seedBlocks.length)?.surveyId ?? null);
    setNewOpen(true);
  }

  // "Build workshop" — create an empty draft and go straight to the builder
  // (no slide-over). "New workshop" is the slide-over with start-point choices.
  function buildDirect() {
    startTransition(async () => {
      const r = await createBlankWorkshop(teamId, "");
      if (r.error) { flash(r.error); return; }
      if (r.id) router.push(`/workshops/${r.id}`);
    });
  }

  // The template whose agenda we'll seed (template-mode preview).
  const seedTemplate = nwMode === "template" ? templates.find((t) => t.id === nwTemplate) ?? null : null;
  // The selected assessment (assessment-mode preview).
  const selectedAssess = nwMode === "assessment" ? assessOptions.find((a) => a.surveyId === nwAssessment) ?? null : null;

  const canCreate =
    nwMode === "blank" ||
    (nwMode === "template" && !!nwTemplate) ||
    (nwMode === "assessment" && !!selectedAssess && selectedAssess.seedBlocks.length > 0);

  function createWorkshop() {
    if (!canCreate) {
      flash(nwMode === "template" ? "Pick a template first" : nwMode === "assessment" ? "Pick an assessment with results" : "Could not create");
      return;
    }
    const title = nwName.trim();
    startTransition(async () => {
      let id: string | undefined;
      let err: string | undefined;
      if (nwMode === "template" && nwTemplate) {
        const r = await buildFromTemplate(nwTeam, nwTemplate);
        id = r.id; err = r.error;
      } else if (nwMode === "assessment" && selectedAssess) {
        const r = await createSeededWorkshop(
          nwTeam,
          title || `${selectedAssess.name} follow-up`,
          selectedAssess.seedBlocks.map((b) => ({ title: b.title, activityType: b.activityType as never, duration: b.duration, prompt: b.prompt })),
        );
        id = r.id; err = r.error;
      } else {
        const r = await createBlankWorkshop(nwTeam, title || "Untitled workshop");
        id = r.id; err = r.error;
      }
      if (err) { flash(err); return; }
      if (!id) { flash("Could not create the workshop"); return; }
      // buildFromTemplate names the workshop after the template; honour a custom name.
      if (title && nwMode === "template") await updateWorkshopTitle(id, title);
      if (nwDate) await scheduleWorkshop(id, `${nwDate}T09:00`);
      router.push(`/workshops/${id}`);
    });
  }

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
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
        {canManage ? (
          <>
            <button onClick={buildDirect} disabled={pending} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: "#404040", border: "1px solid #d4d4d4", borderRadius: 7, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: pending ? "default" : "pointer", fontFamily: "inherit", opacity: pending ? 0.6 : 1 }}>
              <Icon name="Wand2" size={15} color="#404040" /> Build workshop
            </button>
            <button onClick={() => openNew(assessOptions.some((a) => a.seedBlocks.length) ? "assessment" : "blank")} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: WA.accent, color: "#fff", border: "none", borderRadius: 7, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="Plus" size={16} color="#fff" /> New workshop
            </button>
          </>
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
        <WorkshopBoard workshops={visible} canManage={canManage} onNew={() => openNew("blank")} />
      )}

      {/* ---- "New workshop" slide-over: start point → details → create ---- */}
      <SideWindow
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New workshop"
        subtitle="Start from an assessment, a template, or a blank canvas"
        footer={
          <>
            <span style={{ fontSize: 12, color: WA.faint2, marginRight: "auto" }}>
              {nwMode === "blank" ? "Opens an empty builder" : nwMode === "template" ? (seedTemplate ? `Seeds ${seedTemplate.steps} blocks` : "") : (selectedAssess?.seedBlocks.length ? `Seeds ${selectedAssess.seedBlocks.length} blocks` : "")}
            </span>
            <button className="btn-sec" onClick={() => setNewOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={pending || !canCreate} onClick={createWorkshop}>
                <Icon name="Wand2" size={15} color="#fff" /> Create workshop
              </button>
            </div>
          </>
        }
      >
        {/* Start point — three mode cards */}
        <div className="nw-eyebrow">Start point</div>
        <div className="nw-modes">
          {NW_MODES.map((m) => (
            <button key={m.key} type="button" className={`nw-mode${nwMode === m.key ? " on" : ""}`} onClick={() => { setNwMode(m.key); if (m.key === "assessment") setNwTeam(teamId); }}>
              {m.key === "assessment" ? <span className="nw-mode-badge">Recommended</span> : null}
              <Icon name={m.icon} size={18} color={nwMode === m.key ? WA.accent : WA.faint} />
              <span className="nw-mode-t">{m.title}</span>
              <span className="nw-mode-s">{m.blurb}</span>
            </button>
          ))}
        </div>

        {/* Mode-specific body */}
        {nwMode === "assessment" ? (
          assessOptions.length ? (
            <>
              <div className="nw-eyebrow">Choose assessment</div>
              <div className="nw-assess-list">
                {assessOptions.map((a) => {
                  const on = nwAssessment === a.surveyId;
                  return (
                    <button key={a.surveyId} type="button" className={`nw-assess-row${on ? " on" : ""}`} disabled={!a.seedBlocks.length} onClick={() => setNwAssessment(a.surveyId)}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="nw-assess-t">{a.name}</div>
                        <div className="nw-assess-s">{a.teamName} · {a.responses} response{a.responses === 1 ? "" : "s"} · {a.dateLabel}</div>
                      </div>
                      {a.masked || a.score == null ? (
                        <div className="nw-assess-scale" style={{ textAlign: "right", flexShrink: 0 }}>awaiting<br />responses</div>
                      ) : (
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div className="nw-assess-score" style={{ color: SCORE_COLOR[a.band] }}>{a.score}</div>
                          <div className="nw-assess-scale">of {a.scale}</div>
                        </div>
                      )}
                      {on ? <span className="nw-tpl-check"><Icon name="Check" size={13} color="#fff" /></span> : null}
                    </button>
                  );
                })}
              </div>
              {selectedAssess && selectedAssess.seedBlocks.length ? (
                <div className="nw-seedcard">
                  <div className="nw-seed-h"><Icon name="Sparkles" size={13} color="#5b5536" /> We’ll seed {selectedAssess.seedBlocks.length} blocks</div>
                  <div className="nw-seed-sub">Targeting the lowest-scoring areas of <b>{selectedAssess.name}</b>. You can adjust everything in the builder.</div>
                  {selectedAssess.weak.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 11 }}>
                      {selectedAssess.weak.map((w, i) => (
                        <span key={i} className="nw-weak-chip">{w.label} · {w.score}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="nw-seed-list">
                    {selectedAssess.seedBlocks.map((b, i) => (
                      <div className="nw-seed-row" key={i}><span className="nw-seed-dot" />{b.title}<span className="nw-seed-meta">{b.phaseLabel} · {b.duration}m</span></div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="form-note">No completed assessments for this team yet{surveyInsts.length ? " — run one from Assessments first" : ""}. Pick <b>Template</b> or <b>Blank</b> to start now.</div>
          )
        ) : null}

        {nwMode === "template" ? (
          <>
            <div className="nw-eyebrow">Choose template</div>
            <div className="nw-tpl-list">
              {templates.map((t) => {
                const v = catVis(t.category);
                const on = nwTemplate === t.id;
                return (
                  <button key={t.id} type="button" className={`nw-tpl-row${on ? " on" : ""}`} onClick={() => setNwTemplate(t.id)}>
                    <span className="nw-tpl-ic" style={{ background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={15} color={v.accent} /></span>
                    <span className="nw-tpl-body"><span className="nw-tpl-t">{t.name}</span><span className="nw-tpl-m">{t.minutes} min · {t.steps} blocks</span></span>
                    {on ? <span className="nw-tpl-check"><Icon name="Check" size={13} color="#fff" /></span> : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {nwMode === "blank" ? (
          <div className="nw-blanknote">You’ll start with empty phase columns — <b>Open · Explore · Decide · Close</b> — and build the agenda block by block in the builder.</div>
        ) : null}

        {/* Details */}
        <div className="nw-eyebrow">Details</div>
        <div className="field">
          <label htmlFor="nw-name">Workshop name {nwMode === "blank" ? null : <span className="opt">(optional)</span>}</label>
          <input className="inp" id="nw-name" value={nwName} onChange={(e) => setNwName(e.target.value)} placeholder="e.g. Q3 leadership alignment" />
        </div>
        <div className="two">
          <div className="field">
            <label>Team {nwMode === "assessment" ? <span className="opt">(from assessment)</span> : null}</label>
            <select className="inp" value={nwTeam} disabled={nwMode === "assessment"} onChange={(e) => setNwTeam(e.target.value)}>
              {teamOptions.length ? teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>) : <option value={teamId}>This team</option>}
            </select>
          </div>
          <div className="field">
            <label>Date <span className="opt">(optional)</span></label>
            <input className="inp" type="date" value={nwDate} onChange={(e) => setNwDate(e.target.value)} />
          </div>
        </div>
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}

// ===== Layout B: status-grouped kanban board (design isHomeBoard) =====
const BOARD_COLUMNS: { key: string; title: string; dot: string; match: (s: string) => boolean }[] = [
  { key: "active", title: "Active", dot: "#3f7d5a", match: (s) => s === "live" },
  { key: "upcoming", title: "Upcoming", dot: "#c9a227", match: (s) => s === "scheduled" || s === "draft" },
  { key: "done", title: "Completed", dot: "#9a9a8c", match: (s) => s === "done" },
];

function WorkshopBoard({ workshops, canManage, onNew }: { workshops: WorkshopRow[]; canManage: boolean; onNew: () => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
      {BOARD_COLUMNS.map((col) => {
        const items = workshops.filter((w) => col.match(w.status));
        return (
          <div key={col.key} style={{ background: WA.kpiBg, borderRadius: 13, padding: 13, minHeight: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 11px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: WA.ink }}>{col.title}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: WA.faint2, fontVariantNumeric: "tabular-nums" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {items.map((w) => {
                const v = catVis(w.category);
                const s = statusVis(w.status);
                const live = w.status === "live";
                const href = live ? `/run/${w.id}` : w.status === "done" ? `/workshops/${w.id}/overview` : `/workshops/${w.id}`;
                return (
                  <Link key={w.id} href={href} style={{ display: "block", background: "#fff", border: `1px solid ${live ? "#c5d3c8" : WA.cardBorder}`, borderRadius: 11, padding: "12px 13px", textDecoration: "none", boxShadow: live ? "0 0 0 2px rgba(26,61,50,.07)" : "0 1px 2px rgba(0,0,0,.03)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={16} color={v.accent} /></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: WA.ink, lineHeight: 1.25 }}>{w.title}</div>
                        <div style={{ marginTop: 3, fontSize: 11, color: WA.faint2 }}>#{w.id.slice(0, 4).toUpperCase()}{w.templateName ? ` · ${w.templateName}` : ""}</div>
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.text, flexShrink: 0 }}><span className={s.live ? "wa-pulse" : undefined} style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />{s.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, paddingTop: 10, borderTop: `1px solid ${WA.hair}`, fontSize: 11.5, color: WA.faint }}>
                      {w.creatorName ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#e7efe9", color: WA.accent, fontSize: 9, fontWeight: 700 }}>{initials(w.creatorName)}</span> : null}
                      <span>{fmtWhen(w)}</span>
                      <span style={{ marginLeft: "auto" }}>{w.participants ? `${w.participants} ppl` : ""}</span>
                    </div>
                  </Link>
                );
              })}
              {items.length === 0 ? (
                <div style={{ padding: "18px 8px", textAlign: "center", fontSize: 12, color: WA.faint2 }}>Nothing here yet.</div>
              ) : null}
              {col.key === "upcoming" && canManage ? (
                <button onClick={onNew} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", background: "transparent", border: "1.5px dashed #cbd5d2", borderRadius: 11, color: WA.accent, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
                  <Icon name="Plus" size={15} color={WA.accent} /> New workshop
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
