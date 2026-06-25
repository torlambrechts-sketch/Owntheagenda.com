"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SideWindow } from "@/components/SideWindow";
import { sendAssessment } from "../actions";

// "New assessment" — the handoff's stepped send wizard, in the Side Window
// (DESIGN §7). Five steps: Template → Recipients → Delivery → Schedule → Review.
// Backed by create_assessment: ONE assessment targets several teams plus
// individual / external email invites, launched now / scheduled / as a draft.
//
// Channels: Email and a public no-login URL are wired. SMS / Slack / Teams are
// shown but disabled ("coming soon") — the delivery integrations aren't built.

type Step = 0 | 1 | 2 | 3 | 4;
const STEP_LABELS = ["Template", "Recipients", "Delivery", "Schedule", "Review"] as const;

type Team = { id: string; name: string; count?: number };

const CHANNELS: { key: string; title: string; desc: string; icon: string; enabled: boolean }[] = [
  { key: "email", title: "Email", desc: "Invite sent to each recipient as an in-app notification (and email when configured).", icon: "✉", enabled: true },
  { key: "url", title: "Public link", desc: "Anyone with the no-login link can respond — anonymous only.", icon: "🔗", enabled: true },
  { key: "sms", title: "SMS", desc: "Text message with a short link.", icon: "💬", enabled: false },
  { key: "slack", title: "Slack", desc: "Post to a channel or DM via the Slack app.", icon: "#", enabled: false },
  { key: "teams", title: "Microsoft Teams", desc: "Deliver through the Teams integration.", icon: "▦", enabled: false },
];

