"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CanvasGallery, type GalleryItem } from "../workshops/CanvasGallery";
import { quickStart } from "../workshops/actions";

export function WhiteboardClient({
  teamId,
  canStart,
  canvasItems,
}: {
  teamId: string | null;
  canStart: boolean;
  canvasItems: GalleryItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }

  function newBoard() {
    if (!teamId) return;
    start(async () => {
      const res = await quickStart(teamId, "Whiteboard", "canvas");
      if (res.error) flash(res.error);
      else if (res.workshopId) router.push(`/run/${res.workshopId}`);
    });
  }

  return (
    <>
      {canStart && teamId ? (
        <div className="wk-create">
          <div className="wk-strip">
            <button className="wcard wcard-new" disabled={pending} onClick={newBoard}>
              <span className="wcard-ring">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              </span>
              <span className="wcard-nl">New whiteboard</span>
            </button>
          </div>
        </div>
      ) : !teamId ? (
        <div className="card empty">Create a team first to start a whiteboard.</div>
      ) : null}

      <div className="cat-head" style={{ marginTop: 30 }}>
        Saved boards <span className="n">{canvasItems.length}</span>
      </div>
      <CanvasGallery items={canvasItems} />

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
