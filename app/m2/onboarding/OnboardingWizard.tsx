"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { Icon } from "@/components/m2/Icon";
import { completeOnboarding, type OnboardingResult } from "./actions";

type Framework = {
  key: string;
  name: string;
  description: string;
  icon: string;
  tint: string;
  question_count: number;
  est_minutes: number;
  recommended: boolean;
};

type Seedling = { level: number; name: string; icon: string; blurb: string | null };

const STEPS = ["Framework", "Cadence", "Invite team"];

const CADENCES = [
  { weeks: 2, label: "Every 2 weeks", hint: "High-tempo teams" },
  { weeks: 4, label: "Every month", hint: "A steady rhythm" },
  { weeks: 6, label: "Every 6 weeks", hint: "Recommended" },
  { weeks: 12, label: "Quarterly", hint: "Leadership groups" },
];

export function OnboardingWizard({
  frameworks,
  seedling,
}: {
  frameworks: Framework[];
  seedling: Seedling;
}) {
  const [step, setStep] = useState(0);
  const [framework, setFramework] = useState<string>(
    frameworks.find((f) => f.recommended)?.key ?? frameworks[0]?.key ?? "",
  );
  const [teamName, setTeamName] = useState("");
  const [cadence, setCadence] = useState(6);
  const [invites, setInvites] = useState("");
  const [state, formAction] = useFormState<OnboardingResult, FormData>(
    completeOnboarding,
    { ok: true },
  );

  const canContinue = step === 0 ? !!framework : step === 1 ? teamName.trim().length > 0 : true;

  return (
    <div className="m2-ob">
      <form action={formAction} className="m2-ob-shell">
        {/* hidden carriers so the whole form posts on the final step */}
        <input type="hidden" name="framework_key" value={framework} />
        <input type="hidden" name="team_name" value={teamName} />
        <input type="hidden" name="cadence_weeks" value={cadence} />
        <input type="hidden" name="invites" value={invites} />

        {/* brand */}
        <div className="m2-ob-brand">
          <span className="m2-ob-logo">O</span>
          <span className="m2-ob-word">OwnTheAgenda</span>
        </div>

        {/* stepper */}
        <div className="m2-stepper">
          {STEPS.map((label, i) => (
            <div className="m2-step" key={label}>
              <span className={`m2-step-num${i < step ? " done" : i === step ? " active" : ""}`}>
                {i < step ? <Check size={12} /> : i + 1}
              </span>
              <span className={`m2-step-label${i === step ? " active" : ""}`}>{label}</span>
              {i < STEPS.length - 1 ? <span className="m2-step-line" /> : null}
            </div>
          ))}
        </div>

        {state.error ? <div className="m2-ob-error">{state.error}</div> : null}

        {/* ---------- step 1: framework ---------- */}
        {step === 0 ? (
          <>
            <h1 className="m2-ob-title">Let&rsquo;s set up your team&rsquo;s first cycle</h1>
            <p className="m2-ob-sub">
              Pick a research-backed framework to measure how your team really works. You can run
              more later — one signal at a time keeps it honest.
            </p>
            <div className="m2-fw-grid">
              {frameworks.map((f) => {
                const selected = framework === f.key;
                return (
                  <button
                    type="button"
                    key={f.key}
                    className={`m2-fw-card${selected ? " selected" : ""}`}
                    onClick={() => setFramework(f.key)}
                    aria-pressed={selected}
                  >
                    {selected ? (
                      <span className="m2-fw-check">
                        <Check size={12} />
                      </span>
                    ) : null}
                    <span className={`m2-fw-icon ${f.tint}`}>
                      <Icon name={f.icon} size={21} />
                    </span>
                    <div className="m2-fw-name">{f.name}</div>
                    <div className="m2-fw-desc">{f.description}</div>
                    <span className={`m2-pill ${f.tint}`} style={{ marginTop: 13 }}>
                      {f.question_count} questions · ~{f.est_minutes} min
                    </span>
                  </button>
                );
              })}
            </div>

            {/* journey seedling card */}
            <div className="m2-seed">
              <span className="m2-seed-ring">
                <svg width="56" height="56" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="#eceadf" strokeWidth="5" />
                  <circle cx="28" cy="28" r="24" fill="none" stroke="var(--green)" strokeWidth="5" strokeDasharray="150.8" strokeDashoffset="135" strokeLinecap="round" transform="rotate(-90 28 28)" />
                </svg>
                <span className="m2-seed-ic">
                  <Icon name={seedling.icon} size={22} />
                </span>
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    Level {seedling.level} · {seedling.name}
                  </span>
                  <span className="m2-pill internal">Team journey</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#585850", lineHeight: 1.5 }}>
                  {seedling.blurb ??
                    "Your team unlocks its first milestone the moment everyone completes the assessment. Growth is rewarded by consistency — not high scores."}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {/* ---------- step 2: cadence ---------- */}
        {step === 1 ? (
          <>
            <h1 className="m2-ob-title">Name your team and set the cadence</h1>
            <p className="m2-ob-sub">
              A regular rhythm of measuring and talking is what compounds. You can change this any
              time.
            </p>
            <div className="m2-ob-form">
              <div className="m2-field">
                <label className="m2-label" htmlFor="ob-team">Team name</label>
                <input
                  id="ob-team"
                  className="m2-input"
                  placeholder="e.g. Product Squad"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="m2-field">
                <span className="m2-label">Re-measure cadence</span>
                <div className="m2-cad-grid">
                  {CADENCES.map((c) => (
                    <button
                      type="button"
                      key={c.weeks}
                      className={`m2-cad${cadence === c.weeks ? " selected" : ""}`}
                      onClick={() => setCadence(c.weeks)}
                      aria-pressed={cadence === c.weeks}
                    >
                      <b>{c.label}</b>
                      <span>{c.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {/* ---------- step 3: invite ---------- */}
        {step === 2 ? (
          <>
            <h1 className="m2-ob-title">Invite your team</h1>
            <p className="m2-ob-sub">
              Add the people who&rsquo;ll take the assessment. They&rsquo;ll get an invite to join{" "}
              {teamName || "your team"}. You can also do this later.
            </p>
            <div className="m2-ob-form">
              <div className="m2-field">
                <label className="m2-label" htmlFor="ob-invites">Email addresses</label>
                <textarea
                  id="ob-invites"
                  className="m2-input"
                  rows={5}
                  placeholder="anna@company.com, jonas@company.com…"
                  value={invites}
                  onChange={(e) => setInvites(e.target.value)}
                  style={{ resize: "vertical", lineHeight: 1.6 }}
                />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Separate addresses with commas, spaces or new lines.
                </span>
              </div>
            </div>
          </>
        ) : null}

        {/* footer */}
        <div className="m2-ob-foot">
          {step > 0 ? (
            <button type="button" className="m2-btn sec" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft size={15} /> Back
            </button>
          ) : (
            <Link href="/m2/dashboard" className="m2-btn ghost">
              I&rsquo;ll explore first
            </Link>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="m2-btn"
              disabled={!canContinue}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <FinishButton />
          )}
        </div>
      </form>
    </div>
  );
}

function FinishButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="m2-btn" disabled={pending}>
      {pending ? "Setting up…" : "Create team & start cycle"}
      {!pending ? <ArrowRight size={15} /> : null}
    </button>
  );
}
