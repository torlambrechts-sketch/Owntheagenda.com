"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/util";
import { buildFromTemplate, deleteWorkshop } from "./actions";
import { Icon, catVis, statusVis, WA } from "./visuals";
import type { WorkshopRow, Recommendation } from "./WorkshopsClient";

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
  workshops,
  recommendation,
  scienceByCategory = {},
  view = "list",
  filterOwner = "all",
  onNew,
  onFlash,
}: {
  teamId: string;
  canManage: boolean;
  workshops: WorkshopRow[];
  recommendation: Recommendation | null;
  scienceByCategory?: Record<string, string>;
  view?: "list" | "board";
  filterOwner?: string;
  onNew: () => void;
  onFlash: (m: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  function use(templateId: string, pulseId?: string | null) {
    startTransition(async () => {
      const res = await buildFromTemplate(teamId, templateId, pulseId ?? undefined);
      if (res.error) onFlash(res.error);
      else if (res.id) router.push(`/workshops/${res.id}`);
    });
  }
  function remove(id: string) {
    setMenuFor(null);
    if (!confirm("Delete this workshop?")) return;
    startTransition(async () => {
      const res = await deleteWorkshop(id);
      if (res.error) onFlash(res.error);
      else { onFlash("Workshop deleted"); router.refresh(); }
    });
  }

  // owner filter (from the header Filters popover) applies in both views
  const owned = useMemo(
    () => (filterOwner === "all" ? workshops : workshops.filter((w) => w.creatorName === filterOwner)),
    [workshops, filterOwner],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = owned.filter((w) => f.match(w.status)).length;
    return c;
  }, [owned]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const f = FILTERS.find((x) => x.key === filter)!;
    return owned.filter(
      (w) => f.match(w.status) && (!needle || w.title.toLowerCase().includes(needle) || (w.templateName ?? "").toLowerCase().includes(needle)),
    );
  }, [owned, filter, query]);

  return (
    <div style={{ color: WA.ink2 }}>
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

      {/* ===== List view ===== */}
      {view === "list" ? (
        <div style={{ background: "#fff", border: "1px solid rgba(229,229,229,.8)", borderRadius: 13, boxShadow: "0 1px 2px rgba(0,0,0,.04)", overflow: "hidden", marginBottom: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderBottom: `1px solid #f0eee8` }}>
            <div style={{ fontFamily: WA.serif, fontSize: 18, fontWeight: 600, color: WA.ink }}>All workshops <span style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: WA.faint2 }}>· {visible.length}</span></div>
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
                : { label: "Open", icon: "PenLine", href: `/workshops/${w.id}/overview`, solid: false };
            return (
              <div key={w.id} className="wa-row wa-rowline" style={{ alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${WA.rowHair}` }}>
                <div style={{ minWidth: 0, paddingRight: 14, display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={17} color={v.accent} /></span>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/workshops/${w.id}/overview`} style={{ fontSize: 14, fontWeight: 600, color: WA.ink, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{w.title}</Link>
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
                      <RowMenu w={w} canManage={canManage} onClose={() => setMenuFor(null)} onDelete={() => remove(w.id)} onFlash={onFlash} />
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <WorkshopBoard workshops={visible} canManage={canManage} onNew={onNew} />
      )}
    </div>
  );
}

// Row ⋯ menu aligned to the design: Open overview · Edit in builder · Run (or
// "View outcome" when completed) · Duplicate (toast — no real dup action) · Delete.
function RowMenu({ w, canManage, onClose, onDelete, onFlash }: { w: WorkshopRow; canManage: boolean; onClose: () => void; onDelete: () => void; onFlash: (m: string) => void }) {
  const item: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 13, color: WA.ink2, textDecoration: "none", borderRadius: 6, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit" };
  const runLabel = w.status === "done" ? "View outcome" : "Run workshop";
  const runHref = w.status === "done" ? `/workshops/${w.id}/overview` : `/run/${w.id}`;
  return (
    <div style={{ position: "absolute", top: 38, right: 0, background: "#fff", border: `1px solid #e4e1d5`, borderRadius: 10, boxShadow: "0 10px 30px rgba(42,42,38,.16)", padding: 5, zIndex: 41, minWidth: 190, display: "flex", flexDirection: "column" }}>
      <Link href={`/workshops/${w.id}/overview`} onClick={onClose} style={item}><Icon name="ChartColumnBig" size={15} color="#525252" />Open overview</Link>
      <Link href={`/workshops/${w.id}`} onClick={onClose} style={item}><Icon name="PenLine" size={15} color="#525252" />Edit in builder</Link>
      <Link href={runHref} onClick={onClose} style={item}><Icon name={w.status === "done" ? "Gavel" : "Play"} size={15} color="#525252" />{runLabel}</Link>
      <button onClick={() => { onClose(); onFlash("Duplicated"); }} style={item}><Icon name="Copy" size={15} color="#525252" />Duplicate</button>
      {canManage ? <button onClick={onDelete} style={{ ...item, color: "#b8584a" }}><Icon name="Trash2" size={15} color="#b8584a" />Delete</button> : null}
    </div>
  );
}

// ===== Board view: status-grouped kanban (design isHomeBoard) =====
const BOARD_COLUMNS: { key: string; title: string; dot: string; match: (s: string) => boolean }[] = [
  { key: "active", title: "Live", dot: "#16a34a", match: (s) => s === "live" },
  { key: "upcoming", title: "Scheduled", dot: "#2563eb", match: (s) => s === "scheduled" || s === "draft" },
  { key: "done", title: "Completed", dot: "#a6a698", match: (s) => s === "done" },
];

function WorkshopBoard({ workshops, canManage, onNew }: { workshops: WorkshopRow[]; canManage: boolean; onNew: () => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
      {BOARD_COLUMNS.map((col) => {
        const items = workshops.filter((w) => col.match(w.status));
        return (
          <div key={col.key} style={{ background: "#eceadf", borderRadius: 13, padding: 13, minHeight: 200 }}>
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
                const href = live ? `/run/${w.id}` : `/workshops/${w.id}/overview`;
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
