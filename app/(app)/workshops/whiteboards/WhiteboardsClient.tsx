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

type Tab = "boards" | "templates";
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
  const [tab, setTab] = useState<Tab>("boards");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [owner, setOwner] = useState<string>("all");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <div className="wbg">
      <div className="wbg-bar">
        <div className="wbg-tabs">
          <button className={`seg${tab === "boards" ? " on" : ""}`} onClick={() => setTab("boards")}>
            Boards <span className="sn">{boards.length}</span>
          </button>
          <button className={`seg${tab === "templates" ? " on" : ""}`} onClick={() => setTab("templates")}>
            Templates <span className="sn">{templates.length}</span>
          </button>
        </div>
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
          <button className="btn-prim" disabled={pending && busy === "new"} onClick={() => newBoard()}>
            <Icon name="Plus" size={14} color="#fff" /> New whiteboard
          </button>
        </div>
      </div>

      {tab === "boards" ? (
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
                    <span>Edited {b.editedLabel || "just now"}</span>
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
.wbg-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.wbg-tabs{display:inline-flex;background:var(--canvas-2);border-radius:8px;padding:3px}
.wbg-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.wbg-search{display:inline-flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line-2);border-radius:8px;padding:7px 11px;color:var(--muted)}
.wbg-search input{border:none;background:none;outline:none;font:inherit;font-size:13px;width:150px;color:var(--ink)}
.wbg-sel{background:var(--surface);border:1px solid var(--line-2);border-radius:8px;padding:8px 11px;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer}
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
`;
