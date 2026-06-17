"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FILLS,
  STROKES,
  fillHex,
  strokeHex,
  SHAPE_KINDS,
  SIDES,
  rectOf,
  anchorPt,
  nearestSide,
  connectorPath,
  clamp01,
  type Pt,
  type Side,
} from "@/lib/canvas";

// ---------------------------------------------------------------------------
// A lightweight multiplayer diagramming board: sticky notes, shapes
// (rect / ellipse / diamond / text), freehand pen + marker, and connectors
// that link shapes edge-to-edge with selectable routing (straight / curved /
// rounded). Geometry is normalized [0,1] so it renders across screen sizes;
// connectors + drawings render in an SVG layer sized to the board in pixels.
// Writes go straight to canvas_object under RLS (can_read_session); all peers
// reconcile via Supabase Realtime.
// ---------------------------------------------------------------------------

type Obj = {
  id: string;
  blockOrd: number;
  kind: string; // sticky | rect | ellipse | diamond | text | connector | draw
  text: string;
  color: string;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  points: number[][] | null;
  srcId: string | null;
  dstId: string | null;
  srcAnchor: Side | null;
  dstAnchor: Side | null;
  lineStyle: string | null;
  stroke: string | null;
  fill: string | null;
  strokeW: number | null;
  variant: string | null;
  authorName: string | null;
};

type Tool = "select" | "sticky" | "rect" | "ellipse" | "diamond" | "text" | "connector" | "pen" | "marker";

const COLS =
  "id, block_ord, kind, text, color, x, y, w, h, points, src_id, dst_id, src_anchor, dst_anchor, line_style, stroke, fill, stroke_w, variant, author_id, author_name";

function mapRow(r: any): Obj {
  return {
    id: r.id,
    blockOrd: r.block_ord,
    kind: r.kind ?? "sticky",
    text: r.text ?? "",
    color: r.color ?? "lemon",
    x: r.x,
    y: r.y,
    w: r.w ?? null,
    h: r.h ?? null,
    points: (r.points as number[][]) ?? null,
    srcId: r.src_id ?? null,
    dstId: r.dst_id ?? null,
    srcAnchor: (r.src_anchor as Side) ?? null,
    dstAnchor: (r.dst_anchor as Side) ?? null,
    lineStyle: r.line_style ?? null,
    stroke: r.stroke ?? null,
    fill: r.fill ?? null,
    strokeW: r.stroke_w ?? null,
    variant: r.variant ?? null,
    authorName: r.author_name ?? null,
  };
}

