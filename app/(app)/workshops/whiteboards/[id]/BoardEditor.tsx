"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "../../visuals";
import { initials } from "@/lib/util";
import {
  CLIP_PATHS, EMOJI, NODE_KINDS, NOTE_FILLS, SHAPE_FILLS, SHAPE_KINDS, STROKE_SWATCHES,
  accentHex, connectorD, mapRow, objH, objW, radiusOf, type WBComment, type WBObject,
} from "../wb";
import { renameWhiteboard, saveBoardAsTemplate } from "../actions";
import { exportPNG, exportJSON, exportPPTX, parseImport } from "./exporters";

type Tool =
  | "select" | "pen" | "marker" | "note" | "connector" | "text"
  | "rect" | "roundrect" | "pill" | "ellipse" | "diamond"
  | "triangle" | "hexagon" | "parallelogram" | "star";

const SHAPE_TOOLS: { kind: Tool; label: string }[] = [
  { kind: "rect", label: "Rectangle" },
  { kind: "roundrect", label: "Rounded" },
  { kind: "pill", label: "Pill" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "diamond", label: "Diamond" },
  { kind: "triangle", label: "Triangle" },
  { kind: "hexagon", label: "Hexagon" },
  { kind: "parallelogram", label: "Parallelogram" },
  { kind: "star", label: "Star" },
];

const COLS = "*";

