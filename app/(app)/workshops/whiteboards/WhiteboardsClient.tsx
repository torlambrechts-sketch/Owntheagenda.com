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
  fromBoardId?: string;
  objects: WBObject[];
};

// Section tabs match the design's whiteboards home (Dashboard / Boards /
// Templates), mirroring the Workshops home. The Dashboard tab carries the KPI
// strip + "Recently edited" + "Most-used templates"; Boards/Templates are grids.
type Tab = "dashboard" | "boards" | "templates";
type Sort = "recent" | "az" | "za";

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
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  // Dashboard KPIs — all computed from loaded data (no new tables), matching the
  // design's wbDashKpis (Active boards / Templates / Edits this week / Collaborators).
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

  // Dashboard sub-lists.
  const recent = useMemo(() => boards.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), [boards]);
  const topTemplates = useMemo(() => templates.slice(0, 6), [templates]);

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
    startTransition(async () => {
      await createWhiteboard(teamId, templateKey);
    });
  }
  function remove(b: BoardCard) {
    if (!confirm(`Delete “${b.title}”? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteWhiteboard(b.id);
      router.refresh();
    });
  }
  function rename(b: BoardCard) {
    const t = prompt("Rename whiteboard", b.title);
    if (t == null) return;
    startTransition(async () => {
      await renameWhiteboard(b.id, t);
      router.refresh();
    });
  }

  const TABS: { key: Tab; label: string; icon: string; n?: number }[] = [
    { key: "dashboard", label: "Dashboard", icon: "LayoutGrid" },
    { key: "boards", label: "Boards", icon: "Layers", n: boards.length },
    { key: "templates", label: "Templates", icon: "Presentation", n: templates.length },
  ];

  return (
    <div className="wbg">
      {/* New whiteboard — prominent, above the tabs (design) */}
      <button className="wbg-new" disabled={pending && busy === "new"} onClick={() => newBoard()}>
        <Icon name="Plus" size={15} color="#fff" /> New whiteboard
      </button>

      <div className="wbg-bar">
        <div className="wbg-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`seg${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}{t.n != null ? <span className="sn">{t.n}</span> : null}
            </button>
          ))}
        </div>
        {tab !== "dashboard" ? (
          <div className="wbg-controls">
            <label className="wbg-search">
              <Icon name="Search" size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
            </label>
            {tab === "boards" && ownerOptions.length ? (
              <select className="wbg-sel" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="all">All owners</option>
                <option value="me">My boards</option>
                {ownerOptions.filter((o) => o.id !== currentUserId).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            ) : null}
            <select className="wbg-sel" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent">Most recent</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
          </div>
        ) : null}
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
            {/* Recently edited */}
            <div className="wbg-card">
              <div className="wbg-card-h">
                <span className="wbg-card-t">Recently edited</span>
                <button className="wbg-card-link" onClick={() => setTab("boards")}>View all</button>
              </div>
              <div className="wbg-card-b">
                {recent.length === 0 ? (
                  <div className="wbg-empty">No whiteboards yet.</div>
                ) : recent.map((b) => (
                  <button key={b.id} className="wbg-recent" onClick={() => router.push(`/workshops/whiteboards/${b.id}`)}>
                    <span className="wbg-recent-thumb" style={{ borderTopColor: accentHex(b.accent) }}><MiniPreview objects={b.objects} /></span>
                    <span className="wbg-recent-main">
                      <span className="wbg-recent-t">{b.title}</span>
                      <span className="wbg-recent-m">Edited {b.editedLabel || "just now"}{b.ownerName ? ` · ${b.ownerName}` : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* Templates ready to run */}
            <div className="wbg-card">
              <div className="wbg-card-h">
                <span className="wbg-card-t">Most-used templates</span>
                <button className="wbg-card-link" onClick={() => setTab("templates")}>View all</button>
              </div>
              <div className="wbg-card-b">
                {topTemplates.map((t) => (
                  <button key={t.key} className="wbg-toprow" onClick={() => newBoard(t.fromBoardId ? undefined : t.key, t.key)}>
                    <span className="wbg-toprow-l"><span className="wbg-dot" style={{ background: accentHex(t.accent) }} />{t.title}</span>
                    <span className="wbg-toprow-use">Use →</span>
                  </button>
                ))}
                <div className="wbg-tplfoot">
                  <span className="wbg-tplfoot-n">{templates.length}</span>
                  <span>facilitation templates ready to run</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : tab === "boards" ? (
        filteredBoards.length === 0 ? (
          <div className="card empty" style={{ marginTop: 16 }}>
            No whiteboards yet — start one from scratch or pick a template.
          </div>
        ) : (
          <div className="wbg-grid">
            {filteredBoards.map((b) => (
              <article key={b.id} className="wbc" onClick={() => router.push(`/workshops/whiteboards/${b.id}`)}>
                <div className="wbc-thumb" style={{ borderTopColor: accentHex(b.accent) }}>
                  <MiniPreview objects={b.objects} />
                </div>
                <div className="wbc-body">
                  <div className="wbc-row">
                    <h3 className="wbc-title">{b.title}</h3>
                    <button className="wbc-menu" title="Rename" onClick={(e) => { e.stopPropagation(); rename(b); }}>
                      <Icon name="SquarePen" size={14} />
                    </button>
                    <button className="wbc-menu" title="Delete" onClick={(e) => { e.stopPropagation(); remove(b); }}>
                      <Icon name="X" size={14} />
                    </button>
                  </div>
                  <div className="wbc-meta">
                    <span>Edited {b.editedLabel || "just now"}{b.ownerName ? ` · ${b.ownerName}` : ""}</span>
                    <div className="wbc-avatars">
                      {b.collaborators.map((c, i) => (
                        <span key={i} className="wbc-av" title={c} style={{ background: avatarBg(c) }}>{initials(c)}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : (
        <div className="wbg-grid">
          {filteredTemplates.map((t) => (
            <article
              key={t.key}
              className={`wbc wbc-tpl${busy === t.key && pending ? " loading" : ""}`}
              onClick={() => newBoard(t.fromBoardId ? undefined : t.key, t.key)}
            >
              <div className="wbc-thumb" style={{ borderTopColor: accentHex(t.accent) }}>
                <MiniPreview objects={t.objects} />
              </div>
              <div className="wbc-body">
                <h3 className="wbc-title">{t.title}</h3>
                <p className="wbc-desc">{t.desc}</p>
                <span className="wbc-use">Use template →</span>
              </div>
            </article>
          ))}
        </div>
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
.wbg{margin-top:18px}
.wbg-new{display:inline-flex;align-items:center;gap:7px;background:var(--forest);color:#fff;border:none;border-radius:6px;padding:11px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;font-family:inherit;margin-bottom:16px}
.wbg-new:hover{background:var(--forest-2)}
.wbg-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.wbg-tabs{display:inline-flex;background:var(--canvas-2);border-radius:8px;padding:3px}
.wbg-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.wbg-search{display:inline-flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line-2);border-radius:8px;padding:7px 11px;color:var(--muted)}
.wbg-search input{border:none;background:none;outline:none;font:inherit;font-size:13px;width:150px;color:var(--ink)}
.wbg-sel{background:var(--surface);border:1px solid var(--line-2);border-radius:8px;padding:8px 11px;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer}
.wbg-kpis{display:grid;grid-template-columns:repeat(4,1fr);align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05);padding:20px 8px;margin-bottom:16px}
.wbg-kpi{padding:0 22px;border-left:1px solid var(--canvas-2)}
.wbg-kpi:first-child{border-left:none}
.wbg-kpi-n{font-family:var(--font-display);font-size:32px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.wbg-kpi-l{margin-top:9px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.wbg-dash{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.wbg-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05);overflow:hidden}
.wbg-card-h{display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #ece9df}
.wbg-card-t{font-family:var(--font-display);font-size:17px;font-weight:600;color:var(--ink)}
.wbg-card-link{border:none;background:none;font-size:12px;font-weight:600;color:var(--forest);cursor:pointer}
.wbg-card-b{padding:8px 12px 14px}
.wbg-empty{padding:24px;text-align:center;color:var(--faint);font-size:13px}
.wbg-recent{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:none;background:none;cursor:pointer;padding:10px 8px;border-radius:8px;font-family:inherit}
.wbg-recent:hover{background:var(--canvas)}
.wbg-recent-thumb{width:46px;height:34px;border-top:2px solid var(--forest);border-radius:5px;background:#fbfaf6;overflow:hidden;flex:none;display:flex;align-items:center;justify-content:center}
.wbg-recent-main{min-width:0;flex:1}
.wbg-recent-t{display:block;font-size:13.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wbg-recent-m{display:block;font-size:11.5px;color:var(--faint);margin-top:1px}
.wbg-toprow{display:flex;align-items:center;justify-content:space-between;width:100%;border:none;background:none;cursor:pointer;padding:9px 8px;border-radius:8px;font-family:inherit}
.wbg-toprow:hover{background:var(--canvas)}
.wbg-toprow-l{font-size:12.5px;color:#404040;display:inline-flex;align-items:center;gap:8px;min-width:0}
.wbg-dot{width:9px;height:9px;border-radius:50%;flex:none}
.wbg-toprow-use{font-size:11.5px;font-weight:700;color:var(--forest)}
.wbg-tplfoot{margin:10px 8px 4px;padding-top:14px;border-top:1px solid #ece9df;display:flex;align-items:center;gap:10px}
.wbg-tplfoot-n{font-family:var(--font-display);font-size:28px;font-weight:600;color:var(--forest)}
.wbg-tplfoot span:last-child{font-size:12.5px;color:#585850;line-height:1.4}
.wbg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}
.wbc{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;cursor:pointer;transition:box-shadow .15s,transform .15s;display:flex;flex-direction:column}
.wbc:hover{box-shadow:0 10px 26px rgba(0,0,0,.09);transform:translateY(-2px)}
.wbc.loading{opacity:.6;pointer-events:none}
.wbc-thumb{background:#fbfaf6;border-top:3px solid var(--forest);height:150px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.wbc-body{padding:13px 15px 15px}
.wbc-row{display:flex;align-items:center;gap:6px}
.wbc-title{font-family:var(--font-display);font-size:15.5px;font-weight:600;margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wbc-menu{border:none;background:none;color:var(--faint);cursor:pointer;padding:3px;border-radius:5px;display:inline-flex;opacity:0;transition:opacity .12s}
.wbc:hover .wbc-menu{opacity:1}
.wbc-menu:hover{background:var(--canvas-2);color:var(--ink)}
.wbc-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;font-size:11.5px;color:var(--muted)}
.wbc-avatars{display:inline-flex}
.wbc-av{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--surface);color:#fff;font-size:9.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-left:-6px}
.wbc-desc{font-size:12.5px;color:var(--muted);margin:6px 0 10px;line-height:1.45}
.wbc-use{font-size:12px;font-weight:700;color:var(--forest)}
@media (max-width:780px){.wbg-dash{grid-template-columns:1fr}}
`;