export function CanvasBoard({
  sessionId,
  blockOrd,
  title,
  prompt,
  stepLabel,
  userName,
  isFacilitator,
  showReady,
  ready,
  onToggleReady,
}: {
  sessionId: string;
  blockOrd: number;
  title: string;
  prompt: string | null;
  stepLabel: string;
  userName: string;
  isFacilitator: boolean;
  showReady: boolean;
  ready: boolean;
  onToggleReady: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const boardRef = useRef<HTMLDivElement>(null);

  const [objects, setObjects] = useState<Obj[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [fill, setFill] = useState("lemon");
  const [stroke, setStroke] = useState("ink");
  const [lineStyle, setLineStyle] = useState<"straight" | "curved" | "rounded">("curved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [size, setSize] = useState({ bw: 1, bh: 1 });
  const [draftPts, setDraftPts] = useState<number[][] | null>(null);
  const [connDraft, setConnDraft] = useState<{ srcId: string; srcAnchor: Side; cur: Pt } | null>(null);

  // refs so pointer/subscription handlers read the latest values
  const objectsRef = useRef<Obj[]>(objects);
  const sizeRef = useRef(size);
  const toolRef = useRef(tool);
  const fillRef = useRef(fill);
  const strokeRef = useRef(stroke);
  const lineStyleRef = useRef(lineStyle);
  const editingRef = useRef<string | null>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{ id: string } | null>(null);
  const drawRef = useRef<number[][] | null>(null);
  const connRef = useRef<{ srcId: string; srcAnchor: Side; cur: Pt } | null>(null);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { fillRef.current = fill; }, [fill]);
  useEffect(() => { strokeRef.current = stroke; }, [stroke]);
  useEffect(() => { lineStyleRef.current = lineStyle; }, [lineStyle]);
  useEffect(() => { editingRef.current = editingId; }, [editingId]);

  const byId = (id: string | null) => (id ? objectsRef.current.find((o) => o.id === id) : undefined);

  // keep the SVG layer sized to the board (px) for connector / drawing math
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setSize({ bw: el.clientWidth, bh: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("canvas_object")
      .select(COLS)
      .eq("session_id", sessionId)
      .eq("block_ord", blockOrd)
      .order("created_at", { ascending: true });
    setObjects((data ?? []).map(mapRow));
  }, [supabase, sessionId, blockOrd]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`canvas:${sessionId}:${blockOrd}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "canvas_object", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as any)?.id;
            if (id) setObjects((prev) => prev.filter((o) => o.id !== id));
            return;
          }
          const r = payload.new as any;
          if (!r || r.block_ord !== blockOrd) {
            if (r?.id) setObjects((prev) => prev.filter((o) => o.id !== r.id));
            return;
          }
          const obj = mapRow(r);
          setObjects((prev) => {
            const busy = editingRef.current === obj.id || dragRef.current?.id === obj.id || resizeRef.current?.id === obj.id;
            const i = prev.findIndex((o) => o.id === obj.id);
            if (i === -1) return [...prev, obj];
            if (busy) {
              const keep = prev[i];
              const merged = { ...obj, text: keep.text, x: keep.x, y: keep.y, w: keep.w, h: keep.h };
              const next = prev.slice();
              next[i] = merged;
              return next;
            }
            const next = prev.slice();
            next[i] = obj;
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, blockOrd]);

  // ---- persistence ----------------------------------------------------------
  async function createObj(patch: Record<string, unknown>): Promise<Obj | null> {
    const { data } = await supabase
      .from("canvas_object")
      .insert({ session_id: sessionId, block_ord: blockOrd, author_name: userName, ...patch } as never)
      .select(COLS)
      .single();
    if (!data) return null;
    const o = mapRow(data);
    setObjects((prev) => (prev.some((x) => x.id === o.id) ? prev : [...prev, o]));
    return o;
  }
  async function patchObj(id: string, patch: Record<string, unknown>) {
    await supabase.from("canvas_object").update(patch as never).eq("id", id);
  }
  async function delObj(id: string) {
    setObjects((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
    await supabase.from("canvas_object").delete().eq("id", id);
  }

  // ---- geometry helpers tied to current board size --------------------------
  const boardPoint = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const shapeAt = (p: Pt, excludeId?: string): Obj | undefined => {
    const { bw, bh } = sizeRef.current;
    const shapes = objectsRef.current.filter((o) => SHAPE_KINDS.has(o.kind));
    for (let i = shapes.length - 1; i >= 0; i--) {
      const o = shapes[i];
      if (o.id === excludeId) continue;
      const r = rectOf(o, bw, bh);
      if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) return o;
    }
    return undefined;
  };

  async function createShapeAt(t: Tool, p: Pt) {
    const { bw, bh } = sizeRef.current;
    const nx = clamp01(p.x / bw);
    const ny = clamp01(p.y / bh);
    if (t === "sticky") {
      const o = await createObj({ kind: "sticky", color: fillRef.current, x: nx, y: ny, text: "" });
      if (o) { setSelectedId(o.id); setEditingId(o.id); }
      return;
    }
    const wpx = t === "rect" ? 150 : t === "text" ? 170 : 120;
    const hpx = t === "rect" ? 92 : t === "text" ? 46 : 120;
    const o = await createObj({
      kind: t,
      x: nx,
      y: ny,
      w: wpx / bw,
      h: hpx / bh,
      fill: t === "text" ? null : fillHex(fillRef.current),
      stroke: "rgba(0,0,0,.16)",
      text: "",
    });
    if (o) {
      setSelectedId(o.id);
      if (t === "text") setEditingId(o.id);
    }
  }

  // ---- board pointer interactions ------------------------------------------
  function onBoardPointerDown(e: React.PointerEvent) {
    const t = toolRef.current;
    const el = e.target as HTMLElement;
    if (el.closest("textarea")) return; // let text editing capture its own events
    if (!canEdit) {
      // board is locked for non-facilitators — selection only
      const cidEl = el.closest("[data-cid]") as HTMLElement | null;
      setSelectedId(cidEl?.getAttribute("data-cid") ?? null);
      return;
    }
    const p = boardPoint(e);
    const { bw, bh } = sizeRef.current;

    if (t === "pen" || t === "marker") {
      drawRef.current = [[clamp01(p.x / bw), clamp01(p.y / bh)]];
      setDraftPts(drawRef.current.slice());
      boardRef.current!.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (t === "connector") {
      const aEl = el.closest("[data-anchor]") as HTMLElement | null;
      let srcId: string | null = null;
      let srcAnchor: Side | null = null;
      if (aEl) {
        srcId = aEl.getAttribute("data-cid");
        srcAnchor = aEl.getAttribute("data-anchor") as Side;
      } else {
        const hit = shapeAt(p);
        if (hit) { srcId = hit.id; srcAnchor = nearestSide(rectOf(hit, bw, bh), p); }
      }
      if (srcId && srcAnchor) {
        connRef.current = { srcId, srcAnchor, cur: p };
        setConnDraft({ ...connRef.current });
        boardRef.current!.setPointerCapture(e.pointerId);
      }
      return;
    }

    // select tool
    if (t === "select") {
      const rzEl = el.closest("[data-resize]") as HTMLElement | null;
      if (rzEl) {
        resizeRef.current = { id: rzEl.getAttribute("data-cid")! };
        setSelectedId(resizeRef.current.id);
        boardRef.current!.setPointerCapture(e.pointerId);
        return;
      }
      const cidEl = el.closest("[data-cid]") as HTMLElement | null;
      if (cidEl) {
        if (el.closest(".del")) return;
        const id = cidEl.getAttribute("data-cid")!;
        setSelectedId(id);
        const o = byId(id);
        if (o && SHAPE_KINDS.has(o.kind)) {
          dragRef.current = { id, ox: p.x - o.x * bw, oy: p.y - o.y * bh, moved: false };
          boardRef.current!.setPointerCapture(e.pointerId);
        }
        return;
      }
      setSelectedId(null);
      return;
    }

    // shape-creation tools
    if (SHAPE_KINDS.has(t)) {
      const cidEl = el.closest("[data-cid]") as HTMLElement | null;
      if (cidEl) { setSelectedId(cidEl.getAttribute("data-cid")); return; }
      createShapeAt(t, p);
    }
  }

  function onBoardPointerMove(e: React.PointerEvent) {
    const p = boardPoint(e);
    const { bw, bh } = sizeRef.current;
    if (drawRef.current) {
      drawRef.current.push([clamp01(p.x / bw), clamp01(p.y / bh)]);
      setDraftPts(drawRef.current.slice());
      return;
    }
    if (connRef.current) {
      connRef.current.cur = p;
      setConnDraft({ ...connRef.current });
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      d.moved = true;
      const nx = clamp01((p.x - d.ox) / bw);
      const ny = clamp01((p.y - d.oy) / bh);
      setObjects((prev) => prev.map((o) => (o.id === d.id ? { ...o, x: nx, y: ny } : o)));
      return;
    }
    if (resizeRef.current) {
      const id = resizeRef.current.id;
      const o = byId(id);
      if (!o) return;
      const cx = o.x * bw;
      const cy = o.y * bh;
      const nw = Math.max(44, 2 * (p.x - cx)) / bw;
      const nh = Math.max(36, 2 * (p.y - cy)) / bh;
      setObjects((prev) => prev.map((q) => (q.id === id ? { ...q, w: nw, h: nh } : q)));
    }
  }

  async function onBoardPointerUp(e: React.PointerEvent) {
    const p = boardPoint(e);
    const { bw, bh } = sizeRef.current;
    if (drawRef.current) {
      const pts = drawRef.current;
      drawRef.current = null;
      setDraftPts(null);
      if (pts.length > 1) {
        const marker = toolRef.current === "marker";
        await createObj({
          kind: "draw",
          variant: marker ? "marker" : "pen",
          points: pts,
          stroke: strokeHex(strokeRef.current),
          stroke_w: marker ? 15 : 2.5,
          x: pts[0][0],
          y: pts[0][1],
        });
      }
      return;
    }
    if (connRef.current) {
      const c = connRef.current;
      connRef.current = null;
      setConnDraft(null);
      const tgt = shapeAt(p, c.srcId);
      if (tgt) {
        const ds = nearestSide(rectOf(tgt, bw, bh), p);
        await createObj({
          kind: "connector",
          src_id: c.srcId,
          dst_id: tgt.id,
          src_anchor: c.srcAnchor,
          dst_anchor: ds,
          line_style: lineStyleRef.current,
          stroke: strokeHex(strokeRef.current),
          stroke_w: 2.5,
          x: 0,
          y: 0,
        });
      }
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      dragRef.current = null;
      const o = byId(d.id);
      if (o && d.moved) await patchObj(d.id, { x: o.x, y: o.y });
      return;
    }
    if (resizeRef.current) {
      const id = resizeRef.current.id;
      resizeRef.current = null;
      const o = byId(id);
      if (o) await patchObj(id, { w: o.w, h: o.h });
    }
  }

  function onBoardDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-cid]")) return;
    if (toolRef.current !== "select") return;
    const p = boardPoint(e);
    const { bw, bh } = sizeRef.current;
    createObj({ kind: "sticky", color: fillRef.current, x: clamp01(p.x / bw), y: clamp01(p.y / bh), text: "" }).then(
      (o) => o && setEditingId(o.id),
    );
  }

  // delete selected with the keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const bo = objectsRef.current.find((o) => o.kind === "__board");
        let s: Record<string, unknown> = {};
        try { s = bo?.text ? JSON.parse(bo.text) : {}; } catch { s = {}; }
        if (!isFacilitator && s.locked) return;
        e.preventDefault();
        delObj(selectedId);
      }
      if (e.key === "Escape") { setSelectedId(null); setTool("select"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function onText(id: string, text: string) {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }
  async function commitText(o: Obj) {
    setEditingId((cur) => (cur === o.id ? null : cur));
    const cur = objectsRef.current.find((p) => p.id === o.id);
    await patchObj(o.id, { text: cur?.text ?? "" });
  }
  function applyColor(token: string, isStroke: boolean) {
    if (isStroke) setStroke(token);
    else setFill(token);
    const sel = byId(selectedId);
    if (!sel) return;
    if (sel.kind === "connector" || sel.kind === "draw") {
      const hex = strokeHex(token);
      setObjects((prev) => prev.map((o) => (o.id === sel.id ? { ...o, stroke: hex } : o)));
      patchObj(sel.id, { stroke: hex });
    } else if (sel.kind === "sticky") {
      setObjects((prev) => prev.map((o) => (o.id === sel.id ? { ...o, color: token } : o)));
      patchObj(sel.id, { color: token });
    } else if (sel.kind !== "text") {
      const hex = fillHex(token);
      setObjects((prev) => prev.map((o) => (o.id === sel.id ? { ...o, fill: hex } : o)));
      patchObj(sel.id, { fill: hex });
    }
  }
  function applyLineStyle(ls: "straight" | "curved" | "rounded") {
    setLineStyle(ls);
    const sel = byId(selectedId);
    if (sel && sel.kind === "connector") {
      setObjects((prev) => prev.map((o) => (o.id === sel.id ? { ...o, lineStyle: ls } : o)));
      patchObj(sel.id, { line_style: ls });
    }
  }

  // Facilitator board settings (lock / hide names) stored in a singleton __board object.
  async function setBoardSetting(patch: { locked?: boolean; hideNames?: boolean }) {
    const cur = objectsRef.current.find((o) => o.kind === "__board");
    let s: Record<string, unknown> = {};
    try { s = cur?.text ? JSON.parse(cur.text) : {}; } catch { s = {}; }
    const merged = JSON.stringify({ ...s, ...patch });
    if (cur) {
      setObjects((p) => p.map((o) => (o.id === cur.id ? { ...o, text: merged } : o)));
      await patchObj(cur.id, { text: merged });
    } else {
      await createObj({ kind: "__board", text: merged, x: 0, y: 0 });
    }
  }

  const { bw, bh } = size;
  const shapes = objects.filter((o) => SHAPE_KINDS.has(o.kind));
  const connectors = objects.filter((o) => o.kind === "connector");
  const drawings = objects.filter((o) => o.kind === "draw");
  const selObj = byId(selectedId);
  const boardObj = objects.find((o) => o.kind === "__board");
  let settings: { locked?: boolean; hideNames?: boolean } = {};
  try { settings = boardObj?.text ? JSON.parse(boardObj.text) : {}; } catch { settings = {}; }
  const locked = !!settings.locked;
  const hideNames = !!settings.hideNames;
  const canEdit = isFacilitator || !locked;
  const showFills = SHAPE_KINDS.has(tool) && tool !== "text" ? true : selObj ? SHAPE_KINDS.has(selObj.kind) && selObj.kind !== "text" : false;
  const showStrokes = tool === "pen" || tool === "marker" || tool === "connector" || selObj?.kind === "connector" || selObj?.kind === "draw";
  const showLineStyles = tool === "connector" || selObj?.kind === "connector";
  const cursor = tool === "select" ? "default" : tool === "connector" ? "crosshair" : "crosshair";

  const TOOLS: { key: Tool; label: string; icon: React.ReactNode }[] = [
    { key: "select", label: "Select / move", icon: <path d="M4 3l7 16 2-7 7-2z" /> },
    { key: "sticky", label: "Sticky note", icon: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M14 20v-5h5" /></> },
    { key: "rect", label: "Rectangle", icon: <rect x="4" y="6" width="16" height="12" rx="1.5" /> },
    { key: "ellipse", label: "Ellipse", icon: <circle cx="12" cy="12" r="8" /> },
    { key: "diamond", label: "Diamond", icon: <path d="M12 3l9 9-9 9-9-9z" /> },
    { key: "text", label: "Text", icon: <><path d="M5 5h14" /><path d="M12 5v14" /></> },
    { key: "connector", label: "Connector", icon: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 7c6 1 5 9 10 10" /></> },
    { key: "pen", label: "Pen", icon: <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /> },
    { key: "marker", label: "Marker", icon: <><path d="M9 14l-3 6 6-3" /><path d="M9 14l8-8 4 4-8 8z" /></> },
  ];

  return (
    <div className="canvaswrap">
      <div className="canvashead">
        <div>
          <div className="pact">{stepLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="cright">
          {locked ? (
            <span className="lockpill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              {isFacilitator ? "Locked" : "Locked by facilitator"}
            </span>
          ) : null}
          {showReady ? (
            <button className={`ready${ready ? " on" : ""}`} onClick={onToggleReady}>
              {ready ? "✓ You're ready" : "I'm ready"}
            </button>
          ) : null}
        </div>
      </div>
      {prompt ? <div className="canvasprompt">{prompt}</div> : null}

      <div
        className="board"
        ref={boardRef}
        style={{ cursor }}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onDoubleClick={onBoardDoubleClick}
      >
        {/* left tool rail */}
        <div className="ctools" onPointerDown={(e) => e.stopPropagation()}>
          {TOOLS.map((tl, i) => (
            <span key={tl.key} style={{ display: "contents" }}>
              {(i === 1 || i === 6) ? <span className="cdiv" /> : null}
              <button
                className={`ctool${tool === tl.key ? " active" : ""}`}
                title={tl.label}
                aria-label={tl.label}
                aria-pressed={tool === tl.key}
                onClick={() => setTool(tl.key)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {tl.icon}
                </svg>
              </button>
            </span>
          ))}
          {isFacilitator ? (
            <>
              <span className="cdiv" />
              <button
                className={`ctool${locked ? " active" : ""}`}
                title={locked ? "Unlock board" : "Lock board — only you can edit"}
                aria-label="Lock board"
                aria-pressed={locked}
                onClick={() => setBoardSetting({ locked: !locked })}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d={locked ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 8 0"} />
                </svg>
              </button>
              <button
                className={`ctool${hideNames ? " active" : ""}`}
                title={hideNames ? "Show author names" : "Hide author names"}
                aria-label="Toggle author names"
                aria-pressed={hideNames}
                onClick={() => setBoardSetting({ hideNames: !hideNames })}
              >
                {hideNames ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.2-1.5" />
                    <path d="m4 4 16 16" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </>
          ) : null}
        </div>

        {/* contextual options: colour + connector routing */}
        {showFills || showStrokes || showLineStyles ? (
          <div className="csub" onPointerDown={(e) => e.stopPropagation()}>
            {showLineStyles ? (
              <div className="csub-grp">
                {(["straight", "curved", "rounded"] as const).map((ls) => (
                  <button
                    key={ls}
                    className={`lstyle${lineStyle === ls ? " on" : ""}`}
                    title={`${ls[0].toUpperCase()}${ls.slice(1)} connector`}
                    aria-label={`${ls} connector`}
                    onClick={() => applyLineStyle(ls)}
                  >
                    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      {ls === "straight" ? <path d="M2 12 L20 2" /> : ls === "curved" ? <path d="M2 12 C 10 12 12 2 20 2" /> : <path d="M2 12 L11 12 L11 2 L20 2" />}
                    </svg>
                  </button>
                ))}
              </div>
            ) : null}
            {(showFills || showStrokes) ? (
              <div className="csub-grp">
                {(showStrokes ? STROKES : FILLS).map(([token, hex]) => {
                  const active = (showStrokes ? stroke : fill) === token;
                  return (
                    <button
                      key={token}
                      className={`swatch${active ? " on" : ""}`}
                      title={token}
                      aria-label={`Colour ${token}`}
                      style={{ background: hex, borderColor: token === "white" ? "var(--line-2)" : "transparent" }}
                      onClick={() => applyColor(token, showStrokes)}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {objects.length === 0 ? (
          <div className="boardhint">Pick a tool on the left, or double-click to drop a sticky.</div>
        ) : null}

        {/* connectors + freehand drawings */}
        <svg className="clayer" width={bw} height={bh}>
          <defs>
            <marker id="oa-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          {connectors.map((c) => {
            const s = byId(c.srcId);
            const d = byId(c.dstId);
            if (!s || !d) return null;
            const ss = (c.srcAnchor ?? "e") as Side;
            const ds = (c.dstAnchor ?? "w") as Side;
            const sp = anchorPt(rectOf(s, bw, bh), ss);
            const dp = anchorPt(rectOf(d, bw, bh), ds);
            const dd = connectorPath(c.lineStyle ?? "curved", sp, ss, dp, ds);
            const on = selectedId === c.id;
            return (
              <path
                key={c.id}
                data-cid={c.id}
                className={`conn${on ? " sel" : ""}`}
                d={dd}
                fill="none"
                stroke={c.stroke ?? "#33312a"}
                strokeWidth={(c.strokeW ?? 2.5) * (on ? 1.7 : 1)}
                markerEnd="url(#oa-arrow)"
                style={{ pointerEvents: "stroke" }}
              />
            );
          })}
          {drawings.map((dr) => (
            <polyline
              key={dr.id}
              data-cid={dr.id}
              points={(dr.points ?? []).map(([x, y]) => `${x * bw},${y * bh}`).join(" ")}
              fill="none"
              stroke={dr.stroke ?? "#33312a"}
              strokeWidth={(dr.strokeW ?? 2.5) * (selectedId === dr.id ? 1.4 : 1)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={dr.variant === "marker" ? 0.4 : 1}
              style={{ pointerEvents: "stroke" }}
            />
          ))}
          {draftPts && draftPts.length > 1 ? (
            <polyline
              points={draftPts.map(([x, y]) => `${x * bw},${y * bh}`).join(" ")}
              fill="none"
              stroke={strokeHex(stroke)}
              strokeWidth={tool === "marker" ? 15 : 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={tool === "marker" ? 0.4 : 1}
            />
          ) : null}
          {connDraft ? (() => {
            const s = byId(connDraft.srcId);
            if (!s) return null;
            const sp = anchorPt(rectOf(s, bw, bh), connDraft.srcAnchor);
            return <path d={`M ${sp.x} ${sp.y} L ${connDraft.cur.x} ${connDraft.cur.y}`} fill="none" stroke="#3a4d3f" strokeWidth={2} strokeDasharray="5 4" />;
          })() : null}
        </svg>

        {/* shapes (DOM) */}
        {shapes.map((o) => {
          const r = rectOf(o, bw, bh);
          const sel = selectedId === o.id;
          const anchorsOn = tool === "connector" || sel;
          const editing = editingId === o.id;
          const common: React.CSSProperties = { left: r.left, top: r.top, width: r.w, height: o.kind === "sticky" ? undefined : r.h };
          if (o.kind === "sticky") {
            return (
              <div key={o.id} data-cid={o.id} className={`sticky ${o.color}${sel ? " sel" : ""}`} style={{ ...common, transform: "none" }}>
                {sel && canEdit ? <button className="del" title="Delete" onPointerDown={(e) => e.stopPropagation()} onClick={() => delObj(o.id)}>✕</button> : null}
                {editing ? (
                  <textarea autoFocus value={o.text} placeholder="Type a note…" onChange={(e) => onText(o.id, e.target.value)} onBlur={() => commitText(o)} />
                ) : (
                  <div className="stext" onDoubleClick={(e) => { e.stopPropagation(); setEditingId(o.id); }}>
                    {o.text ? o.text : <span className="ph">Double-click to edit</span>}
                  </div>
                )}
                {hideNames ? null : <div className="seg-by">{o.authorName ? o.authorName.split(" ")[0] : ""}</div>}
                {anchorsOn ? SIDES.map((sd) => <Anchor key={sd} id={o.id} side={sd} />) : null}
              </div>
            );
          }
          // rect / ellipse / diamond / text
          const isText = o.kind === "text";
          const shapeStyle: React.CSSProperties = {
            ...common,
            background: isText ? "transparent" : o.fill ?? "#fff",
            borderColor: isText ? "transparent" : o.stroke ?? "rgba(0,0,0,.16)",
            borderRadius: o.kind === "rect" ? 8 : o.kind === "ellipse" ? "50%" : 0,
            clipPath: o.kind === "diamond" ? "polygon(50% 0,100% 50%,50% 100%,0 50%)" : undefined,
          };
          return (
            <div key={o.id} data-cid={o.id} className={`cshape ${o.kind}${sel ? " sel" : ""}${isText ? " ctext" : ""}`} style={shapeStyle}>
              {editing ? (
                <textarea autoFocus value={o.text} placeholder={isText ? "Text…" : "Label…"} onChange={(e) => onText(o.id, e.target.value)} onBlur={() => commitText(o)} />
              ) : (
                <div className="clabel" onDoubleClick={(e) => { e.stopPropagation(); setEditingId(o.id); }}>
                  {o.text ? o.text : <span className="ph">{isText ? "Text" : ""}</span>}
                </div>
              )}
              {sel && canEdit ? <button className="del" title="Delete" onPointerDown={(e) => e.stopPropagation()} onClick={() => delObj(o.id)}>✕</button> : null}
              {sel && canEdit ? <span className="cresize" data-resize="1" data-cid={o.id} /> : null}
              {anchorsOn ? SIDES.map((sd) => <Anchor key={sd} id={o.id} side={sd} />) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Anchor({ id, side }: { id: string; side: Side }) {
  const pos: React.CSSProperties =
    side === "n" ? { left: "50%", top: 0 } : side === "s" ? { left: "50%", top: "100%" } : side === "e" ? { left: "100%", top: "50%" } : { left: 0, top: "50%" };
  return <span className="canchor" data-cid={id} data-anchor={side} style={pos} />;
}
