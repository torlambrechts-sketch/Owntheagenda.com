"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { CanvasStatic, canvasSvgToPng, type CanvasObj } from "@/components/CanvasStatic";
import { saveCanvas, startFromCanvas } from "./actions";

type Block = { ord: number; title: string; objects: CanvasObj[] };
type Snap = { id: string; title: string | null; block_ord: number; object_count: number; created_at: string; data: CanvasObj[] };

export function CanvasReadout({
  sessionId,
  blocks,
  snapshots,
  canManage,
}: {
  sessionId: string;
  blocks: Block[];
  snapshots: Snap[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }

  function onSave(ord: number, title: string) {
    start(async () => {
      const res = await saveCanvas(sessionId, ord, title || null);
      if (res.error) flash(res.error);
      else {
        flash("Canvas saved — reusable below");
        router.refresh();
      }
    });
  }
  function onStart(id: string) {
    start(async () => {
      const res = await startFromCanvas(id);
      if (res.error) flash(res.error);
      else if (res.workshopId) router.push(`/run/${res.workshopId}`);
    });
  }
  function onPng(e: MouseEvent<HTMLButtonElement>, name: string) {
    const svg = e.currentTarget.closest(".canvas-card")?.querySelector("svg") as SVGSVGElement | null;
    if (svg) canvasSvgToPng(svg, name);
  }

  if (!blocks.length && !snapshots.length) return null;

  return (
    <div className="ro-block">
      <div className="ro-block-h">
        <h3>Canvas</h3>
        {snapshots.length ? <span className="pill sm t-vote">{snapshots.length} saved</span> : null}
      </div>

      {blocks.map((b) => (
        <div className="canvas-card" key={b.ord}>
          <div className="canvas-card-h">
            <span>{b.title || `Step ${b.ord}`}</span>
            <span className="n">{b.objects.length} items</span>
          </div>
          <CanvasStatic objects={b.objects} className="ro-canvas" />
          <div className="canvas-card-foot">
            {canManage ? (
              <button className="linkbtn" disabled={pending} onClick={() => onSave(b.ord, b.title)}>Save canvas</button>
            ) : null}
            <button className="linkbtn" onClick={(e) => onPng(e, b.title || "canvas")}>Download PNG</button>
          </div>
        </div>
      ))}

      {snapshots.length ? (
        <>
          <div className="ro-sub-h">Saved canvases — edit later or start a new session from one</div>
          <div className="canvas-saved-grid">
            {snapshots.map((s) => (
              <div className="canvas-card" key={s.id}>
                <div className="canvas-card-h">
                  <span>{s.title || `Step ${s.block_ord}`}</span>
                  <span className="n">{new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>
                <CanvasStatic objects={s.data} className="ro-canvas" />
                <div className="canvas-card-foot">
                  <button className="linkbtn" onClick={(e) => onPng(e, s.title || "canvas")}>Download PNG</button>
                  {canManage ? (
                    <button className="linkbtn" disabled={pending} onClick={() => onStart(s.id)}>Start from this canvas ▸</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
