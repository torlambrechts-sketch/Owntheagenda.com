"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Mint / revoke the public readout link (facilitator or admin only).
export function ShareLink({ sessionId, initialToken }: { sessionId: string; initialToken: string | null }) {
  const supabase = createClient();
  const [token, setToken] = useState<string | null>(initialToken);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const url = token && typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function setShare(on: boolean) {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("session_share_set", { p_session: sessionId, p_on: on });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setToken((data as string | null) ?? null);
  }
  async function regenerate() {
    setBusy(true);
    setErr(null);
    await supabase.rpc("session_share_set", { p_session: sessionId, p_on: false });
    const { data, error } = await supabase.rpc("session_share_set", { p_session: sessionId, p_on: true });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setToken((data as string | null) ?? null);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }

  return (
    <div className="share-wrap" ref={wrapRef}>
      <button className={`btn-sec${token ? " on-share" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {token ? "🔗 Shared" : "Share"}
      </button>
      {open ? (
        <div className="share-pop">
          <div className="guide-h">Share this readout</div>
          {token ? (
            <>
              <p className="share-note">Anyone with this link can view a read-only readout — no account needed. Card anonymity is preserved.</p>
              <div className="share-url">
                <input className="inp" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn-prim sm" onClick={copy}>{copied ? "✓" : "Copy"}</button>
              </div>
              <div className="share-row">
                <a className="guide-link" href={url} target="_blank" rel="noreferrer">Open ↗</a>
                <button className="linkbtn xs" disabled={busy} onClick={regenerate}>Regenerate</button>
                <button className="linkbtn xs danger" disabled={busy} onClick={() => setShare(false)}>Turn off</button>
              </div>
            </>
          ) : (
            <>
              <p className="share-note">Create a public link to the readout — the artifact you forward after the session. Fist-of-five stays aggregate-only and anonymous cards stay anonymous.</p>
              <button className="btn-prim btn-full sm" disabled={busy} onClick={() => setShare(true)}>{busy ? "Creating…" : "Create share link"}</button>
            </>
          )}
          {err ? <div className="form-err" style={{ marginTop: 8 }}>{err}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
