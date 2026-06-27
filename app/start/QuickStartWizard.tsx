"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickStartSetup } from "./actions";

// Quick Start wizard — Team → Focus → Cadence → Invite, mapped onto the app's
// existing primitives (teams, Plays, invitations). Full-screen, outside the app
// shell, like the assessment builder and run surfaces.

// Each focus area maps to a curated Play (instrument + workshop). The first
// selected area, in this order, becomes the Flow we launch at the end.
const FOCUS_AREAS: { id: string; name: string; desc: string; tone: string; playKey: string }[] = [
  { id: "trust", name: "Trust & safety", desc: "Can the team speak up?", tone: "var(--green)", playKey: "psych_safety_tuneup" },
  { id: "decide", name: "Decision-making", desc: "Clear, fast, owned", tone: "var(--role)", playKey: "team_effectiveness_sprint" },
  { id: "align", name: "Alignment", desc: "Same goals, same page", tone: "var(--role)", playKey: "role_clarity_reset" },
  { id: "conflict", name: "Feedback & conflict", desc: "Healthy disagreement", tone: "var(--rust)", playKey: "clear_the_air_retro" },
  { id: "focus", name: "Strategy & focus", desc: "Right things, right order", tone: "var(--amber)", playKey: "team_effectiveness_sprint" },
  { id: "energy", name: "Energy & morale", desc: "Is the team thriving?", tone: "var(--rust)", playKey: "psych_safety_tuneup" },
];

const SIZES = ["3–5", "6–8", "9–12", "12+"];

const CADENCE: { id: string; name: string; desc: string }[] = [
  { id: "pulse", name: "Monthly pulse", desc: "A 5-minute check each month, with a short retro workshop when something dips." },
  { id: "quarter", name: "Quarterly deep-dive", desc: "A full assessment every quarter feeding a half-day team offsite." },
  { id: "oneoff", name: "One-off", desc: "A single assessment and workshop — great for a kickoff or a reset." },
];

const STEP_LABELS = ["Team", "Focus", "Cadence", "Invite"];
const STEP_HINTS = ["Tell us about your team", "Pick what matters", "Choose a rhythm", "Almost done"];

