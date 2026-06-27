"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../visuals";
import { initials } from "@/lib/util";
import { accentHex, type WBObject } from "./wb";
import { MiniPreview } from "./MiniPreview";
import { createWhiteboard, deleteWhiteboard, renameWhiteboard } from "./actions";

export type BoardCard = {
  id: string;
  title: string;
  accent: string;
  editedLabel: string;
  updatedAt: string;
  ownerId: string | null;
  ownerName: string | null;
  objects: WBObject[];
  collaborators: string[];
};
export type TemplateCard = {
  key: string;
  title: string;
  desc: string;
  accent: string;
  uses: number;
  fromBoardId?: string;
  objects: WBObject[];
};

// Faithful to the design (Workshops.dc.html, whiteboards home): the same shell
// as the Workshops home — title + primary/Filters/⋯ header, a dark-green section
// tab band (Dashboard / Whiteboards / Templates), then the active section.
type Tab = "dashboard" | "whiteboards" | "templates";
type Sort = "recent" | "az" | "za";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutGrid" },
  { key: "whiteboards", label: "Whiteboards", icon: "Layers" },
  { key: "templates", label: "Templates", icon: "Presentation" },
];

export function WhiteboardsClient({
  teamId, boards, templates, ownerOptions, currentUserId,
}: {
  teamId: string | null;
  boards: BoardCard[];
  templates: TemplateCard[];
  ownerOptions: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [owner, setOwner] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const filterActive = owner !== "all" || sort !== "recent";

  // Dashboard KPIs (design wbDashKpis: Active boards / Templates / Edits this week / Collaborators).
  const kpis = useMemo(() => {
    const now = Date.now();
    const within = (iso: string, days: number) => {
      const t = new Date(iso).getTime();
      return Number.isFinite(t) && now - t <= days * 86_400_000;
    };
    const week = boards.filter((b) => within(b.updatedAt, 7)).length;
    const collaborators = new Set(boards.flatMap((b) => b.collaborators)).size;
    return [
      { n: boards.length, label: "Active boards", color: "#2a2a26" },
      { n: templates.length, label: "Templates", color: "#2a2a26" },
      { n: week, label: "Edits this week", color: "#42729e" },
      { n: collaborators, label: "Collaborators", color: "#3f7d5a" },
    ];
  }, [boards, templates]);

  const recent = useMemo(() => boards.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), [boards]);
  const topTemplates = useMemo(() => {
    const ranked = templates.slice().sort((a, b) => b.uses - a.uses);
    const max = Math.max(1, ...ranked.map((t) => t.uses));
    return ranked.slice(0, 5).map((t) => ({ ...t, pct: Math.round((t.uses / max) * 100) }));
  }, [templates]);

  const filteredBoards = useMemo(() => {
    let list = boards.slice();
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((b) => b.title.toLowerCase().includes(needle));
    if (owner === "me") list = list.filter((b) => b.ownerId === currentUserId);
    else if (owner !== "all") list = list.filter((b) => b.ownerId === owner);
    if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "za") list.sort((a, b) => b.title.localeCompare(a.title));
    else list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [boards, q, owner, sort, currentUserId]);

  const filteredTemplates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = templates.slice();
    if (needle) list = list.filter((t) => t.title.toLowerCase().includes(needle) || t.desc.toLowerCase().includes(needle));
    if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "za") list.sort((a, b) => b.title.localeCompare(a.title));
    return list;
  }, [templates, q, sort]);

  function newBoard(templateKey?: string, id?: string) {
    setBusy(id ?? "new");
    startTransition(async () => { await createWhiteboard(teamId, templateKey); });
  }
  function remove(b: BoardCard) {
    if (!confirm(`Delete “${b.title}”? This cannot be undone.`)) return;
    startTransition(async () => { await deleteWhiteboard(b.id); router.refresh(); });
  }
  function rename(b: BoardCard) {
    const t = prompt("Rename whiteboard", b.title);
    if (t == null) return;
    startTransition(async () => { await renameWhiteboard(b.id, t); router.refresh(); });
  }

  const chip = (accent: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
    borderRadius: 8, flexShrink: 0, background: `${accentHex(accent)}1a`, color: accentHex(accent),
  });

  return (
    <div className="wbg" style={{ color: "#2a2a26" }}>
      {/* header: title + primary + Filters + ⋯ (mirrors the Workshops home) */}
      <div className="wbg-head">
        <h1 className="page-title" style={{ margin: 0 }}>Whiteboards</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="wbg-new" disabled={pending && busy === "new"} onClick={() => newBoard()}>
            <Icon name="Plus" size={15} color="#fff" /> New whiteboard
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => { setFilterOpen((o) => !o); setPageMenuOpen(false); }} className="wbg-pill" style={{ borderColor: filterActive ? "#3a4d3f" : "#d8d4c6", background: filterActive ? "#eef4ef" : "#fff" }}>
              <Icon name="SlidersHorizontal" size={14} color="#585850" /> Filters
              {filterActive ? <span className="wbg-badge">1</span> : null}
              <Icon name="ChevronDown" size={14} color="#8a8a7e" />
            </button>
            {filterOpen ? (
              <>
                <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                <div className="wbg-pop" style={{ width: 236 }}>
                  <div className="wbg-pop-l">Owner</div>
                  <select value={owner} onChange={(e) => setOwner(e.target.value)} className="wbg-pop-sel">
                    <option value="all">All owners</option>
                    <option value="me">My boards</option>
                    {ownerOptions.filter((o) => o.id !== currentUserId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <div className="wbg-pop-l">Sort</div>
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="wbg-pop-sel">
                    <option value="recent">Most recent</option>
                    <option value="az">Name A–Z</option>
                    <option value="za">Name Z–A</option>
                  </select>
                  <button onClick={() => { setOwner("all"); setSort("recent"); setFilterOpen(false); }} className="wbg-pop-clear">Clear filters</button>
                </div>
              </>
            ) : null}
          </div>
          <div style={{ position: "relative" }}>
            <button onClick={() => { setPageMenuOpen((o) => !o); setFilterOpen(false); }} aria-label="Page actions" className="wbg-more"><Icon name="MoreHorizontal" size={18} color="#585850" /></button>
            {pageMenuOpen ? (
              <>
                <div onClick={() => setPageMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                <div className="wbg-pop" style={{ width: 198, padding: 5 }}>
                  <button className="wbg-mi" onClick={() => { setPageMenuOpen(false); setTab("templates"); }}><Icon name="Presentation" size={15} color="#525252" /><span>New from template</span></button>
                  <button className="wbg-mi" onClick={() => { setPageMenuOpen(false); newBoard(); }}><Icon name="Plus" size={15} color="#525252" /><span>Blank board</span></button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* dark-green section tab band */}
      <div className="wbg-band">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} className="wbg-bandtab" style={{ background: on ? "#f3f1e8" : "transparent", color: on ? "#2a2a26" : "rgba(255,255,255,.82)" }} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} size={17} color={on ? "#3a4d3f" : "rgba(255,255,255,.82)"} /><span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "dashboard" ? (
        <>
          <div className="wbg-kpis">
            {kpis.map((k) => (
              <div className="wbg-kpi" key={k.label}>
                <div className="wbg-kpi-n" style={{ color: k.color }}>{k.n}</div>
                <div className="wbg-kpi-l">{k.label}</div>
              </div>
            ))}
          </div>
          <div className="wbg-dash">
            <div className="wbg-card">
              <div className="wbg-card-h">
                <span className="wbg-card-t">Recently edited</span>
                <button className="wbg-card-link" onClick={() => setTab("whiteboards")}>View all</button>
              </div>
              {recent.length === 0 ? <div className="wbg-empty">No whiteboards yet.</div> : recent.map((b) => (
                <button key={b.id} className="wbg-recent" onClick={() => router.push(`/workshops/whiteboards/${b.id}`)}>
                  <span style={chip(b.accent)}><Icon name="Layers" size={15} color={accentHex(b.accent)} /></span>
                  <span className="wbg-recent-main">
                    <span className="wbg-recent-t">{b.title}</span>
                    <span className="wbg-recent-o">{b.ownerName ?? "—"}</span>
                  </span>
                  <span className="wbg-recent-e">{b.editedLabel || "just now"}</span>
                </button>
              ))}
            </div>
            <div className="wbg-card" style={{ padding: "18px 20px" }}>
              <div className="wbg-card-t" style={{ marginBottom: 16 }}>Most-used templates</div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
                {topTemplates.map((t) => (
                  <button key={t.key} className="wbg-top" onClick={() => newBoard(t.fromBoardId ? undefined : t.key, t.key)}>
                    <div className="wbg-top-h">
                      <span className="wbg-top-l"><span className="wbg-dot" style={{ background: accentHex(t.accent) }} />{t.title}</span>
                      <span className="wbg-top-n">{t.uses}</span>
                    </div>
                    <div className="wbg-bar"><div className="wbg-bar-fill" style={{ width: `${t.pct}%`, background: accentHex(t.accent) }} /></div>
                  </button>
                ))}
              </div>
              <div className="wbg-tplfoot">
                <span className="wbg-tplfoot-n">{templates.length}</span>
                <span>facilitation templates ready to run</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="wbg-toolbar">
            <label className="wbg-search">
              <Icon name="Search" size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
            </label>
          </div>

          {tab === "whiteboards" ? (
            filteredBoards.length === 0 ? (
              <div className="wbg-none">{q ? "No whiteboards match your search." : "No whiteboards yet — start one from scratch or pick a template."}</div>
            ) : (
              <div className="wbg-grid">
                {filteredBoards.map((b) => (
                  <article key={b.id} className="wbc" onClick={() => router.push(`/workshops/whiteboards/${b.id}`)}>
                    <div className="wbc-thumb"><MiniPreview objects={b.objects} /></div>
                    <div className="wbc-foot">
                      <span style={chip(b.accent)}><Icon name="Layers" size={15} color={accentHex(b.accent)} /></span>
                      <div className="wbc-main">
                        <div className="wbc-t">{b.title}</div>
                        <div className="wbc-e">Edited {b.editedLabel || "just now"}{b.ownerName ? ` · ${b.ownerName}` : ""}</div>
                      </div>
                      <div className="wbc-right">
                        <div className="wbc-avatars">
                          {b.collaborators.slice(0, 3).map((c, i) => <span key={i} className="wbc-av" title={c} style={{ background: avatarBg(c) }}>{initials(c)}</span>)}
                        </div>
                        <button className="wbc-menu" title="Rename" onClick={(e) => { e.stopPropagation(); rename(b); }}><Icon name="SquarePen" size={13} /></button>
                        <button className="wbc-menu" title="Delete" onClick={(e) => { e.stopPropagation(); remove(b); }}><Icon name="X" size={13} /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : (
            filteredTemplates.length === 0 ? (
              <div className="wbg-none">No templates match your search.</div>
            ) : (
              <div className="wbg-grid">
                {filteredTemplates.map((t) => (
                  <article key={t.key} className={`wbc${busy === t.key && pending ? " loading" : ""}`} onClick={() => newBoard(t.fromBoardId ? undefined : t.key, t.key)}>
                    <div className="wbc-thumb" style={{ height: 128 }}><MiniPreview objects={t.objects} /></div>
                    <div className="wbc-foot">
                      <span style={chip(t.accent)}><Icon name="Presentation" size={15} color={accentHex(t.accent)} /></span>
                      <div className="wbc-main">
                        <div className="wbc-t">{t.title}</div>
                        <div className="wbc-e" style={{ whiteSpace: "normal", lineHeight: 1.35 }}>{t.desc}</div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )
          )}
        </>
      )}

      <style>{styles}</style>
    </div>
  );
}

function avatarBg(name: string): string {
  const palette = ["#3f7d5a", "#a8543b", "#42729e", "#8a6d3b", "#7a5c9e"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

const styles = `
.wbg-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin:2px 0 16px}
.wbg-new{display:inline-flex;align-items:center;gap:7px;background:#3a4d3f;color:#fff;border:none;border-radius:6px;padding:11px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;font-family:inherit}
.wbg-new:hover{background:#2f4034}
.wbg-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #d8d4c6;border-radius:8px;padding:9px 13px;font-size:13px;font-weight:600;color:#2a2a26;cursor:pointer;font-family:inherit}
.wbg-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#3a4d3f;color:#fff;font-size:10.5px;font-weight:700}
.wbg-more{width:38px;height:38px;border-radius:8px;border:1px solid #d8d4c6;background:#fff;color:#585850;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.wbg-pop{position:absolute;top:calc(100% + 6px);right:0;background:#fff;border:1px solid #e4e1d5;border-radius:10px;box-shadow:0 12px 34px rgba(42,42,38,.16);padding:14px;z-index:60}
.wbg-pop-l{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#8a8a7e;margin-bottom:8px}
.wbg-pop-sel{width:100%;background:#fff;border:1px solid #d8d4c6;border-radius:7px;padding:9px 10px;font-size:13px;font-family:inherit;color:#2a2a26;outline:none;cursor:pointer;margin-bottom:12px}
.wbg-pop-clear{width:100%;border:1px solid #d8d4c6;background:#fff;color:#585850;border-radius:7px;padding:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
.wbg-mi{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:none;background:transparent;border-radius:7px;padding:8px 10px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;color:#404040}
.wbg-mi:hover{background:#f3f1e8}
.wbg-band{display:flex;gap:4px;padding:6px;background:#3a4d3f;border-radius:12px;margin-bottom:22px}
.wbg-bandtab{display:flex;align-items:center;justify-content:center;gap:9px;flex:1 1 0%;border:none;border-radius:9px;padding:12px 14px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}
.wbg-kpis{display:grid;grid-template-columns:repeat(4,1fr);background:#fff;border:1px solid #e4e1d5;border-radius:12px;box-shadow:0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05);padding:20px 8px;margin-bottom:16px}
.wbg-kpi{padding:0 22px;border-left:1px solid #eceadf}
.wbg-kpi:first-child{border-left:none}
.wbg-kpi-n{font-family:var(--font-display);font-size:32px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.wbg-kpi-l{margin-top:9px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#8a8a7e}
.wbg-dash{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch}
.wbg-card{background:#fff;border:1px solid #e4e1d5;border-radius:12px;box-shadow:0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05);overflow:hidden;display:flex;flex-direction:column}
.wbg-card-h{padding:15px 20px;border-bottom:1px solid #ece9df;display:flex;align-items:center;justify-content:space-between}
.wbg-card-t{font-family:var(--font-display);font-size:17px;font-weight:600;color:#2a2a26}
.wbg-card-link{border:none;background:none;font-size:12px;font-weight:600;color:#3a4d3f;cursor:pointer}
.wbg-empty{padding:24px;text-align:center;color:#a6a698;font-size:13px}
.wbg-recent{display:flex;align-items:center;gap:11px;width:100%;text-align:left;border:none;border-bottom:1px solid #ece9df;background:none;cursor:pointer;padding:13px 20px;font-family:inherit}
.wbg-recent:hover{background:#f7f5ee}
.wbg-recent-main{min-width:0;flex:1}
.wbg-recent-t{display:block;font-size:13.5px;font-weight:600;color:#2a2a26;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wbg-recent-o{display:block;font-size:11.5px;color:#a6a698;margin-top:1px}
.wbg-recent-e{font-size:12px;color:#a6a698;white-space:nowrap}
.wbg-top{display:block;width:100%;text-align:left;border:none;background:none;cursor:pointer;font-family:inherit;padding:0}
.wbg-top-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.wbg-top-l{font-size:12.5px;color:#404040;display:inline-flex;align-items:center;gap:8px;min-width:0}
.wbg-dot{width:9px;height:9px;border-radius:50%;flex:none}
.wbg-top-n{font-size:12px;font-weight:700;color:#2a2a26;font-variant-numeric:tabular-nums}
.wbg-bar{height:8px;border-radius:999px;background:#eceadf;overflow:hidden}
.wbg-bar-fill{height:100%;border-radius:999px}
.wbg-tplfoot{margin-top:18px;padding-top:15px;border-top:1px solid #ece9df;display:flex;align-items:center;gap:10px}
.wbg-tplfoot-n{font-family:var(--font-display);font-size:28px;font-weight:600;color:#3a4d3f}
.wbg-tplfoot span:last-child{font-size:12.5px;color:#585850;line-height:1.4}
.wbg-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:9px;margin-bottom:16px}
.wbg-search{display:inline-flex;align-items:center;gap:7px;border:1px solid #d8d4c6;border-radius:7px;padding:7px 11px;background:#fff;min-width:220px;color:#8a8a7e}
.wbg-search input{border:none;outline:none;font-size:13px;font-family:inherit;color:#2a2a26;width:100%;background:transparent}
.wbg-none{padding:50px;text-align:center;color:#a6a698;font-size:13.5px}
.wbg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.wbc{background:#fff;border:1px solid #e4e1d5;border-radius:13px;overflow:hidden;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:box-shadow .15s,border-color .15s}
.wbc:hover{border-color:#cfc8b6;box-shadow:0 6px 18px rgba(58,77,63,.08)}
.wbc.loading{opacity:.6;pointer-events:none}
.wbc-thumb{position:relative;height:150px;background:#faf9f3;background-image:radial-gradient(#e9e6dc 1px,transparent 1px);background-size:16px 16px;border-bottom:1px solid #ece9df;overflow:hidden;display:flex;align-items:center;justify-content:center}
.wbc-foot{display:flex;align-items:center;gap:11px;padding:13px 15px}
.wbc-main{min-width:0;flex:1}
.wbc-t{font-size:13.5px;font-weight:600;color:#2a2a26;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wbc-e{margin-top:2px;font-size:11.5px;color:#a6a698}
.wbc-right{display:flex;align-items:center;gap:2px}
.wbc-avatars{display:inline-flex;padding-left:6px;margin-right:4px}
.wbc-av{width:22px;height:22px;border-radius:50%;border:1.5px solid #fff;color:#fff;font-size:9.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-left:-6px}
.wbc-menu{border:none;background:none;color:#a6a698;cursor:pointer;padding:4px;border-radius:5px;display:inline-flex;opacity:0;transition:opacity .12s}
.wbc:hover .wbc-menu{opacity:1}
.wbc-menu:hover{background:#eceadf;color:#2a2a26}
@media (max-width:1024px){.wbg-grid{grid-template-columns:repeat(2,1fr)}.wbg-dash{grid-template-columns:1fr}.wbg-kpis{grid-template-columns:repeat(2,1fr);gap:16px 0}}
@media (max-width:680px){.wbg-grid{grid-template-columns:1fr}}
`;
