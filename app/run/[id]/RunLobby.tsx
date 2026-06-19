"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";

export function RunLobby({
  workshopId,
  title,
  canManage,
}: {
  workshopId: string;
  title: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "live" | "prework">(null);
  const [err, setErr] = useState<string | null>(null);

  // Auto-enter when a session is started for this workshop.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`lobby:${workshopId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "session", filter: `workshop_id=eq.${workshopId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [workshopId, router]);

  async function start() {
    setBusy("live");
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("start_session", { p_workshop: workshopId });
    if (error) {
      setErr(error.message);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  async function openPrework() {
    setBusy("prework");
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("open_prework", { p_workshop: workshopId, p_all: true });
    if (error) {
      setErr(error.message);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <div className="lobby">
      <div className="auth-card" style={{ maxWidth: 440, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <LogoMark size={40} />
        </div>
        <h1>{title}</h1>
        {err ? <div className="form-err">{err}</div> : null}
        {canManage ? (
          <>
            <p className="lede">Ready to run this session live, step by step.</p>
            <button className="btn-prim btn-full" disabled={!!busy} onClick={start}>
              {busy === "live" ? "Starting…" : "Start session ▸"}
            </button>
            <button className="btn-sec btn-full" style={{ marginTop: 10 }} disabled={!!busy} onClick={openPrework}>
              {busy === "prework" ? "Opening…" : "Open for early input"}
            </button>
            <div className="form-note" style={{ marginTop: 8 }}>
              Let members add thoughts &amp; ideas across the whole agenda before you start. You can begin the live session whenever you&apos;re ready.
            </div>
          </>
        ) : (
          <>
            <p className="lede">Waiting for the facilitator to start the session…</p>
            <button className="btn-sec btn-full" onClick={() => router.refresh()}>
              Check again
            </button>
          </>
        )}
        <div style={{ marginTop: 16 }}>
          <Link className="linkbtn" href={`/workshops/${workshopId}`}>
            ‹ Back to builder
          </Link>
        </div>
      </div>
    </div>
  );
}
