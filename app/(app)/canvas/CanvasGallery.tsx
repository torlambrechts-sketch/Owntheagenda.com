"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CanvasStatic, canvasSvgToPng, type CanvasObj } from "@/components/CanvasStatic";
import { useTableControls } from "@/components/TableControls";
import { startFromCanvas } from "./actions";

export type GalleryItem = {
  id: string;
  title: string | null;
  workshopId: string;
  workshopTitle: string;
  team: string | null;
  blockOrd: number;
  objectCount: number;
  createdAt: string;
  manageable: boolean;
  data: CanvasObj[];
};

export function CanvasGallery({ items }: { items: GalleryItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }

  const teams = Array.from(new Set(items.map((i) => i.team).filter((t): t is string => !!t)));
  const { view, controls } = useTableControls<GalleryItem>(items, {
    search: { placeholder: "Search canvases…", text: (i) => `${i.title ?? ""} ${i.workshopTitle} ${i.team ?? ""}` },
    sorts: [
      { key: "recent", label: "Most recent", cmp: (a, b) => b.createdAt.localeCompare(a.createdAt) },
      { key: "title", label: "Name (A–Z)", cmp: (a, b) => (a.title ?? a.workshopTitle).localeCompare(b.title ?? b.workshopTitle) },
      { key: "size", label: "Most items", cmp: (a, b) => b.objectCount - a.objectCount },
    ],
    facets: teams.length
      ? [{ key: "team", label: "Team", options: teams.map((t) => ({ value: t, label: t, test: (i: GalleryItem) => i.team === t })) }]
      : [],
  });

  function onPng(e: MouseEvent<HTMLButtonElement>, name: string) {
    const svg = e.currentTarget.closest(".canvas-card")?.querySelector("svg") as SVGSVGElement | null;
    if (svg) canvasSvgToPng(svg, name);
  }
  function onStart(id: string) {
    start(async () => {
      const res = await startFromCanvas(id);
      if (res.error) flash(res.error);
      else if (res.workshopId) router.push(`/run/${res.workshopId}`);
    });
  }

  if (!items.length) {
    return <div className="card empty">No saved canvases yet. On a session readout, save a canvas board to reuse it here.</div>;
  }

  return (
    <>
      {items.length >= 4 ? controls : null}
      <div className="canvas-saved-grid">
        {view.map((s) => (
          <div className="canvas-card" key={s.id}>
            <div className="canvas-card-h">
              <span>{s.title || `${s.workshopTitle} · step ${s.blockOrd}`}</span>
              <span className="n">{new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
            <CanvasStatic objects={s.data} className="ro-canvas" />
            <div className="canvas-card-meta">
              <Link href={`/run/${s.workshopId}`} className="hlink">{s.workshopTitle}</Link>
              {s.team ? <span className="src"> · {s.team}</span> : null}
              <span className="src"> · {s.objectCount} items</span>
            </div>
            <div className="canvas-card-foot">
              <button className="linkbtn" onClick={(e) => onPng(e, s.title || s.workshopTitle)}>Download PNG</button>
              {s.manageable ? (
                <button className="linkbtn" disabled={pending} onClick={() => onStart(s.id)}>Start from this canvas ▸</button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
