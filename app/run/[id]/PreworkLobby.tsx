"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { IdeaModule, type ModuleConfig } from "./IdeaModule";

export type PreworkBlock = { ord: number; title: string; prompt: string | null; config: ModuleConfig };

// Asynchronous pre-work surface: members add idea cards privately before the
// facilitator starts the live run. Cards land in the same `idea` rows and
// stay hidden from others until the in-session reveal (RLS-enforced).
export function PreworkLobby({
  workshopId,
  sessionId,
  title,
  blocks,
  userId,
  userName,
  isFacilitator,
  canManage,
}: {
  workshopId: string;
  sessionId: string;
  title: string;
  blocks: PreworkBlock[];
  userId: string;
  userName: string;
  isFacilitator: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Enter the live run the moment the facilitator starts it.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`prework:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "session", filter: `id=eq.${sessionId}` },
        (p) => { if ((p.new as { is_prep?: boolean }).is_prep === false) router.refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, router]);

  async function goLive() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("start_session", { p_workshop: workshopId });
    if (error) { setErr(error.message); setBusy(false); return; }
    router.refresh();
  }

  return (
    <div className="prework">
      <div className="prework-head">
        <div className="prework-brand"><LogoMark size={26} /><span className="pre-eyebrow">Pre-work</span></div>
        <h1>{title}</h1>
        <p className="lede">
          Add your ideas independently before the session. Your cards are private — only you can see them
          until the group reveals them live. Strong individual input makes the live time shorter and sharper.
        </p>
        {err ? <div className="form-err">{err}</div> : null}
      </div>

      {blocks.length === 0 ? (
        <div className="prework-empty">No pre-work steps were set up for this session.</div>
      ) : (
        <div className="prework-blocks">
          {blocks.map((b) => (
            <div className="prework-block" key={b.ord}>
              <IdeaModule
                sessionId={sessionId}
                blockOrd={b.ord}
                mode="brainstorm"
                title={b.title}
                prompt={b.prompt}
                stepLabel="Pre-work"
                config={b.config}
                userId={userId}
                userName={userName}
                isFacilitator={isFacilitator}
                showReady={false}
                ready={false}
                onToggleReady={() => {}}
                collecting
                addPlaceholder="Add a thought — one per card… (paste a list to add many)"
              />
            </div>
          ))}
        </div>
      )}

      <div className="prework-foot">
        {canManage ? (
          <>
            <span className="pf-note">When everyone has contributed, start the live session — pre-work cards are waiting inside.</span>
            <button className="btn-prim" disabled={busy} onClick={goLive}>{busy ? "Starting…" : "Start the live session ▸"}</button>
          </>
        ) : (
          <span className="pf-note">The facilitator will start the live session when everyone has added their pre-work.</span>
        )}
      </div>
      <div className="prework-back">
        <Link className="linkbtn" href={`/workshops/${workshopId}`}>‹ Back to builder</Link>
      </div>
    </div>
  );
}
