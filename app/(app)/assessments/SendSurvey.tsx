"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/util";
import { sendSurvey, remindSurvey, closeSurvey, setSurveySubject } from "./actions";

type OpenSurvey = { id: string; name: string; kind: string; due_at: string | null };
type Pick = { key: string; name: string };
type Status = { responded: number; total: number; roster: { name: string; completed: boolean }[] };
type Member = { id: string; name: string };
type GapDim = { key: string; label: string; subject: number | null; others: number | null };
type Gap = {
  has_subject: boolean;
  others_masked?: boolean;
  per_dim?: GapDim[];
  subject_composite?: number | null;
  others_composite?: number | null;
  gap?: number | null;
};
type GapInfo = { subjectId: string | null; gap: Gap | null };
type CommentRow = { dimension: string; text: string; author: string };
type CommentResult = { masked: boolean; respondents: number; comments: CommentRow[] };

// Lead/admin surface: send a date-bound assessment to the team, then remind /
// close it. The date-bound survey is the "pre-work" you send ahead of a workshop.
// The instrument list comes from the template library (team-scope templates).
export function SendSurvey({ teamId, openSurveys, templates, status, members, gaps }: { teamId: string; openSurveys: OpenSurvey[]; templates: Pick[]; status: Record<string, Status>; members: Member[]; gaps: Record<string, GapInfo> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState(templates[0]?.key ?? "");
  const [due, setDue] = useState("");
  const [anon, setAnon] = useState("anonymous");
  const [openRoster, setOpenRoster] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [commentData, setCommentData] = useState<Record<string, CommentResult>>({});
  const [toast, setToast] = useState<string | null>(null);

  function toggleComments(id: string) {
    if (openComments === id) { setOpenComments(null); return; }
    setOpenComments(id);
    if (!commentData[id]) {
      const supabase = createClient();
      supabase.rpc("survey_comments", { p_survey: id }).then(({ data }) => {
        if (data) setCommentData((m) => ({ ...m, [id]: data as unknown as CommentResult }));
      });
    }
  }

  function setSubject(id: string, subjectId: string | null) {
    startTransition(async () => {
      const res = await setSurveySubject(id, subjectId);
      if (res.error) flash(res.error);
      else { flash(subjectId ? "Comparing that person's view vs the team" : "Cleared"); router.refresh(); }
    });
  }

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }

  function send() {
    startTransition(async () => {
      const res = await sendSurvey(teamId, kind, due || null, anon);
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
        Sends a survey to the team. Choose whether responses are anonymous or attributed to each person.
        Set a due date to schedule it ahead of a workshop.
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
      <div className="field" style={{ marginTop: 10 }}>
        <label>Responses</label>
        <select className="inp" value={anon} onChange={(e) => setAnon(e.target.value)}>
          <option value="anonymous">Anonymous — never tied to a person</option>
          <option value="attributed">Attributed — linked to each respondent&apos;s name</option>
        </select>
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
                  <button className="linkbtn" onClick={() => toggleComments(s.id)} title="Read free-text comments">Comments</button>
                  <button className="linkbtn" disabled={pending} onClick={() => remind(s.id)}>Remind</button>
                  <button className="linkbtn" style={{ color: "var(--rust)" }} disabled={pending} onClick={() => close(s.id)}>Close</button>
                </div>
                {openComments === s.id ? (
                  <div className="roster">
                    {!commentData[s.id] ? (
                      <div className="src">Loading comments…</div>
                    ) : commentData[s.id].masked ? (
                      <div className="src">Comments stay hidden until at least 3 people respond ({commentData[s.id].respondents}/3).</div>
                    ) : commentData[s.id].comments.length === 0 ? (
                      <div className="src">No written comments yet.</div>
                    ) : (
                      commentData[s.id].comments.map((c, i) => (
                        <div className="cmtrow" key={`${s.id}-c-${i}`}>
                          <span className="cmttext">“{c.text}”</span>
                          <span className="cmtauthor">— {c.author}</span>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
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
                {gaps[s.id] ? (
                  <div className="gaprow">
                    <label className="gaplab">Compare one view vs the team</label>
                    <select
                      className="inp sm"
                      value={gaps[s.id].subjectId ?? ""}
                      disabled={pending}
                      onChange={(e) => setSubject(s.id, e.target.value || null)}
                    >
                      <option value="">— no comparison —</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {gaps[s.id]?.gap?.has_subject ? <GapCard gap={gaps[s.id].gap!} /> : null}
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

// Perception gap: the subject's self-view vs the team's aggregate (min-3 masked).
function GapCard({ gap }: { gap: Gap }) {
  const masked = !!gap.others_masked || gap.others_composite == null;
  return (
    <div className="gapcard">
      <div className="gaphead">
        <div className="gapcol"><span className="gapnum">{gap.subject_composite ?? "—"}</span><span className="gapcaption">subject</span></div>
        <span className="gapvs">vs</span>
        <div className="gapcol">
          <span className={`gapnum${masked ? " muted" : ""}`}>{masked ? "···" : gap.others_composite}</span>
          <span className="gapcaption">team{masked ? " · hidden <3" : ""}</span>
        </div>
        {!masked && gap.gap != null ? (
          <span className={`gapdelta ${gap.gap > 0 ? "over" : gap.gap < 0 ? "under" : ""}`}>
            {gap.gap > 0 ? "+" : ""}{gap.gap} gap
          </span>
        ) : null}
      </div>
      {!masked && gap.per_dim ? (
        <div className="gapdims">
          {gap.per_dim.map((d) => (
            <div className="gapdim" key={d.key}>
              <span className="gapdim-l">{d.label}</span>
              <span className="gapdim-v">{d.subject ?? "—"} <span className="muted">subj</span> · {d.others ?? "—"} <span className="muted">team</span></span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
