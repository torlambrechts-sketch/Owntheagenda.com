"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SideWindow } from "@/components/SideWindow";
import { sendSurvey } from "../actions";

// "New assessment" — pick a team-scoped instrument + a team, start an open
// survey instance, and go straight to the engine (the live status / distribute
// view). Backed by sendSurvey -> create_survey.
//
// Rendered in the Side Window (DESIGN §7) — the design system's mandated surface
// for any create/edit action, so you never lose your place on the suite list
// underneath. Title, scale and threshold are properties of the instrument and
// are set in the Builder, so this send form only captures what's chosen at
// send-time: instrument, team, anonymity and an optional close date.
export function NewAssessment({
  open,
  teams,
  templates,
  onClose,
}: {
  open: boolean;
  teams: { id: string; name: string }[];
  templates: { key: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState(templates[0]?.key ?? "");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [anon, setAnon] = useState<"anonymous" | "attributed">("anonymous");
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
    <SideWindow
      open={open}
      onClose={onClose}
      title="New assessment"
      subtitle={templates.length ? "Send a survey or risk assessment to a team" : "Nothing to send yet"}
      size="compact"
      footer={
        templates.length ? (
          <>
            <button className="btn-sec" onClick={onClose} disabled={pending}>Cancel</button>
            <div className="right">
              <button className="btn-prim" onClick={go} disabled={pending || !kind || !teamId}>{pending ? "Starting…" : "Start assessment →"}</button>
            </div>
          </>
        ) : (
          <>
            <button className="btn-sec" onClick={onClose}>Cancel</button>
            <div className="right">
              <Link className="btn-prim" href="/builder">＋ Build assessment</Link>
            </div>
          </>
        )
      }
    >
      {templates.length ? (
        <>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 16px" }}>
            Pick an instrument and the team to send it to. It opens immediately — you can distribute the link and watch responses on the next screen.
          </p>

          <div className="field">
            <label htmlFor="na-instrument">Instrument</label>
            <select className="inp" id="na-instrument" value={kind} onChange={(e) => setKind(e.target.value)}>
              {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="na-team">Team</label>
            <select className="inp" id="na-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Responses</label>
            <div className="seg" role="radiogroup" aria-label="Response anonymity">
              <button type="button" role="radio" aria-checked={anon === "anonymous"} className={`segbtn${anon === "anonymous" ? " on" : ""}`} onClick={() => setAnon("anonymous")}>Anonymous</button>
              <button type="button" role="radio" aria-checked={anon === "attributed"} className={`segbtn${anon === "attributed" ? " on" : ""}`} onClick={() => setAnon("attributed")}>Attributed</button>
            </div>
            <div className="form-note">
              {anon === "anonymous"
                ? "Identities are stripped on submit; only aggregates of the minimum response count are shown. Required for psychosocial surveys."
                : "Names are visible to the team lead. Use only where attribution is appropriate and expected."}
            </div>
          </div>

          <div className="field">
            <label htmlFor="na-due">Closes <span className="opt">(optional)</span></label>
            <input className="inp" id="na-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <div className="form-note">Leave empty to keep the assessment open until you close it manually.</div>
          </div>

          {error ? <div className="form-err">{error}</div> : null}
        </>
      ) : (
        <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--muted)", margin: 0 }}>
          There are no team assessments to send yet. Build one first — then start it here.
        </p>
      )}
    </SideWindow>
  );
}