export function BoardEditor({
  boardId, workspaceId, initialTitle, accent, editedLabel, userId, userName, initialObjects,
}: {
  boardId: string;
  workspaceId: string;
  initialTitle: string;
  accent: string;
  editedLabel: string;
  userId: string;
  userName: string;
  initialObjects: WBObject[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const boardRef = useRef<HTMLDivElement>(null);

  const [objects, setObjects] = useState<WBObject[]>(initialObjects);
  const [title, setTitle] = useState(initialTitle);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [penColor, setPenColor] = useState("#33312a");
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [draftPts, setDraftPts] = useState<number[][] | null>(null);
  const [connDraft, setConnDraft] = useState<{ srcId: string; cur: { x: number; y: number } } | null>(null);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [paneTab, setPaneTab] = useState<"props" | "comments">("props");
  const [cursors, setCursors] = useState<Record<string, { x: number; y: number; name: string; color: string; ts: number }>>({});
  const [saveMsg, setSaveMsg] = useState("");

  // refs for pointer handlers
  const objectsRef = useRef(objects); useEffect(() => { objectsRef.current = objects; }, [objects]);
  const toolRef = useRef(tool); useEffect(() => { toolRef.current = tool; }, [tool]);
  const penRef = useRef(penColor); useEffect(() => { penRef.current = penColor; }, [penColor]);
  const viewRef = useRef(view); useEffect(() => { viewRef.current = view; }, [view]);
  const editingRef = useRef<string | null>(null); useEffect(() => { editingRef.current = editingId; }, [editingId]);
  const selRef = useRef<string | null>(null); useEffect(() => { selRef.current = selectedId; }, [selectedId]);
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{ id: string; sx: number; sy: number; ow: number; oh: number } | null>(null);
  const drawRef = useRef<number[][] | null>(null);
  const connRef = useRef<{ srcId: string; cur: { x: number; y: number } } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const clientId = useMemo(() => Math.random().toString(36).slice(2), []);
  const lastBroadcast = useRef(0);
  const myColor = useMemo(() => {
    const palette = ["#3f7d5a", "#a8543b", "#42729e", "#8a6d3b", "#7a5c9e"];
    let h = 0; for (let i = 0; i < userName.length; i++) h = (h * 31 + userName.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }, [userName]);

  const byId = (id: string | null) => (id ? objectsRef.current.find((o) => o.id === id) : undefined);

  // ---- realtime + reload --------------------------------------------------
  const reload = useCallback(async () => {
    const { data } = await supabase.from("whiteboard_object").select(COLS).eq("whiteboard_id", boardId);
    setObjects(((data ?? []) as Record<string, unknown>[]).map(mapRow));
  }, [supabase, boardId]);

  useEffect(() => {
    const ch = supabase
      .channel(`wb:${boardId}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "whiteboard_object", filter: `whiteboard_id=eq.${boardId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            if (id) setObjects((p) => p.filter((o) => o.id !== id));
            return;
          }
          const obj = mapRow(payload.new as Record<string, unknown>);
          setObjects((prev) => {
            const busy = editingRef.current === obj.id || dragRef.current?.id === obj.id || resizeRef.current?.id === obj.id;
            const i = prev.findIndex((o) => o.id === obj.id);
            if (i === -1) return [...prev, obj];
            if (busy) {
              const keep = prev[i];
              const next = prev.slice();
              next[i] = { ...obj, text: keep.text, x: keep.x, y: keep.y, w: keep.w, h: keep.h };
              return next;
            }
            const next = prev.slice(); next[i] = obj; return next;
          });
        })
      .on("broadcast", { event: "cursor" }, ({ payload }: { payload: { id: string; x: number; y: number; name: string; color: string } }) => {
        setCursors((c) => ({ ...c, [payload.id]: { ...payload, ts: Date.now() } }));
      })
      .subscribe();
    chRef.current = ch;
    const expire = setInterval(() => {
      setCursors((c) => {
        const now = Date.now(); let changed = false; const next: typeof c = {};
        for (const k in c) { if (now - c[k].ts < 6000) next[k] = c[k]; else changed = true; }
        return changed ? next : c;
      });
    }, 2500);
    return () => { supabase.removeChannel(ch); chRef.current = null; clearInterval(expire); };
  }, [supabase, boardId]);

  // ---- persistence --------------------------------------------------------
  async function createObj(patch: Record<string, unknown>): Promise<WBObject | null> {
    const { data } = await supabase
      .from("whiteboard_object")
      .insert({ whiteboard_id: boardId, workspace_id: workspaceId, author_id: userId, author_name: userName, ...patch } as never)
      .select(COLS).single();
    if (!data) return null;
    const o = mapRow(data as Record<string, unknown>);
    setObjects((prev) => (prev.some((x) => x.id === o.id) ? prev : [...prev, o]));
    return o;
  }
  async function patchObj(id: string, patch: Record<string, unknown>) {
    setObjects((prev) => prev.map((o) => (o.id === id ? applyPatch(o, patch) : o)));
    await supabase.from("whiteboard_object").update(patch as never).eq("id", id);
  }
  async function delObj(id: string) {
    setObjects((prev) => prev.filter((o) => o.id !== id && o.srcId !== id && o.dstId !== id));
    if (selRef.current === id) setSelectedId(null);
    await supabase.from("whiteboard_object").delete().eq("id", id);
    // dependent connectors cascade-delete client-side; DB rows for them remain
    // harmless (orphan src/dst) but we proactively remove them:
    const orphans = objectsRef.current.filter((o) => o.kind === "connector" && (o.srcId === id || o.dstId === id));
    for (const c of orphans) await supabase.from("whiteboard_object").delete().eq("id", c.id);
  }

  // ---- geometry -----------------------------------------------------------
  const boardPoint = (e: React.PointerEvent | React.MouseEvent) => {
    const r = boardRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.panX) / v.zoom, y: (e.clientY - r.top - v.panY) / v.zoom };
  };
  const nodeAt = (p: { x: number; y: number }, exclude?: string): WBObject | undefined => {
    const nodes = objectsRef.current.filter((o) => NODE_KINDS.has(o.kind)).sort((a, b) => a.z - b.z);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const o = nodes[i];
      if (o.id === exclude) continue;
      if (p.x >= o.x && p.x <= o.x + objW(o) && p.y >= o.y && p.y <= o.y + objH(o)) return o;
    }
    return undefined;
  };

  async function createNodeAt(t: Tool, p: { x: number; y: number }) {
    const w = t === "note" ? 160 : t === "text" ? 180 : 150;
    const h = t === "note" ? 110 : t === "text" ? 48 : 100;
    const x = p.x - w / 2, y = p.y - h / 2;
    if (t === "note") {
      const o = await createObj({ kind: "note", x, y, w, h, text: "", fill: NOTE_FILLS[0], color: "#5b5536" });
      if (o) { setSelectedId(o.id); setEditingId(o.id); }
      return;
    }
    if (t === "text") {
      const o = await createObj({ kind: "text", x, y, text: "", color: "#33312a", font_size: 18 });
      if (o) { setSelectedId(o.id); setEditingId(o.id); }
      return;
    }
    const o = await createObj({ kind: t, x, y, w, h, text: "", fill: SHAPE_FILLS[0], stroke: "#cfcdc4", color: "#33312a" });
    if (o) setSelectedId(o.id);
  }

  // ---- pointer interactions ----------------------------------------------
  function onPointerDown(e: React.PointerEvent) {
    const t = toolRef.current;
    const el = e.target as HTMLElement;
    if (el.closest("textarea") || el.closest(".wb-pane") || el.closest(".wb-tool") || el.closest(".wb-handle")) {
      if (el.closest(".wb-handle")) {
        const id = el.getAttribute("data-id")!;
        const o = byId(id);
        if (o) { resizeRef.current = { id, sx: e.clientX, sy: e.clientY, ow: objW(o), oh: objH(o) }; boardRef.current!.setPointerCapture(e.pointerId); }
        return;
      }
      return;
    }
    const p = boardPoint(e);

    if (e.button === 1 || e.altKey) {
      panRef.current = { sx: e.clientX, sy: e.clientY, px: viewRef.current.panX, py: viewRef.current.panY };
      boardRef.current!.setPointerCapture(e.pointerId); return;
    }

    if (t === "pen" || t === "marker") {
      drawRef.current = [[p.x, p.y]]; setDraftPts([[p.x, p.y]]);
      boardRef.current!.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }

    if (t === "connector") {
      const hit = nodeAt(p);
      if (hit) { connRef.current = { srcId: hit.id, cur: p }; setConnDraft({ srcId: hit.id, cur: p }); boardRef.current!.setPointerCapture(e.pointerId); }
      return;
    }

    if (t === "select") {
      const cidEl = el.closest("[data-id]") as HTMLElement | null;
      if (cidEl) {
        const id = cidEl.getAttribute("data-id")!;
        const o = byId(id);
        setSelectedId(id);
        if (o && o.kind !== "connector" && o.kind !== "pen" && o.kind !== "marker") {
          dragRef.current = { id, sx: p.x, sy: p.y, ox: o.x, oy: o.y, moved: false };
          boardRef.current!.setPointerCapture(e.pointerId);
        }
        return;
      }
      // empty space → pan
      setSelectedId(null);
      panRef.current = { sx: e.clientX, sy: e.clientY, px: viewRef.current.panX, py: viewRef.current.panY };
      boardRef.current!.setPointerCapture(e.pointerId);
      return;
    }

    // creation tools
    createNodeAt(t, p);
    setTool("select");
  }

  function onPointerMove(e: React.PointerEvent) {
    if (panRef.current) {
      const pr = panRef.current;
      setView((v) => ({ ...v, panX: pr.px + (e.clientX - pr.sx), panY: pr.py + (e.clientY - pr.sy) }));
      return;
    }
    const p = boardPoint(e);
    const now = Date.now();
    if (chRef.current && now - lastBroadcast.current > 50) {
      lastBroadcast.current = now;
      chRef.current.send({ type: "broadcast", event: "cursor", payload: { id: clientId, x: p.x, y: p.y, name: userName.split(" ")[0], color: myColor } });
    }
    if (drawRef.current) { drawRef.current.push([p.x, p.y]); setDraftPts(drawRef.current.slice()); return; }
    if (connRef.current) { connRef.current.cur = p; setConnDraft({ ...connRef.current }); return; }
    if (dragRef.current) {
      const d = dragRef.current; d.moved = true;
      let nx = d.ox + (p.x - d.sx), ny = d.oy + (p.y - d.sy);
      if (!e.shiftKey) { nx = Math.round(nx / 8) * 8; ny = Math.round(ny / 8) * 8; }
      setObjects((prev) => prev.map((o) => (o.id === d.id ? { ...o, x: nx, y: ny } : o)));
      return;
    }
    if (resizeRef.current) {
      const r = resizeRef.current;
      const nw = Math.max(40, r.ow + (e.clientX - r.sx) / viewRef.current.zoom);
      const nh = Math.max(32, r.oh + (e.clientY - r.sy) / viewRef.current.zoom);
      setObjects((prev) => prev.map((o) => (o.id === r.id ? { ...o, w: nw, h: nh } : o)));
    }
  }

  async function onPointerUp(e: React.PointerEvent) {
    const p = boardPoint(e);
    if (panRef.current) { panRef.current = null; return; }
    if (drawRef.current) {
      const pts = drawRef.current; drawRef.current = null; setDraftPts(null);
      if (pts.length > 1) {
        const marker = toolRef.current === "marker";
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
        await createObj({ kind: marker ? "marker" : "pen", points: pts, color: penRef.current, width: marker ? 14 : 3, variant: marker ? "marker" : "pen", x: Math.min(...xs), y: Math.min(...ys) });
      }
      return;
    }
    if (connRef.current) {
      const c = connRef.current; connRef.current = null; setConnDraft(null);
      const tgt = nodeAt(p, c.srcId);
      if (tgt) await createObj({ kind: "connector", src_id: c.srcId, dst_id: tgt.id, line_style: "curved", color: "#737373", x: 0, y: 0 });
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current; dragRef.current = null;
      if (d.moved) { const o = byId(d.id); if (o) await supabase.from("whiteboard_object").update({ x: o.x, y: o.y } as never).eq("id", d.id); }
      return;
    }
    if (resizeRef.current) {
      const id = resizeRef.current.id; resizeRef.current = null;
      const o = byId(id); if (o) await supabase.from("whiteboard_object").update({ w: o.w, h: o.h } as never).eq("id", id);
    }
  }

  // ---- text editing -------------------------------------------------------
  function onText(id: string, text: string) { setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o))); }
  async function commitText(id: string) {
    setEditingId((cur) => (cur === id ? null : cur));
    const o = objectsRef.current.find((x) => x.id === id);
    await supabase.from("whiteboard_object").update({ text: o?.text ?? "" } as never).eq("id", id);
  }

  // ---- keyboard -----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selRef.current) {
        e.preventDefault(); delObj(selRef.current);
      }
      if (e.key === "Escape") { setSelectedId(null); setTool("select"); setShapesOpen(false); setExportOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- properties / comments mutations -----------------------------------
  function setFill(hex: string) { const o = byId(selectedId); if (o) patchObj(o.id, { fill: hex }); }
  function setColor(hex: string) { const o = byId(selectedId); if (o) patchObj(o.id, { color: hex }); }
  function setFontSize(n: number) { const o = byId(selectedId); if (o) patchObj(o.id, { font_size: n }); }
  function setLineStyle(ls: string) { const o = byId(selectedId); if (o) patchObj(o.id, { line_style: ls }); }
  function setSize(w: number, h: number) { const o = byId(selectedId); if (o) patchObj(o.id, { w, h }); }

  async function addComment(text: string) {
    const o = byId(selectedId); if (!o || !text.trim()) return;
    const c: WBComment = { id: Math.random().toString(36).slice(2), author: userName, text: text.trim(), ts: Date.now() };
    const comments = [...o.comments, c];
    await patchObj(o.id, { comments });
  }
  async function toggleReaction(emoji: string) {
    const o = byId(selectedId); if (!o) return;
    const reactions = { ...o.reactions, [emoji]: (o.reactions[emoji] ?? 0) + 1 };
    await patchObj(o.id, { reactions });
  }

  // ---- title / template / export -----------------------------------------
  async function commitTitle() {
    if (title.trim() === initialTitle) return;
    await renameWhiteboard(boardId, title);
  }
  async function onSaveTemplate() {
    setSaveMsg("Saving template…");
    const res = await saveBoardAsTemplate(boardId);
    setSaveMsg(res.error ? res.error : "Saved as template ✓");
    setTimeout(() => setSaveMsg(""), 2500);
  }
  function doExport(kind: "png" | "json" | "pptx") {
    setExportOpen(false);
    if (kind === "json") return exportJSON(title, objectsRef.current);
    if (kind === "png") return exportPNG(title, objectsRef.current);
    if (kind === "pptx") return exportPPTX(title, objectsRef.current);
  }
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const incoming = parseImport(String(reader.result));
      if (!incoming) { setSaveMsg("Invalid JSON"); setTimeout(() => setSaveMsg(""), 2000); return; }
      // replace objects: delete current, insert incoming (re-resolving connectors)
      for (const o of objectsRef.current) await supabase.from("whiteboard_object").delete().eq("id", o.id);
      const idMap = new Map<string, string>();
      const nodes = incoming.filter((o) => o.kind !== "connector");
      const conns = incoming.filter((o) => o.kind === "connector");
      for (const o of nodes) {
        const created = await createObj({ kind: o.kind, text: o.text, fill: o.fill, stroke: o.stroke, color: o.color, x: o.x, y: o.y, w: o.w, h: o.h, font_size: o.fontSize, points: o.points, width: o.width, variant: o.variant });
        if (created) idMap.set(o.id, created.id);
      }
      for (const o of conns) {
        const src = o.srcId ? idMap.get(o.srcId) : null;
        const dst = o.dstId ? idMap.get(o.dstId) : null;
        if (src && dst) await createObj({ kind: "connector", src_id: src, dst_id: dst, line_style: o.lineStyle ?? "curved", color: o.color, x: 0, y: 0 });
      }
      await reload();
      setSaveMsg("Imported ✓"); setTimeout(() => setSaveMsg(""), 2000);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function zoomBy(f: number) {
    setView((v) => {
      const z = Math.min(2.5, Math.max(0.3, v.zoom * f));
      const r = boardRef.current!.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2, k = z / v.zoom;
      return { zoom: z, panX: cx - (cx - v.panX) * k, panY: cy - (cy - v.panY) * k };
    });
  }

  const sel = byId(selectedId);
  const nodes = objects.filter((o) => NODE_KINDS.has(o.kind)).sort((a, b) => a.z - b.z);
  const conns = objects.filter((o) => o.kind === "connector");
  const strokes = objects.filter((o) => o.kind === "pen" || o.kind === "marker");
  const cursor = tool === "select" ? "default" : tool === "connector" ? "crosshair" : "crosshair";

  return (
    <div className="wbe">
      {/* top bar */}
      <header className="wbe-top">
        <button className="wbe-icbtn" title="Back to gallery" onClick={() => router.push("/workshops/whiteboards")}>
          <Icon name="ArrowLeft" size={16} />
        </button>
        <input className="wbe-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} />
        <span className="wbe-edited">Edited {editedLabel || "just now"}{saveMsg ? ` · ${saveMsg}` : ""}</span>
        <div className="wbe-presence">
          {Object.values(cursors).map((c, i) => (
            <span key={i} className="wbe-av" title={c.name} style={{ background: c.color }}>{initials(c.name)}</span>
          ))}
          <span className="wbe-av" title={userName} style={{ background: myColor }}>{initials(userName)}</span>
        </div>
        <label className="wbe-btn">
          <Icon name="ArrowRight" size={14} /> Import
          <input type="file" accept="application/json,.json" hidden onChange={onImportFile} />
        </label>
        <div className="wbe-menu-wrap">
          <button className="wbe-btn" onClick={() => setExportOpen((v) => !v)}><Icon name="Layers" size={14} /> Export</button>
          {exportOpen ? (
            <div className="wbe-pop">
              <button onClick={() => doExport("png")}>Image (PNG)</button>
              <button onClick={() => doExport("pptx")}>PowerPoint (.pptx)</button>
              <button onClick={() => doExport("json")}>JSON</button>
            </div>
          ) : null}
        </div>
        <button className="wbe-btn" onClick={onSaveTemplate}><Icon name="Plus" size={14} /> Save as template</button>
        <button className="btn-prim" onClick={commitTitle}><Icon name="Check" size={14} color="#fff" /> Save</button>
      </header>

      {/* canvas + toolbar */}
      <div className="wbe-stage">
        <div className="wbe-rail wb-tool" onPointerDown={(e) => e.stopPropagation()}>
          <ToolBtn t="select" tool={tool} setTool={setTool} title="Select"><path d="M4 3l7 16 2-7 7-2z" /></ToolBtn>
          <ToolBtn t="pen" tool={tool} setTool={setTool} title="Pen"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></ToolBtn>
          <ToolBtn t="marker" tool={tool} setTool={setTool} title="Marker"><><path d="M9 14l-3 6 6-3" /><path d="M9 14l8-8 4 4-8 8z" /></></ToolBtn>
          <ToolBtn t="note" tool={tool} setTool={setTool} title="Sticky note"><><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M14 20v-5h5" /></></ToolBtn>
          <div className="wbe-railsub">
            <button className={`wbe-tbtn${SHAPE_KINDS.has(tool) ? " on" : ""}`} title="Shapes" onClick={() => setShapesOpen((v) => !v)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="6" width="16" height="12" rx="1.5" /></svg>
            </button>
            {shapesOpen ? (
              <div className="wbe-shapes">
                {SHAPE_TOOLS.map((s) => (
                  <button key={s.kind} title={s.label} className={tool === s.kind ? "on" : ""} onClick={() => { setTool(s.kind); setShapesOpen(false); }}>
                    <ShapeGlyph kind={s.kind} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <ToolBtn t="connector" tool={tool} setTool={setTool} title="Connector"><><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 7c6 1 5 9 10 10" /></></ToolBtn>
          <ToolBtn t="text" tool={tool} setTool={setTool} title="Text"><><path d="M5 5h14" /><path d="M12 5v14" /></></ToolBtn>
          {tool === "pen" || tool === "marker" ? (
            <div className="wbe-swatches">
              {STROKE_SWATCHES.map((hex) => (
                <button key={hex} className={`wbe-sw${penColor === hex ? " on" : ""}`} style={{ background: hex }} onClick={() => setPenColor(hex)} />
              ))}
            </div>
          ) : null}
        </div>

        <div
          className="wbe-board"
          ref={boardRef}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="wbe-content" style={{ transform: `translate(${view.panX}px,${view.panY}px) scale(${view.zoom})`, transformOrigin: "0 0" }}>
            <svg className="wbe-svg" width="4000" height="4000">
              <defs>
                <marker id="wb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                </marker>
              </defs>
              {conns.map((c) => {
                const s = byId(c.srcId); const d = byId(c.dstId);
                if (!s || !d) return null;
                const { d: path } = connectorD(s, d, c.lineStyle ?? "curved");
                const on = selectedId === c.id;
                return <path key={c.id} data-id={c.id} d={path} fill="none" stroke={c.color ?? "#737373"} strokeWidth={(on ? 3 : 2)} markerEnd="url(#wb-arrow)" style={{ pointerEvents: "stroke", cursor: "pointer" }} onPointerDown={(e) => { e.stopPropagation(); setSelectedId(c.id); }} />;
              })}
              {strokes.map((s) => (
                <polyline key={s.id} data-id={s.id} points={(s.points ?? []).map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={s.color ?? "#33312a"} strokeWidth={(s.width ?? 3) * (selectedId === s.id ? 1.4 : 1)} opacity={s.variant === "marker" ? 0.4 : 1} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "stroke", cursor: "pointer" }} onPointerDown={(e) => { e.stopPropagation(); setSelectedId(s.id); }} />
              ))}
              {draftPts && draftPts.length > 1 ? (
                <polyline points={draftPts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={penColor} strokeWidth={tool === "marker" ? 14 : 3} opacity={tool === "marker" ? 0.4 : 1} strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
              {connDraft ? (() => {
                const s = byId(connDraft.srcId); if (!s) return null;
                const cx = s.x + objW(s) / 2, cy = s.y + objH(s) / 2;
                return <path d={`M ${cx} ${cy} L ${connDraft.cur.x} ${connDraft.cur.y}`} fill="none" stroke="#3a4d3f" strokeWidth={2} strokeDasharray="5 4" />;
              })() : null}
            </svg>

            {nodes.map((o) => (
              <NodeView key={o.id} o={o} selected={selectedId === o.id} editing={editingId === o.id}
                onText={onText} commitText={commitText} startEdit={(id) => setEditingId(id)} />
            ))}

            {Object.entries(cursors).map(([id, c]) => (
              <div key={id} className="wbe-cursor" style={{ left: c.x, top: c.y }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={c.color} stroke="#fff" strokeWidth="1.4"><path d="M4 3l7 16 2-7 7-2z" /></svg>
                <span style={{ background: c.color }}>{c.name}</span>
              </div>
            ))}
          </div>

          <div className="wbe-zoom" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => zoomBy(1 / 1.2)}>−</button>
            <button onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}>{Math.round(view.zoom * 100)}%</button>
            <button onClick={() => zoomBy(1.2)}>+</button>
          </div>
        </div>

        {/* properties / comments pane */}
        {sel ? (
          <aside className="wbe-pane wb-pane" onPointerDown={(e) => e.stopPropagation()}>
            <div className="wbe-panetabs">
              <button className={paneTab === "props" ? "on" : ""} onClick={() => setPaneTab("props")}>Properties</button>
              <button className={paneTab === "comments" ? "on" : ""} onClick={() => setPaneTab("comments")}>
                Comments{sel.comments.length ? ` (${sel.comments.length})` : ""}
              </button>
            </div>
            {paneTab === "props" ? (
              <PropsPane sel={sel} setFill={setFill} setColor={setColor} setFontSize={setFontSize} setLineStyle={setLineStyle} setSize={setSize} onDelete={() => delObj(sel.id)} />
            ) : (
              <CommentsPane sel={sel} addComment={addComment} toggleReaction={toggleReaction} />
            )}
          </aside>
        ) : null}
      </div>

      <style>{styles}</style>
    </div>
  );
}

// apply a snake_case patch onto a WBObject for optimistic local state.
function applyPatch(o: WBObject, patch: Record<string, unknown>): WBObject {
  const n = { ...o };
  if ("fill" in patch) n.fill = patch.fill as string | null;
  if ("stroke" in patch) n.stroke = patch.stroke as string | null;
  if ("color" in patch) n.color = patch.color as string | null;
  if ("text" in patch) n.text = patch.text as string;
  if ("font_size" in patch) n.fontSize = patch.font_size as number | null;
  if ("w" in patch) n.w = patch.w as number | null;
  if ("h" in patch) n.h = patch.h as number | null;
  if ("x" in patch) n.x = patch.x as number;
  if ("y" in patch) n.y = patch.y as number;
  if ("line_style" in patch) n.lineStyle = patch.line_style as string | null;
  if ("comments" in patch) n.comments = patch.comments as WBComment[];
  if ("reactions" in patch) n.reactions = patch.reactions as Record<string, number>;
  return n;
}

function ToolBtn({ t, tool, setTool, title, children }: { t: Tool; tool: Tool; setTool: (t: Tool) => void; title: string; children: React.ReactNode }) {
  return (
    <button className={`wbe-tbtn${tool === t ? " on" : ""}`} title={title} aria-pressed={tool === t} onClick={() => setTool(t)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

function ShapeGlyph({ kind }: { kind: string }) {
  const map: Record<string, React.ReactNode> = {
    rect: <rect x="4" y="7" width="16" height="10" rx="1" />,
    roundrect: <rect x="4" y="7" width="16" height="10" rx="4" />,
    pill: <rect x="3" y="8" width="18" height="8" rx="4" />,
    ellipse: <ellipse cx="12" cy="12" rx="9" ry="6" />,
    diamond: <path d="M12 3l9 9-9 9-9-9z" />,
    triangle: <path d="M12 4l8 16H4z" />,
    hexagon: <path d="M7 4h10l4 8-4 8H7l-4-8z" />,
    parallelogram: <path d="M7 5h13l-3 14H4z" />,
    star: <path d="M12 3l2.5 6 6.5.5-5 4 1.6 6.3L12 16l-5.6 3.8L8 13.5l-5-4 6.5-.5z" />,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">{map[kind]}</svg>;
}

function NodeView({ o, selected, editing, onText, commitText, startEdit }: {
  o: WBObject; selected: boolean; editing: boolean;
  onText: (id: string, t: string) => void; commitText: (id: string) => void; startEdit: (id: string) => void;
}) {
  const w = objW(o), h = objH(o);
  if (o.kind === "text") {
    return (
      <div data-id={o.id} className={`wbe-node wbe-text${selected ? " sel" : ""}`} style={{ left: o.x, top: o.y, width: w, minHeight: h }}>
        {editing ? (
          <textarea autoFocus value={o.text} placeholder="Text…" style={{ fontSize: o.fontSize ?? 18, color: o.color ?? "#333" }} onChange={(e) => onText(o.id, e.target.value)} onBlur={() => commitText(o.id)} />
        ) : (
          <div className="wbe-txt" style={{ fontSize: o.fontSize ?? 18, color: o.color ?? "#333" }} onDoubleClick={(e) => { e.stopPropagation(); startEdit(o.id); }}>
            {o.text || <span className="ph">Text</span>}
          </div>
        )}
        {selected ? <span className="wb-handle" data-id={o.id} /> : null}
      </div>
    );
  }
  if (o.kind === "note") {
    return (
      <div data-id={o.id} className={`wbe-node wbe-note${selected ? " sel" : ""}`} style={{ left: o.x, top: o.y, width: w, minHeight: h, background: o.fill ?? "#fef9c3" }}>
        {editing ? (
          <textarea autoFocus value={o.text} placeholder="Note…" style={{ color: o.color ?? "#5b5536" }} onChange={(e) => onText(o.id, e.target.value)} onBlur={() => commitText(o.id)} />
        ) : (
          <div className="wbe-txt note" style={{ color: o.color ?? "#5b5536" }} onDoubleClick={(e) => { e.stopPropagation(); startEdit(o.id); }}>
            {o.text || <span className="ph">Double-click</span>}
          </div>
        )}
        {o.comments.length ? <span className="wbe-cbadge">{o.comments.length}</span> : null}
        {selected ? <span className="wb-handle" data-id={o.id} /> : null}
      </div>
    );
  }
  const clip = CLIP_PATHS[o.kind];
  const style: React.CSSProperties = {
    left: o.x, top: o.y, width: w, height: h,
    background: o.fill ?? "#fff",
    border: clip ? "none" : `1.5px solid ${o.stroke ?? "#cfcdc4"}`,
    borderRadius: radiusOf(o.kind, h),
    clipPath: clip,
  };
  return (
    <div data-id={o.id} className={`wbe-node wbe-shape${selected ? " sel" : ""}`} style={style}>
      {editing ? (
        <textarea autoFocus value={o.text} placeholder="Label…" style={{ color: o.color ?? "#33312a" }} onChange={(e) => onText(o.id, e.target.value)} onBlur={() => commitText(o.id)} />
      ) : (
        <div className="wbe-txt" style={{ color: o.color ?? "#33312a" }} onDoubleClick={(e) => { e.stopPropagation(); startEdit(o.id); }}>{o.text}</div>
      )}
      {o.comments.length ? <span className="wbe-cbadge">{o.comments.length}</span> : null}
      {selected && !clip ? <span className="wb-handle" data-id={o.id} /> : null}
    </div>
  );
}

function PropsPane({ sel, setFill, setColor, setFontSize, setLineStyle, setSize, onDelete }: {
  sel: WBObject;
  setFill: (h: string) => void; setColor: (h: string) => void; setFontSize: (n: number) => void;
  setLineStyle: (s: string) => void; setSize: (w: number, h: number) => void; onDelete: () => void;
}) {
  const isConnector = sel.kind === "connector";
  const isStroke = sel.kind === "pen" || sel.kind === "marker";
  const isText = sel.kind === "text";
  const isNote = sel.kind === "note";
  return (
    <div className="wbe-props">
      <div className="wbe-prop-head">{sel.kind}</div>
      {isConnector ? (
        <div className="wbe-prop">
          <label>Line</label>
          <div className="wbe-seg">
            {["curved", "straight", "elbow", "bent"].map((ls) => (
              <button key={ls} className={(sel.lineStyle ?? "curved") === ls ? "on" : ""} onClick={() => setLineStyle(ls)}>{ls}</button>
            ))}
          </div>
          <label>Colour</label>
          <Swatches values={STROKE_SWATCHES} active={sel.color} onPick={setColor} />
        </div>
      ) : isStroke ? (
        <div className="wbe-prop">
          <label>Colour</label>
          <Swatches values={STROKE_SWATCHES} active={sel.color} onPick={setColor} />
        </div>
      ) : (
        <div className="wbe-prop">
          {(isNote || (!isText)) ? (
            <>
              <label>Fill</label>
              <Swatches values={isNote ? NOTE_FILLS : SHAPE_FILLS} active={sel.fill} onPick={setFill} />
            </>
          ) : null}
          <label>Text colour</label>
          <Swatches values={["#33312a", "#5b5536", "#1a3d32", "#b8584a", "#1d4ed8", "#9d2463"]} active={sel.color} onPick={setColor} />
          {isText ? (
            <>
              <label>Font size</label>
              <input type="range" min={12} max={48} value={sel.fontSize ?? 18} onChange={(e) => setFontSize(Number(e.target.value))} />
            </>
          ) : null}
          {!isText ? (
            <>
              <label>Size</label>
              <div className="wbe-size">
                <input type="number" value={Math.round(objW(sel))} onChange={(e) => setSize(Number(e.target.value), objH(sel))} />
                <span>×</span>
                <input type="number" value={Math.round(objH(sel))} onChange={(e) => setSize(objW(sel), Number(e.target.value))} />
              </div>
            </>
          ) : null}
        </div>
      )}
      <button className="wbe-del" onClick={onDelete}>Delete element</button>
    </div>
  );
}

function Swatches({ values, active, onPick }: { values: string[]; active: string | null; onPick: (h: string) => void }) {
  return (
    <div className="wbe-swrow">
      {values.map((hex) => (
        <button key={hex} className={`wbe-sw${active === hex ? " on" : ""}`} style={{ background: hex, borderColor: hex === "#ffffff" ? "var(--line-2)" : "transparent" }} onClick={() => onPick(hex)} />
      ))}
    </div>
  );
}

function CommentsPane({ sel, addComment, toggleReaction }: {
  sel: WBObject; addComment: (t: string) => void; toggleReaction: (e: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="wbe-comments">
      <div className="wbe-reactions">
        {EMOJI.map((e) => (
          <button key={e} onClick={() => toggleReaction(e)}>
            {e}{sel.reactions[e] ? <span>{sel.reactions[e]}</span> : null}
          </button>
        ))}
      </div>
      <div className="wbe-clist">
        {sel.comments.length === 0 ? <p className="wbe-empty">No comments yet.</p> : null}
        {sel.comments.map((c) => (
          <div key={c.id} className="wbe-citem">
            <strong>{c.author}</strong>
            <span>{c.text}</span>
          </div>
        ))}
      </div>
      <form className="wbe-cform" onSubmit={(e) => { e.preventDefault(); addComment(text); setText(""); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" />
        <button type="submit"><Icon name="ArrowRight" size={14} color="#fff" /></button>
      </form>
    </div>
  );
}

const styles = `
.wbe{position:fixed;inset:0;display:flex;flex-direction:column;background:var(--canvas);z-index:60}
.wbe-top{display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--line);flex-shrink:0}
.wbe-icbtn{border:1px solid var(--line-2);background:var(--surface);border-radius:8px;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink)}
.wbe-title{font-family:var(--font-display);font-size:17px;font-weight:600;border:1px solid transparent;background:none;outline:none;padding:4px 8px;border-radius:6px;min-width:120px;color:var(--ink)}
.wbe-title:hover,.wbe-title:focus{border-color:var(--line-2)}
.wbe-edited{font-size:11.5px;color:var(--muted);white-space:nowrap}
.wbe-presence{display:inline-flex;margin-left:auto;margin-right:6px}
.wbe-av{width:26px;height:26px;border-radius:50%;border:2px solid var(--surface);color:#fff;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-left:-7px}
.wbe-btn{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line-2);border-radius:7px;padding:7px 11px;font-size:12px;font-weight:600;cursor:pointer;color:var(--ink)}
.wbe-btn:hover{background:var(--canvas-2)}
.wbe-menu-wrap{position:relative}
.wbe-pop{position:absolute;top:calc(100% + 6px);right:0;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.14);padding:5px;z-index:30;min-width:170px}
.wbe-pop button{display:block;width:100%;text-align:left;border:none;background:none;padding:8px 12px;font-size:12.5px;border-radius:6px;cursor:pointer;color:var(--ink)}
.wbe-pop button:hover{background:var(--canvas-2)}
.wbe-stage{flex:1;display:flex;min-height:0;position:relative}
.wbe-rail{position:absolute;left:16px;top:16px;z-index:20;display:flex;flex-direction:column;gap:3px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:0 6px 20px rgba(0,0,0,.10)}
.wbe-tbtn{width:38px;height:38px;border:none;background:none;border-radius:9px;color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.wbe-tbtn:hover{background:var(--canvas-2)}
.wbe-tbtn.on{background:var(--forest);color:#fff}
.wbe-railsub{position:relative}
.wbe-shapes{position:absolute;left:calc(100% + 8px);top:0;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:6px;box-shadow:0 6px 20px rgba(0,0,0,.12);z-index:30}
.wbe-shapes button{width:36px;height:36px;border:none;background:none;border-radius:8px;cursor:pointer;color:var(--ink);display:inline-flex;align-items:center;justify-content:center}
.wbe-shapes button:hover{background:var(--canvas-2)}
.wbe-shapes button.on{background:var(--forest);color:#fff}
.wbe-swatches{display:flex;flex-direction:column;gap:4px;margin-top:6px;align-items:center}
.wbe-sw{width:20px;height:20px;border-radius:50%;border:1.5px solid transparent;cursor:pointer}
.wbe-sw.on{outline:2px solid var(--forest);outline-offset:1px}
.wbe-board{flex:1;position:relative;overflow:hidden;background-color:var(--surface);background-image:radial-gradient(var(--line) 1.1px,transparent 1.1px);background-size:22px 22px;touch-action:none}
.wbe-content{position:absolute;inset:0;transform-origin:0 0}
.wbe-svg{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.wbe-svg path,.wbe-svg polyline{pointer-events:stroke}
.wbe-node{position:absolute;box-sizing:border-box;cursor:grab;user-select:none}
.wbe-node.sel{outline:2px solid var(--forest);outline-offset:2px;z-index:5}
.wbe-note{border-radius:4px;box-shadow:0 6px 16px rgba(0,0,0,.13);padding:12px;display:flex}
.wbe-shape{display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.07)}
.wbe-text{padding:4px}
.wbe-node textarea{width:100%;height:100%;min-height:40px;border:none;background:none;resize:none;font:inherit;outline:none;cursor:text;text-align:center}
.wbe-note textarea{text-align:left;font-size:13px;line-height:1.4}
.wbe-text textarea{text-align:left;font-weight:600}
.wbe-txt{width:100%;font-size:13px;line-height:1.4;white-space:pre-wrap;word-break:break-word;text-align:center}
.wbe-txt.note{text-align:left}
.wbe-text .wbe-txt{text-align:left;font-weight:600}
.wbe-txt .ph{color:rgba(0,0,0,.28)}
.wbe-cbadge{position:absolute;top:-7px;right:-7px;background:var(--forest);color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px}
.wb-handle{position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;background:var(--surface);border:2px solid var(--forest);border-radius:3px;cursor:nwse-resize}
.wbe-cursor{position:absolute;pointer-events:none;z-index:40;transform:translate(-2px,-2px)}
.wbe-cursor span{display:inline-block;margin-left:6px;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px}
.wbe-zoom{position:absolute;right:16px;bottom:16px;display:flex;background:var(--surface);border:1px solid var(--line);border-radius:9px;box-shadow:0 4px 14px rgba(0,0,0,.1);overflow:hidden;z-index:20}
.wbe-zoom button{border:none;background:none;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;color:var(--ink)}
.wbe-zoom button+button{border-left:1px solid var(--line)}
.wbe-pane{width:264px;flex-shrink:0;background:var(--surface);border-left:1px solid var(--line);display:flex;flex-direction:column;overflow:hidden}
.wbe-panetabs{display:flex;border-bottom:1px solid var(--line)}
.wbe-panetabs button{flex:1;border:none;background:none;padding:11px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer}
.wbe-panetabs button.on{color:var(--ink);box-shadow:inset 0 -2px 0 var(--forest)}
.wbe-props{padding:14px;overflow-y:auto}
.wbe-prop-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--faint);margin-bottom:12px}
.wbe-prop label{display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin:12px 0 6px}
.wbe-prop label:first-child{margin-top:0}
.wbe-swrow{display:flex;flex-wrap:wrap;gap:7px}
.wbe-swrow .wbe-sw{width:24px;height:24px;border-radius:6px}
.wbe-seg{display:inline-flex;flex-wrap:wrap;gap:4px}
.wbe-seg button{border:1px solid var(--line-2);background:var(--surface);border-radius:6px;padding:5px 9px;font-size:11px;cursor:pointer;text-transform:capitalize;color:var(--ink)}
.wbe-seg button.on{background:var(--forest);color:#fff;border-color:var(--forest)}
.wbe-size{display:flex;align-items:center;gap:6px}
.wbe-size input{width:64px;border:1px solid var(--line-2);border-radius:6px;padding:6px 8px;font-size:12px}
.wbe-prop input[type=range]{width:100%}
.wbe-del{margin-top:18px;width:100%;border:1px solid #e8cfca;background:var(--surface);color:var(--rust);border-radius:7px;padding:8px;font-size:12px;font-weight:600;cursor:pointer}
.wbe-comments{display:flex;flex-direction:column;flex:1;min-height:0}
.wbe-reactions{display:flex;flex-wrap:wrap;gap:6px;padding:12px;border-bottom:1px solid var(--line)}
.wbe-reactions button{border:1px solid var(--line-2);background:var(--surface);border-radius:16px;padding:4px 8px;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.wbe-reactions button span{font-size:11px;font-weight:700;color:var(--muted)}
.wbe-clist{flex:1;overflow-y:auto;padding:12px}
.wbe-empty{font-size:12px;color:var(--faint);text-align:center;margin-top:14px}
.wbe-citem{margin-bottom:12px;font-size:12.5px;line-height:1.45}
.wbe-citem strong{display:block;font-size:11.5px;color:var(--ink)}
.wbe-citem span{color:var(--muted)}
.wbe-cform{display:flex;gap:6px;padding:12px;border-top:1px solid var(--line)}
.wbe-cform input{flex:1;border:1px solid var(--line-2);border-radius:7px;padding:8px 10px;font-size:12.5px;outline:none}
.wbe-cform button{border:none;background:var(--forest);border-radius:7px;width:34px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
`;
