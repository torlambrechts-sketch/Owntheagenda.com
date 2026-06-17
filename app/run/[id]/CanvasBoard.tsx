"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Obj = {
  id: string;
  blockOrd: number;
  kind: string;
  text: string;
  color: string;
  x: number;
  y: number;
  authorId: string | null;
  authorName: string | null;
};

const PALETTE = ["lemon", "mint", "sky", "blush", "lilac"];
const COLS = "id, block_ord, kind, text, color, x, y, author_id, author_name";

function mapRow(r: any): Obj {
  return {
    id: r.id,
    blockOrd: r.block_ord,
    kind: r.kind,
    text: r.text ?? "",
    color: r.color ?? "lemon",
    x: r.x,
    y: r.y,
    authorId: r.author_id ?? null,
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
  showReady: boolean;
  ready: boolean;
  onToggleReady: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const boardRef = useRef<HTMLDivElement>(null);
  const [objects, setObjects] = useState<Obj[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // refs to read latest state inside subscription / pointer handlers
  const objectsRef = useRef<Obj[]>(objects);
  const editingRef = useRef<string | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { editingRef.current = editingId; }, [editingId]);

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
            // Never clobber the note this user is actively editing or dragging.
            const busy = editingRef.current === obj.id || dragRef.current?.id === obj.id;
            const i = prev.findIndex((o) => o.id === obj.id);
            if (i === -1) return busy ? prev : [...prev, obj];
            if (busy) {
              const keep = prev[i];
              const merged = { ...obj, text: keep.text, x: keep.x, y: keep.y };
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

  async function addAt(nx: number, ny: number) {
    const color = PALETTE[objectsRef.current.length % PALETTE.length];
    const x = Math.min(0.95, Math.max(0.05, nx));
    const y = Math.min(0.95, Math.max(0.05, ny));
    const { data } = await supabase
      .from("canvas_object")
      .insert({ session_id: sessionId, block_ord: blockOrd, text: "", color, x, y, author_name: userName })
      .select(COLS)
      .single();
    if (!data) return;
    const obj = mapRow(data);
    setObjects((prev) => (prev.some((o) => o.id === obj.id) ? prev : [...prev, obj]));
    setEditingId(obj.id);
  }

  function addNote() {
    addAt(0.4 + Math.random() * 0.2, 0.32 + Math.random() * 0.18);
  }

  function onBoardDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".sticky")) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    addAt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  }

  function onPointerDown(e: React.PointerEvent, o: Obj) {
    const t = e.target as HTMLElement;
    if (t.closest("textarea") || t.closest(".del")) return;
    if (editingId === o.id) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + o.x * rect.width;
    const cy = rect.top + o.y * rect.height;
    dragRef.current = { id: o.id, dx: e.clientX - cx, dy: e.clientY - cy, sx: e.clientX, sy: e.clientY, moved: false };
    setDragId(o.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent, o: Obj) {
    const d = dragRef.current;
    if (!d || d.id !== o.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = Math.min(0.97, Math.max(0.03, (e.clientX - d.dx - rect.left) / rect.width));
    const ny = Math.min(0.97, Math.max(0.03, (e.clientY - d.dy - rect.top) / rect.height));
    setObjects((prev) => prev.map((p) => (p.id === o.id ? { ...p, x: nx, y: ny } : p)));
  }

  async function onPointerUp(e: React.PointerEvent, o: Obj) {
    const d = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    if (!d || d.id !== o.id || !d.moved) return;
    const cur = objectsRef.current.find((p) => p.id === o.id);
    if (cur) await supabase.from("canvas_object").update({ x: cur.x, y: cur.y }).eq("id", o.id);
  }

  function onTextChange(id: string, text: string) {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }

  async function commitText(o: Obj) {
    setEditingId((cur) => (cur === o.id ? null : cur));
    const cur = objectsRef.current.find((p) => p.id === o.id);
    await supabase.from("canvas_object").update({ text: cur?.text ?? "" }).eq("id", o.id);
  }

  async function del(o: Obj) {
    setObjects((prev) => prev.filter((p) => p.id !== o.id));
    if (editingId === o.id) setEditingId(null);
    await supabase.from("canvas_object").delete().eq("id", o.id);
  }

  return (
    <div className="canvaswrap">
      <div className="canvashead">
        <div>
          <div className="pact">{stepLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="cright">
          <button className="addnote" onClick={addNote}>+ Add note</button>
          {showReady ? (
            <button className={`ready${ready ? " on" : ""}`} onClick={onToggleReady}>
              {ready ? "✓ You're ready" : "I'm ready"}
            </button>
          ) : null}
        </div>
      </div>
      {prompt ? <div className="canvasprompt">{prompt}</div> : null}
      <div className="board" ref={boardRef} onDoubleClick={onBoardDoubleClick}>
        {objects.length === 0 ? (
          <div className="boardhint">Double-click anywhere — or hit “Add note” — to drop a sticky.</div>
        ) : null}
        {objects.map((o) => (
          <div
            key={o.id}
            className={`sticky ${o.color}${dragId === o.id ? " drag" : ""}`}
            style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%` }}
            onPointerDown={(e) => onPointerDown(e, o)}
            onPointerMove={(e) => onPointerMove(e, o)}
            onPointerUp={(e) => onPointerUp(e, o)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingId(o.id);
            }}
          >
            <button
              className="del"
              title="Delete note"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => del(o)}
            >
              ✕
            </button>
            {editingId === o.id ? (
              <textarea
                autoFocus
                value={o.text}
                placeholder="Type a note…"
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => onTextChange(o.id, e.target.value)}
                onBlur={() => commitText(o)}
              />
            ) : (
              <div className="stext">
                {o.text ? o.text : <span className="ph">Double-click to edit</span>}
              </div>
            )}
            <div className="seg-by">{o.authorName ? o.authorName.split(" ")[0] : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
