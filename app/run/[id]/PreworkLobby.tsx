"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { IdeaModule, type ModuleConfig, type ModuleMode } from "./IdeaModule";

export type PreworkBlock = { ord: number; title: string; prompt: string | null; activityType: string; config: ModuleConfig };

// Feedback steps keep their lanes; brainstorm and check-in both collect free
// idea cards.
function preworkMode(activityType: string): ModuleMode {
  return activityType === "feedback" ? "feedback" : "brainstorm";
}

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
        <div className="prework-brand">
          <LogoMark size={26} /><span className="pre-eyebrow">Early input</span>
          <span className="pre-status">Preparation open</span>
        </div>
        <h1>{title}</h1>
        <p className="lede">
          Add your thoughts and ideas across the agenda before the session starts. Getting input in early
          makes the live time shorter and sharper. Steps marked private stay hidden until the group reveals
          them live.
        </p>
        <div className="pre-seednote">
          Anything added here is captured and seeds the live agenda when the session starts — pre-reads,
          talking points, poll options and board notes all carry into the room and into the final report.
        </div>
        {err ? <div className="form-err">{err}</div> : null}
      </div>

      {blocks.length === 0 ? (
        <div className="prework-empty">No input steps were set up for this workshop yet.</div>
      ) : (
        <div className="prework-blocks">
          {blocks.map((b) => (
            <div className="prework-block" key={b.ord}>
              <IdeaModule
                sessionId={sessionId}
                blockOrd={b.ord}
                mode={preworkMode(b.activityType)}
                title={b.title}
                prompt={b.prompt}
                stepLabel="Early input"
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