export function NewAssessment({
  open,
  teams,
  templates,
  initialKind = null,
  onClose,
}: {
  open: boolean;
  teams: Team[];
  templates: { key: string; name: string }[];
  initialKind?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>(0);
  const presetKind = initialKind && templates.some((t) => t.key === initialKind) ? initialKind : null;
  const [title, setTitle] = useState(presetKind ? (templates.find((t) => t.key === presetKind)?.name ?? "") : "");
  const [kind, setKind] = useState(presetKind ?? templates[0]?.key ?? "");
  const [teamIds, setTeamIds] = useState<string[]>(teams[0] ? [teams[0].id] : []);
  const [emails, setEmails] = useState("");
  const [anon, setAnon] = useState<"anonymous" | "attributed">("anonymous");
  const [minP, setMinP] = useState(5);
  const [channels, setChannels] = useState<Record<string, boolean>>({ email: true, url: false, sms: false, slack: false, teams: false });
  const [launch, setLaunch] = useState<"now" | "scheduled">("now");
  const [startAt, setStartAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminders, setReminders] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tName = templates.find((t) => t.key === kind)?.name ?? "—";
  const chosenTeams = teams.filter((t) => teamIds.includes(t.id));
  const emailList = useMemo(() => (emails.match(/[^\s,;]+@[^\s,;]+/g) ?? []), [emails]);
  const groupPeople = chosenTeams.reduce((a, t) => a + (t.count ?? 0), 0);
  const totalRecipients = groupPeople + emailList.length;
  const smallGroupWarn = anon === "anonymous" && chosenTeams.some((t) => (t.count ?? 0) > 0 && (t.count ?? 0) < minP);
  const enabledChannels = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);

  function reset() {
    setStep(0); setError(null);
  }
  function close() { reset(); onClose(); }
  function toggleTeam(id: string) {
    setTeamIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }
  function toggleChannel(key: string) {
    const ch = CHANNELS.find((c) => c.key === key);
    if (!ch?.enabled) return;
    setChannels((c) => ({ ...c, [key]: !c[key] }));
  }

  function next() {
    setError(null);
    if (step === 0 && !kind && !title.trim()) { setError("Pick a template or give the assessment a title."); return; }
    if (step === 1 && teamIds.length === 0) { setError("Select at least one team — an assessment is owned by a team (you can add individual emails as well)."); return; }
    if (step === 2 && enabledChannels.length === 0) { setError("Choose at least one delivery channel."); return; }
    if (step === 3 && launch === "scheduled" && !startAt) { setError("Set a start date, or choose “Start now”."); return; }
    if (step < 4) { setStep((s) => (s + 1) as Step); return; }
    submit();
  }
  function back() { setError(null); setStep((s) => (Math.max(0, s - 1) as Step)); }

  function submit() {
    setError(null);
    // url channel only makes sense for anonymous assessments
    const channelsOut = enabledChannels.filter((c) => c !== "url" || anon === "anonymous");
    const launchMode: "now" | "scheduled" | "draft" = launch === "now" ? "now" : startAt ? "scheduled" : "draft";
    start(async () => {
      const res = await sendAssessment({
        title: title.trim(),
        kind: kind || null,
        teamIds,
        emails: emailList,
        anonymity: anon,
        minParticipants: minP,
        channels: channelsOut,
        launch: launchMode,
        startAt: startAt || null,
        dueAt: dueAt || null,
        reminders,
      });
      if (res.error) { setError(res.error); return; }
      close();
      router.refresh();
    });
  }

  const noTemplates = templates.length === 0;
  const launchLabel = launch === "now" ? "Launch assessment" : startAt ? "Schedule assessment" : "Save as draft";

  return (
    <SideWindow
      open={open}
      onClose={close}
      title="New assessment"
      subtitle={`Step ${step + 1} of 5 · ${STEP_LABELS[step]}`}
      footer={
        <>
          <button className="btn-sec" onClick={step === 0 ? close : back} disabled={pending}>{step === 0 ? "Cancel" : "‹ Back"}</button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--faint)", alignSelf: "center" }}>Step {step + 1} of 5</span>
          <div className="right">
            <button className="btn-prim" onClick={next} disabled={pending}>
              {pending ? "Working…" : step < 4 ? "Continue →" : launchLabel}
            </button>
          </div>
        </>
      }
    >
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

      {/* STEP 0 — template + title */}
      {step === 0 ? (
        <>
          <div className="field">
            <label htmlFor="na-title">Title</label>
            <input className="inp" id="na-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Team performance — Q3" />
          </div>
          {noTemplates ? (
            <p className="form-note">No templates yet. <Link href="/assessments/builder" className="addlink">Build one in the Builder →</Link></p>
          ) : (
            <div className="field">
              <label>Start from a template</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {templates.map((t) => (
                  <button key={t.key} type="button" onClick={() => { setKind(t.key); if (!title.trim()) setTitle(t.name); }} className={`sw-choice${kind === t.key ? " on" : ""}`}>
                    <span className="sw-choice-nm">{t.name}</span>
                    {kind === t.key ? <span className="sw-choice-ck">✓</span> : null}
                  </button>
                ))}
              </div>
              <Link href="/assessments/builder" className="addlink" style={{ marginTop: 12 }}>✎ Build from scratch instead</Link>
            </div>
          )}
        </>
      ) : null}

      {/* STEP 1 — recipients */}
      {step === 1 ? (
        <>
          <div className="field">
            <label>Internal groups <span className="opt">({chosenTeams.length} selected)</span></label>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {teams.map((t) => {
                const on = teamIds.includes(t.id);
                return (
                  <label key={t.id} className={`sw-team${on ? " on" : ""}`} onClick={() => toggleTeam(t.id)}>
                    <span className={`chk${on ? " on" : ""}`} aria-hidden>{on ? "✓" : ""}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{t.name}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{t.count ?? 0} people</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label htmlFor="na-emails">Individuals &amp; external emails <span className="opt">(internal or external partners)</span></label>
            <textarea className="inp" id="na-emails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="anna@acme.no, partner@firm.com — one per line or comma-separated" style={{ minHeight: 84, resize: "vertical", lineHeight: 1.5 }} />
            <div className="form-note">{emailList.length} email{emailList.length === 1 ? "" : "s"} will receive a no-login link.</div>
          </div>

          {/* recipients summary */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4, marginBottom: 16 }}>
            <span className="sw-recsum green">{chosenTeams.length} groups · {groupPeople} people</span>
            <span className="sw-recsum blue">{emailList.length} individuals</span>
            <span className="sw-recsum total">Total ≈ {totalRecipients}</span>
          </div>

          {/* anonymity + min participants */}
          <div className="sw-anonbox">
            <div className="sw-anonhead">
              <button type="button" className={`sw-switch${anon === "anonymous" ? " on" : ""}`} onClick={() => setAnon((a) => (a === "anonymous" ? "attributed" : "anonymous"))} aria-pressed={anon === "anonymous"}><span /></button>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Anonymous responses</div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Identities are stripped on submit and cannot be recovered.</div>
              </div>
            </div>
            {anon === "anonymous" ? (
              <div className="sw-anonbody">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Minimum participants to show results</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Aggregates stay hidden until this many respond — protects small groups (floor 3).</div>
                  </div>
                  <div className="sw-stepper">
                    <button type="button" onClick={() => setMinP((n) => Math.max(3, n - 1))} aria-label="decrease">−</button>
                    <span>{minP}</span>
                    <button type="button" onClick={() => setMinP((n) => Math.min(50, n + 1))} aria-label="increase">+</button>
                  </div>
                </div>
                {smallGroupWarn ? (
                  <div className="sw-warn">A selected group is smaller than {minP} people — its results stay hidden until the threshold is met or it’s combined with another group.</div>
                ) : null}
              </div>
            ) : (
              <div className="sw-anonbody"><div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Names are visible to the team lead. Use only where attribution is appropriate and expected.</div></div>
            )}
          </div>
        </>
      ) : null}

      {/* STEP 2 — delivery */}
      {step === 2 ? (
        <div className="field">
          <label>How should it be delivered?</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CHANNELS.map((c) => {
              const on = !!channels[c.key];
              const disabled = !c.enabled;
              return (
                <label key={c.key} className={`sw-team${on ? " on" : ""}${disabled ? " disabled" : ""}`} onClick={() => toggleChannel(c.key)} aria-disabled={disabled}>
                  <span className="sw-chanic" aria-hidden>{c.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>{c.title}{disabled ? <span className="pill sm draft">Coming soon</span> : null}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{c.desc}</span>
                  </span>
                  <span className={`chk${on ? " on" : ""}`} aria-hidden>{on ? "✓" : ""}</span>
                </label>
              );
            })}
          </div>
          {channels.url && anon === "anonymous" ? (
            <div className="form-note" style={{ marginTop: 10 }}>A no-login public link is generated when you launch — find it on the assessment’s page to share or copy.</div>
          ) : null}
          {channels.url && anon === "attributed" ? (
            <div className="sw-warn" style={{ marginTop: 10 }}>A public link requires anonymous responses. Switch the assessment to anonymous on the Recipients step to use it.</div>
          ) : null}
        </div>
      ) : null}

      {/* STEP 3 — schedule */}
      {step === 3 ? (
        <>
          <div className="field">
            <label>When does it run?</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {([["now", "Start now", "Send invitations immediately."], ["scheduled", "Schedule", "Launch on the start date."]] as const).map(([key, t, d]) => (
                <button key={key} type="button" onClick={() => setLaunch(key)} className={`sw-choice${launch === key ? " on" : ""}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 3, textAlign: "left" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>{d}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label htmlFor="na-start">{launch === "now" ? "Start date" : "Launch date"}</label>
              <input className="inp" id="na-start" type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} disabled={launch === "now"} />
            </div>
            <div>
              <label htmlFor="na-due">Due date <span className="opt">(optional)</span></label>
              <input className="inp" id="na-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>
          <label className="sw-team" onClick={() => setReminders((r) => !r)} style={{ cursor: "pointer" }}>
            <button type="button" className={`sw-switch${reminders ? " on" : ""}`} aria-pressed={reminders} onClick={(e) => { e.preventDefault(); setReminders((r) => !r); }}><span /></button>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Automatic reminders</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Nudge non-respondents before the due date.</span>
            </span>
          </label>
        </>
      ) : null}

      {/* STEP 4 — review */}
      {step === 4 ? (
        <div className="sw-review">
          <ReviewRow k="Title" v={title.trim() || tName} onEdit={() => setStep(0)} />
          <ReviewRow k="Template" v={kind ? tName : "Build from scratch"} onEdit={() => setStep(0)} />
          <ReviewRow k={`Recipients · ${totalRecipients} total`} v={[chosenTeams.length ? `${groupPeople} in ${chosenTeams.map((t) => t.name).join(", ")}` : "", emailList.length ? `${emailList.length} individual${emailList.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "None selected"} onEdit={() => setStep(1)} />
          <ReviewRow k="Delivery" v={enabledChannels.map((c) => CHANNELS.find((x) => x.key === c)?.title ?? c).join(", ") || "None"} onEdit={() => setStep(2)} />
          <ReviewRow k="Schedule" v={`${launch === "now" ? "Starts now" : startAt ? `Scheduled ${startAt}` : "Draft (no date)"}${dueAt ? ` · due ${dueAt}` : ""}${reminders ? " · reminders on" : ""}`} onEdit={() => setStep(3)} />
          <ReviewRow k="Privacy" v={anon === "anonymous" ? `Anonymous · min ${minP} to show results` : "Attributed responses"} onEdit={() => setStep(1)} />
          <div className="humannote" style={{ marginTop: 8 }}>
            <span className="grounded">Grounded</span>
            <div style={{ marginTop: 2 }}>A person reviews results before any follow-up workshop is triggered. Below-band sections are flagged, never auto-actioned.</div>
          </div>
        </div>
      ) : null}
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
