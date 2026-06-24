"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SideWindow } from "@/components/SideWindow";
import { sendSurveyMulti } from "../actions";

// "New assessment" — the handoff's stepped send wizard, in the Side Window
// (DESIGN §7). Template → Recipients → Schedule → Review, then launch. Maps to
// the real model: one survey instance is opened per selected team (the suite
// lists surveys per team), anonymity + close date carried through create_survey.
//
// Deferred (need new infra, not faked here): SMS/Slack/Teams delivery channels,
// no-login external-email send, scheduled future open, and per-survey
// configurable result-masking threshold. Email invite (in-app notification)
// and the public link are the channels that work today.

type Step = 0 | 1 | 2 | 3;
const STEP_LABELS = ["Template", "Recipients", "Schedule", "Review"] as const;

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
  const [step, setStep] = useState<Step>(0);
  const [kind, setKind] = useState(templates[0]?.key ?? "");
  const [teamIds, setTeamIds] = useState<string[]>(teams[0] ? [teams[0].id] : []);
  const [anon, setAnon] = useState<"anonymous" | "attributed">("anonymous");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tName = templates.find((t) => t.key === kind)?.name ?? "—";
  const chosenTeams = teams.filter((t) => teamIds.includes(t.id));

  function reset() { setStep(0); setError(null); }
  function close() { reset(); onClose(); }
  function toggleTeam(id: string) {
    setTeamIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function next() {
    setError(null);
    if (step === 0 && !kind) { setError("Pick a template."); return; }
    if (step === 1 && teamIds.length === 0) { setError("Select at least one team."); return; }
    if (step < 3) { setStep((s) => (s + 1) as Step); return; }
    launch();
  }
  function back() { setError(null); setStep((s) => (Math.max(0, s - 1) as Step)); }

  function launch() {
    setError(null);
    if (!kind || teamIds.length === 0) { setError("Pick a template and at least one team."); return; }
    start(async () => {
      const res = await sendSurveyMulti(teamIds, kind, due || null, anon);
      if (res.error) { setError(res.error); return; }
      const first = res.ids?.[0];
      if (first) router.push(`/assessments/status/${first}`);
      else { close(); router.refresh(); }
    });
  }

  const noTemplates = templates.length === 0;

  return (
    <SideWindow
      open={open}
      onClose={close}
      title="New assessment"
      subtitle={noTemplates ? "Nothing to send yet" : `Step ${step + 1} of 4 · ${STEP_LABELS[step]}`}
      footer={
        noTemplates ? (
          <>
            <button className="btn-sec" onClick={close}>Cancel</button>
            <div className="right"><Link className="btn-prim" href="/assessments/builder">＋ Build assessment</Link></div>
          </>
        ) : (
          <>
            <button className="btn-sec" onClick={step === 0 ? close : back} disabled={pending}>{step === 0 ? "Cancel" : "‹ Back"}</button>
            <div className="right">
              <button className="btn-prim" onClick={next} disabled={pending}>
                {pending ? "Launching…" : step < 3 ? "Continue →" : "Launch assessment"}
              </button>
            </div>
          </>
        )
      }
    >
      {noTemplates ? (
        <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--muted)", margin: 0 }}>
          There are no team assessments to send yet. Build one first — then start it here.
        </p>
      ) : (
        <>
          {/* step bar */}
          <div className="sw-steps">
            {STEP_LABELS.map((label, i) => (
              <button key={label} className={`sw-step${i === step ? " on" : ""}${i < step ? " done" : ""}`} onClick={() => i <= step && setStep(i as Step)} disabled={i > step}>
                <span className="sw-step-n">{i < step ? "✓" : i + 1}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>

          {error ? <div className="form-err">{error}</div> : null}

          {/* STEP 0 — template */}
          {step === 0 ? (
            <div className="field">
              <label>Start from a template</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {templates.map((t) => (
                  <button key={t.key} type="button" onClick={() => setKind(t.key)} className={`sw-choice${kind === t.key ? " on" : ""}`}>
                    <span className="sw-choice-nm">{t.name}</span>
                    {kind === t.key ? <span className="sw-choice-ck">✓</span> : null}
                  </button>
                ))}
              </div>
              <Link href="/assessments/builder" className="addlink" style={{ marginTop: 12 }}>＋ Build from scratch in the Builder</Link>
            </div>
          ) : null}

          {/* STEP 1 — recipients */}
          {step === 1 ? (
            <>
              <div className="field">
                <label>Teams to send to <span className="opt">({chosenTeams.length} selected · {teamIds.length === 0 ? "none" : ""})</span></label>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {teams.map((t) => {
                    const on = teamIds.includes(t.id);
                    return (
                      <label key={t.id} className={`sw-team${on ? " on" : ""}`} onClick={() => toggleTeam(t.id)}>
                        <span className={`chk${on ? " on" : ""}`} aria-hidden>{on ? "✓" : ""}</span>
                        <span style={{ flex: 1, fontWeight: 600 }}>{t.name}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="form-note">One assessment instance opens for each team you select.</div>
              </div>
              <div className="field">
                <label>Responses</label>
                <div className="seg" role="radiogroup" aria-label="Response anonymity">
                  <button type="button" role="radio" aria-checked={anon === "anonymous"} className={`segbtn${anon === "anonymous" ? " on" : ""}`} onClick={() => setAnon("anonymous")}>Anonymous</button>
                  <button type="button" role="radio" aria-checked={anon === "attributed"} className={`segbtn${anon === "attributed" ? " on" : ""}`} onClick={() => setAnon("attributed")}>Attributed</button>
                </div>
                <div className="form-note">
                  {anon === "anonymous"
                    ? "Identities are stripped on submit; results show only in aggregate once the minimum number of people respond."
                    : "Names are visible to the team lead. Use only where attribution is appropriate and expected."}
                </div>
              </div>
            </>
          ) : null}

          {/* STEP 2 — schedule */}
          {step === 2 ? (
            <>
              <div className="field">
                <label>Launch</label>
                <div className="sw-launch">Starts now — invitations are sent to each team as an in-app notification when you launch.</div>
              </div>
              <div className="field">
                <label htmlFor="na-due">Closes <span className="opt">(optional)</span></label>
                <input className="inp" id="na-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                <div className="form-note">Leave empty to keep the assessment open until you close it manually.</div>
              </div>
            </>
          ) : null}

          {/* STEP 3 — review */}
          {step === 3 ? (
            <div className="sw-review">
              <ReviewRow k="Template" v={tName} onEdit={() => setStep(0)} />
              <ReviewRow k={`Recipients · ${chosenTeams.length} ${chosenTeams.length === 1 ? "team" : "teams"}`} v={chosenTeams.map((t) => t.name).join(", ") || "None selected"} onEdit={() => setStep(1)} />
              <ReviewRow k="Schedule" v={`Starts now${due ? ` · closes ${due}` : ""}`} onEdit={() => setStep(2)} />
              <ReviewRow k="Privacy" v={anon === "anonymous" ? "Anonymous · aggregate only" : "Attributed responses"} onEdit={() => setStep(1)} />
              <div className="a-note" style={{ marginTop: 4 }}>A person reviews results before any mitigation workshop is triggered. Below-band sections are flagged, never auto-actioned.</div>
            </div>
          ) : null}
        </>
      )}
    </SideWindow>
  );
}

function ReviewRow({ k, v, onEdit }: { k: string; v: string; onEdit: () => void }) {
  return (
    <div className="sw-rev-row">
      <div style={{ minWidth: 0 }}>
        <div className="sw-rev-k">{k}</div>
        <div className="sw-rev-v">{v}</div>
      </div>
      <button className="linkbtn" onClick={onEdit}>Edit</button>
    </div>
  );
}
