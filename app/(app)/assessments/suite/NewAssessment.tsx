"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sendSurvey } from "../actions";

// "New assessment" — pick a team-scoped instrument + a team, start an open
// survey instance, and go straight to the engine (the live status / distribute
// view). Backed by sendSurvey -> create_survey.
export function NewAssessment({
  teams,
  templates,
  onClose,
}: {
  teams: { id: string; name: string }[];
  templates: { key: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState(templates[0]?.key ?? "");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [anon, setAnon] = useState("anonymous");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    if (!kind || !teamId) { setError("Pick an instrument and a team."); return; }
    start(async () => {
      const res = await sendSurvey(teamId, kind, due || null, anon);
      if (res.error) { setError(res.error); return; }
      if (res.id) router.push(`/assessments/status/${res.id}`);
      else onClose();
    });
  }

  return (
    <div className="na-overlay" onClick={onClose}>
      <div className="na-modal" onClick={(e) => e.stopPropagation()}>
        <div className="na-head">
          <div>
            <div className="na-eyebrow">New assessment</div>
            <h2 className="na-title">Start an assessment</h2>
          </div>
          <button className="na-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {templates.length ? (
          <div className="na-body">
            <p className="na-lead">Pick an instrument and the team to send it to. It opens immediately — you can distribute the link and watch responses on the next screen.</p>
            <div className="na-field">
              <label>Instrument</label>
              <select className="inp" value={kind} onChange={(e) => setKind(e.target.value)}>
                {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </div>
            <div className="na-field">
              <label>Team</label>
              <select className="inp" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="na-two">
              <div className="na-field">
                <label>Responses</label>
                <select className="inp" value={anon} onChange={(e) => setAnon(e.target.value)}>
                  <option value="anonymous">Anonymous (aggregate only)</option>
                  <option value="attributed">Attributed (names visible to the lead)</option>
                </select>
              </div>
              <div className="na-field">
                <label>Closes <span className="opt">(optional)</span></label>
                <input className="inp" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
            </div>
            {error ? <div className="form-err">{error}</div> : null}
            <div className="na-actions">
              <button className="btn-sec" onClick={onClose} disabled={pending}>Cancel</button>
              <button className="btn-prim" onClick={go} disabled={pending || !kind || !teamId}>{pending ? "Starting…" : "Start assessment →"}</button>
            </div>
          </div>
        ) : (
          <div className="na-body">
            <p className="na-lead">There are no team assessments to send yet. Build one first — then start it here.</p>
            <div className="na-actions">
              <button className="btn-sec" onClick={onClose}>Cancel</button>
              <Link className="btn-prim" href="/builder">＋ Build assessment</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
