"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/util";
import { sendSurvey, remindSurvey, closeSurvey } from "./actions";

type OpenSurvey = { id: string; name: string; kind: string; due_at: string | null };
type Pick = { key: string; name: string };
type Status = { responded: number; total: number; roster: { name: string; completed: boolean }[] };

// Lead/admin surface: send a date-bound assessment to the team, then remind /
// close it. The date-bound survey is the "pre-work" you send ahead of a workshop.
// The instrument list comes from the template library (team-scope templates).
export function SendSurvey({ teamId, openSurveys, templates, status }: { teamId: string; openSurveys: OpenSurvey[]; templates: Pick[]; status: Record<string, Status> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState(templates[0]?.key ?? "");
  const [due, setDue] = useState("");
  const [openRoster, setOpenRoster] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }

  function send() {
    startTransition(async () => {
      const res = await sendSurvey(teamId, kind, due || null);
      if (res.error) flash(res.error);
      else {
        flash("Assessment sent to the team");
        setDue("");
        router.refresh();
      }
    });
  }
  function remind(id: string) {
    startTransition(async () => {
      const res = await remindSurvey(id);
      flash(res.error ? res.error : `Reminded ${res.pending ?? 0} who haven't responded`);
    });
  }
  function close(id: string) {
    if (!confirm("Close this assessment? No more responses can be submitted.")) return;
    startTransition(async () => {
      const res = await closeSurvey(id);
      if (res.error) flash(res.error);
      else {
        flash("Assessment closed");
        router.refresh();
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="cat-head" style={{ marginTop: 0 }}>Send an assessment</div>
      <p className="page-sub" style={{ marginTop: 0 }}>
        Sends an anonymous survey to the team. Set a due date to schedule it ahead of a workshop.
      </p>
      <div className="two" style={{ alignItems: "end" }}>
        <div className="field">
          <label>Instrument</label>
          <select className="inp" value={kind} onChange={(e) => setKind(e.target.value)}>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Due date <span className="opt">(optional)</span></label>
          <input className="inp" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-prim" disabled={pending || !kind} onClick={send}>Send to team ▸</button>
      </div>

      {openSurveys.length > 0 ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div className="dlabel">Open assessments</div>
          {openSurveys.map((s) => {
            const st = status[s.id];
            const all = st && st.total > 0 && st.responded === st.total;
            return (
              <div key={s.id}>
                <div className="osrow">
                  <div className="osmain">
                    <b>{s.name}</b>
                    {s.due_at ? <span className="src">due {new Date(s.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span> : null}
                  </div>
                  {st ? (
                    <button
                      className={`pill sm ${all ? "open" : "draft"}`}
                      style={{ border: "none", cursor: "pointer" }}
                      onClick={() => setOpenRoster((r) => (r === s.id ? null : s.id))}
                      title="Show who has responded"
                    >
                      {st.responded}/{st.total} responded
                    </button>
                  ) : null}
                  <button className="linkbtn" disabled={pending} onClick={() => remind(s.id)}>Remind</button>
                  <button className="linkbtn" style={{ color: "var(--rust)" }} disabled={pending} onClick={() => close(s.id)}>Close</button>
                </div>
                {openRoster === s.id && st ? (
                  <div className="roster">
                    {st.roster.map((m, i) => (
                      <div className="rosterrow" key={`${m.name}-${i}`}>
                        <span className="person"><span className="av sm">{initials(m.name)}</span>{m.name}</span>
                        <span className={`pill sm ${m.completed ? "open" : "internal"}`}>{m.completed ? "Responded" : "Pending"}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
