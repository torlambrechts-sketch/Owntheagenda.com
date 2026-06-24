"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, statusVis, WA } from "../visuals";
import { launchRun } from "../actions";

export type RunnableWorkshop = {
  id: string;
  title: string;
  status: string;
  templateName: string | null;
  steps: number;
  minutes: number;
};

export function RunSetupClient({ workshops }: { workshops: RunnableWorkshop[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(workshops[0]?.id ?? null);
  const [role, setRole] = useState<"facilitator" | "participant">("facilitator");
  const [dry, setDry] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2600); }

  function launch() {
    if (!selected) { flash("Pick a workshop to run"); return; }
    startTransition(async () => {
      const res = await launchRun(selected, dry);
      if (res.error) { flash(res.error); return; }
      router.push(`/run/${selected}?role=${role}`);
    });
  }

  if (!workshops.length) {
    return (
      <div className="card empty">
        No runnable workshops yet. <Link className="linkbtn" href="/workshops">Build one first ›</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="rs-eyebrow">Choose workshop</div>
      <div className="rs-list">
        {workshops.map((w) => {
          const s = statusVis(w.status);
          const on = selected === w.id;
          return (
            <button key={w.id} type="button" className={`rs-row${on ? " on" : ""}`} onClick={() => setSelected(w.id)}>
              <span className="rs-radio">{on ? <Icon name="Check" size={13} color="#fff" /> : null}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="rs-row-t">{w.title}</div>
                <div className="rs-row-m">
                  <span style={{ fontFamily: "ui-monospace,monospace" }}>#{w.id.slice(0, 4).toUpperCase()}</span>
                  {w.templateName ? <> · {w.templateName}</> : null}
                  {w.steps ? <> · {w.steps} steps · {w.minutes} min</> : <> · empty</>}
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.text, flexShrink: 0 }}>
                <span className={s.live ? "wa-pulse" : undefined} style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />{s.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rs-eyebrow">Your role</div>
      <div className="rs-roles">
        <button type="button" className={`rs-role${role === "facilitator" ? " on" : ""}`} onClick={() => setRole("facilitator")}>
          <Icon name="PenLine" size={15} color={role === "facilitator" ? WA.accent : WA.faint} /> Facilitator
        </button>
        <button type="button" className={`rs-role${role === "participant" ? " on" : ""}`} onClick={() => setRole("participant")}>
          <Icon name="Users" size={15} color={role === "participant" ? WA.accent : WA.faint} /> Participant
        </button>
      </div>

      <div className="rs-eyebrow">Mode</div>
      <button type="button" className={`rs-dry${dry ? " on" : ""}`} onClick={() => setDry((d) => !d)}>
        <span className="rs-dry-check">{dry ? <Icon name="Check" size={13} color="#fff" /> : null}</span>
        <div style={{ flex: 1 }}>
          <div className="rs-dry-t"><Icon name="Sparkles" size={13} color="#a8862f" /> Dry run</div>
          <div className="rs-dry-s">Rehearse the flow — responses, votes and actions are not recorded to the workshop.</div>
        </div>
      </button>

      <div className="rs-actions">
        <Link className="btn-sec" href="/workshops">Cancel</Link>
        <button className="btn-prim" disabled={pending || !selected} onClick={launch} style={{ marginLeft: "auto" }}>
          <Icon name="Play" size={14} color="#fff" /> {dry ? "Start dry run" : "Start session"}
        </button>
      </div>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