export function QuickStartWizard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [teamName, setTeamName] = useState("");
  const [size, setSize] = useState("6–8");
  const [focus, setFocus] = useState<Set<string>>(new Set(["trust"]));
  const [cadence, setCadence] = useState("quarter");
  const [inviteDraft, setInviteDraft] = useState("");
  const [invites, setInvites] = useState<string[]>([]);

  // The Play we'll launch — the first selected focus area in display order.
  const primary = FOCUS_AREAS.find((f) => focus.has(f.id)) ?? FOCUS_AREAS[0];

  function toggleFocus(id: string) {
    setFocus((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function addInvite() {
    const e = inviteDraft.trim();
    if (!e || !e.includes("@") || invites.includes(e)) {
      setInviteDraft("");
      return;
    }
    setInvites((v) => [...v, e]);
    setInviteDraft("");
  }

  const canAdvance =
    step === 1 ? !!teamName.trim() : step === 2 ? focus.size > 0 : true;

  function next() {
    setErr(null);
    if (step < 4) {
      if (canAdvance) setStep((s) => s + 1);
      return;
    }
    // Finish — run the setup, then open the dashboard.
    startTransition(async () => {
      const res = await quickStartSetup({
        workspaceId,
        teamName: teamName.trim(),
        focusKey: primary.playKey,
        cadence,
        invites,
      });
      if (res.error && !res.teamId) {
        setErr(res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="qs">
      <div className="qs-top">
        <span className="qs-logo" aria-hidden />
        <span className="qs-brand">Own<span>theagenda</span></span>
        <button className="qs-skip" onClick={() => router.push("/dashboard")}>Skip setup</button>
      </div>

      <div className="qs-body">
        <div className="qs-inner">
          <ol className="qs-stepper">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const done = step > n;
              const cur = step === n;
              return (
                <li key={label} className={`qs-stp${done ? " done" : cur ? " cur" : ""}`}>
                  <span className="qs-stp-m">{done ? "✓" : n}</span>
                  <span className="qs-stp-l">{label}</span>
                  {i < STEP_LABELS.length - 1 ? <span className="qs-stp-line" /> : null}
                </li>
              );
            })}
          </ol>

          <div className="qs-card">
            {step === 1 ? (
              <div className="qs-pane">
                <div className="qs-eyebrow">Step 1 of 4</div>
                <h1 className="qs-h">Who&rsquo;s your team?</h1>
                <p className="qs-p">Give your leadership team a name so we can tailor the assessment and workshops to them.</p>
                <label className="qs-field">
                  <span className="qs-flabel">Team name</span>
                  <input
                    className="inp"
                    value={teamName}
                    placeholder="e.g. Executive Leadership Team"
                    onChange={(e) => setTeamName(e.target.value)}
                    autoFocus
                  />
                </label>
                <div className="qs-field">
                  <span className="qs-flabel">Team size</span>
                  <div className="qs-sizes">
                    {SIZES.map((o) => (
                      <button key={o} className={`qs-size${size === o ? " on" : ""}`} onClick={() => setSize(o)}>{o}</button>
                    ))}
                  </div>
                </div>
              </div>
            ) : step === 2 ? (
              <div className="qs-pane">
                <div className="qs-eyebrow">Step 2 of 4</div>
                <h1 className="qs-h">What should we focus on?</h1>
                <p className="qs-p">Pick the areas you most want to understand. The first one sets up your team&rsquo;s starter flow — you can change these later.</p>
                <div className="qs-focus">
                  {FOCUS_AREAS.map((f) => {
                    const on = focus.has(f.id);
                    const isPrimary = on && f.id === primary.id;
                    return (
                      <button key={f.id} className={`qs-fcard${on ? " on" : ""}`} onClick={() => toggleFocus(f.id)}>
                        <span className="qs-fdot" style={{ background: f.tone }} aria-hidden />
                        <span className="qs-ftxt">
                          <span className="qs-fname">{f.name}</span>
                          <span className="qs-fdesc">{f.desc}</span>
                        </span>
                        {isPrimary ? <span className="qs-fprimary">Starter</span> : on ? <span className="qs-fcheck">✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : step === 3 ? (
              <div className="qs-pane">
                <div className="qs-eyebrow">Step 3 of 4</div>
                <h1 className="qs-h">How do you want to work?</h1>
                <p className="qs-p">Choose a rhythm for assessments and the workshop that follows. We&rsquo;ll launch your first flow with this cadence.</p>
                <div className="qs-cadence">
                  {CADENCE.map((c) => {
                    const on = cadence === c.id;
                    return (
                      <button key={c.id} className={`qs-ccard${on ? " on" : ""}`} onClick={() => setCadence(c.id)}>
                        <span className="qs-ctxt">
                          <span className="qs-cname">{c.name}</span>
                          <span className="qs-cdesc">{c.desc}</span>
                        </span>
                        <span className={`qs-radio${on ? " on" : ""}`}>{on ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="qs-pane">
                <div className="qs-eyebrow">Step 4 of 4</div>
                <h1 className="qs-h">Invite the team</h1>
                <p className="qs-p">Add the people you lead with. They&rsquo;ll get an invite to {teamName.trim() || "your team"} and the first assessment — anonymous by default.</p>
                <div className="qs-inviterow">
                  <input
                    className="inp"
                    value={inviteDraft}
                    placeholder="name@company.com"
                    onChange={(e) => setInviteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addInvite();
                      }
                    }}
                  />
                  <button className="btn-prim" onClick={addInvite}>Add</button>
                </div>
                <div className="qs-invites">
                  {invites.length === 0 ? (
                    <div className="qs-noinvite">No one added yet — add a few teammates, or skip and invite later.</div>
                  ) : (
                    invites.map((email, i) => (
                      <div className="qs-invite" key={email}>
                        <span className="qs-initials">{(email[0] ?? "?").toUpperCase()}{(email[1] ?? "").toUpperCase()}</span>
                        <span className="qs-email">{email}</span>
                        <button className="qs-irm" aria-label="Remove" onClick={() => setInvites((v) => v.filter((_, idx) => idx !== i))}>✕</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {err ? <div className="qs-err">{err}</div> : null}

            <div className="qs-foot">
              {step > 1 ? (
                <button className="btn-sec" disabled={pending} onClick={() => { setErr(null); setStep((s) => s - 1); }}>← Back</button>
              ) : null}
              <span className="qs-foot-sp" />
              <span className="qs-foot-hint">{STEP_HINTS[step - 1]}</span>
              <button className="btn-prim" disabled={!canAdvance || pending} onClick={next}>
                {pending ? "Setting up…" : step >= 4 ? "Finish & open dashboard" : "Continue"} →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
