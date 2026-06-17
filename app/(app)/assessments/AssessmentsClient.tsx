"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { initials } from "@/lib/util";
import { runPulse, respondPulse, closePulse, remindPulse } from "./actions";

export type Delta = { delta: number; prevName: string } | null;
export type Participant = { name: string; completed: boolean };

export type Dynamic = {
  dynamic: string;
  label: string;
  question: string;
  pct: number | null;
  responses: number;
  target_low: number;
  target_high: number;
  in_band: boolean | null;
};
export type FpMember = {
  teamMemberId: string;
  name: string;
  roleTitle: string | null;
  consentShare: boolean;
  isSelf: boolean;
  traits: { trait: string; lo: number; hi: number }[];
};

function readState(d: Dynamic) {
  if (!d.responses) return { txt: "No responses", cls: "" };
  if (d.in_band) return { txt: "In band", cls: "in" };
  if (d.pct != null && d.pct < d.target_low) return { txt: "Below band", cls: "below" };
  return { txt: "Above band", cls: "below" };
}

export function AssessmentsClient({
  teamId,
  teamName,
  canManage,
  isTeamMember,
  openPulse,
  latestPulseName,
  dynamics,
  deltas,
  members,
  participation,
}: {
  teamId: string;
  teamName: string;
  canManage: boolean;
  isTeamMember: boolean;
  openPulse: { id: string; name: string } | null;
  latestPulseName: string | null;
  dynamics: Dynamic[];
  deltas: Record<string, Delta>;
  members: FpMember[];
  participation: Participant[] | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [runOpen, setRunOpen] = useState(false);
  const [pulseName, setPulseName] = useState("");

  const [respOpen, setRespOpen] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(dynamics.map((d) => [d.dynamic, 3])),
  );

  const inBand = dynamics.filter((d) => d.in_band).length;
  const withData = dynamics.some((d) => d.responses > 0);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function submitRun() {
    setError(null);
    const res = await runPulse(teamId, pulseName || "New pulse");
    if (res.error) return setError(res.error);
    setRunOpen(false);
    setPulseName("");
    flash("Pulse opened");
    router.refresh();
  }
  async function submitResp() {
    setError(null);
    if (!openPulse) return;
    const res = await respondPulse(openPulse.id, scores);
    if (res.error) return setError(res.error);
    setRespOpen(false);
    flash("Response submitted");
    router.refresh();
  }
  function doClose() {
    if (!openPulse) return;
    if (!confirm("Close this pulse? Results will be finalised.")) return;
    startTransition(async () => {
      const res = await closePulse(openPulse.id);
      if (res.error) flash(res.error);
      else {
        flash("Pulse closed");
        router.refresh();
      }
    });
  }
  function doRemind() {
    if (!openPulse) return;
    startTransition(async () => {
      const res = await remindPulse(openPulse.id);
      if (res.error) flash(res.error);
      else flash(`Reminder logged for ${res.pending ?? 0} pending member(s)`);
    });
  }

  return (
    <>
      <div className="summary">
        <div className="stat">
          <div className="num">{latestPulseName ? `${inBand}/${dynamics.length}` : "—"}</div>
          <div className="lab">Dynamics in band</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num" style={{ fontSize: 18 }}>
            {openPulse ? openPulse.name : latestPulseName ?? "None"}
          </div>
          <div className="lab">{openPulse ? "Open pulse" : "Latest pulse"}</div>
        </div>
        <div className="actions">
          {isTeamMember && openPulse ? (
            <button className="btn-sec" onClick={() => setRespOpen(true)}>
              Respond to pulse
            </button>
          ) : null}
          {canManage && openPulse ? (
            <button className="btn-sec" onClick={doClose} disabled={pending}>
              Close pulse
            </button>
          ) : null}
          {canManage && !openPulse ? (
            <button className="btn-prim" onClick={() => setRunOpen(true)}>
              Run new pulse ▸
            </button>
          ) : null}
        </div>
      </div>

      {/* band visualization */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="eyebrow">Team dynamics</div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, margin: "2px 0 10px" }}>
          Where this team sits today
        </h3>
        <div className="bandlegend">
          <span><span className="swatch-band" /> Healthy target band</span>
          <span><span className="swatch-mark" /> This team</span>
        </div>

        {!withData ? (
          <div className="empty" style={{ padding: "26px 0" }}>
            No pulse responses yet. {canManage ? "Run a pulse to get started." : "Your team lead can open a pulse."}
          </div>
        ) : (
          dynamics.map((d) => {
            const r = readState(d);
            return (
              <div className="bandrow" key={d.dynamic}>
                <div className="name">
                  {d.label}
                  <small>{d.question}</small>
                </div>
                <div className="bandtrack">
                  <div
                    className="target"
                    style={{ left: `${d.target_low}%`, right: `${100 - d.target_high}%` }}
                  />
                  {d.pct != null ? (
                    <div className="marker" style={{ left: `${d.pct}%` }} />
                  ) : null}
                </div>
                <div className="read">
                  <span className={r.cls}>{r.txt}</span>
                  {d.responses ? (
                    <>
                      <br />
                      <span style={{ color: "var(--faint)" }}>
                        {d.pct}%
                        {deltas[d.dynamic]
                          ? (() => {
                              const dl = deltas[d.dynamic]!;
                              const up = dl.delta > 0;
                              const flat = dl.delta === 0;
                              return (
                                <span
                                  title={`vs ${dl.prevName}`}
                                  style={{
                                    marginLeft: 6,
                                    fontWeight: 700,
                                    color: flat
                                      ? "var(--faint)"
                                      : up
                                        ? "var(--green)"
                                        : "var(--amber)",
                                  }}
                                >
                                  {flat ? "•" : `${up ? "▲" : "▼"}${Math.abs(dl.delta)}`}
                                </span>
                              );
                            })()
                          : null}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        )}

        <div className="humannote">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div>
            The pulse informs how a session is designed; it never decides for you.
            Bands show a healthy range, not a score to beat.
            <div className="src">
              Source: {teamName} {latestPulseName ? `· ${latestPulseName}` : ""} · responses are anonymous in aggregate ·{" "}
              <span className="grounded" style={{ marginLeft: 2 }}>Grounded</span>
            </div>
          </div>
        </div>
      </div>

      {/* participation (open pulse, lead/admin) */}
      {openPulse && participation ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Open pulse · participation</div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, margin: "2px 0 0" }}>
                {participation.filter((p) => p.completed).length} of {participation.length} responded
              </h3>
            </div>
            <button
              className="btn-sec"
              style={{ marginLeft: "auto" }}
              disabled={pending}
              onClick={doRemind}
            >
              Remind pending
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th style={{ width: 120 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {participation.map((p) => (
                <tr key={p.name}>
                  <td>
                    <div className="person">
                      <span className="av">{initials(p.name)}</span>
                      {p.name}
                    </div>
                  </td>
                  <td>
                    <span className={`pill sm ${p.completed ? "open" : "internal"}`}>
                      {p.completed ? "Responded" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-note" style={{ marginTop: 10 }}>
            Email / Slack delivery is a later integration — “Remind” logs the nudge for now.
          </div>
        </div>
      ) : null}

      {/* fingerprints */}
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 12 }}>Individual fingerprints</div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th style={{ width: 130 }}>Role</th>
              <th>Signature strengths</th>
              <th style={{ width: 100 }}>Consent</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.teamMemberId}>
                <td>
                  <div className="person">
                    <span className="av">{initials(m.name)}</span>
                    {m.name}
                    {m.isSelf ? " (you)" : ""}
                  </div>
                </td>
                <td style={{ color: "var(--muted)" }}>{m.roleTitle ?? "—"}</td>
                <td>
                  {m.traits.length > 0 ? (
                    m.traits.map((t) => (
                      <span className="trait-chip" key={t.trait} title={`${t.lo}–${t.hi}`}>
                        {t.trait}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--faint)", fontStyle: "italic" }}>
                      {m.consentShare ? "Not assessed yet" : "Private"}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`pill sm ${m.consentShare ? "open" : "draft"}`}>
                    {m.consentShare ? "Shared" : "Private"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* run pulse */}
      <SideWindow
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run a new pulse"
        subtitle={teamName}
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setRunOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" onClick={submitRun}>Open pulse</button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        <div className="field">
          <label htmlFor="pulse-name">Pulse name</label>
          <input
            className="inp"
            id="pulse-name"
            value={pulseName}
            onChange={(e) => setPulseName(e.target.value)}
            placeholder="May 2026 pulse"
          />
          <div className="form-note">
            Opens a pulse for {teamName}. Each member scores five dynamics, 1–5. Results feed the band view.
          </div>
        </div>
      </SideWindow>

      {/* respond */}
      <SideWindow
        open={respOpen}
        onClose={() => setRespOpen(false)}
        title="Your pulse response"
        subtitle={openPulse?.name}
        footer={
          <>
            <button className="btn-sec" onClick={() => setRespOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" onClick={submitResp}>Submit response</button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
          1 = strongly disagree · 5 = strongly agree. Your individual answers stay private; the team only sees the aggregate.
        </p>
        {dynamics.map((d) => (
          <div className="field" key={d.dynamic}>
            <label>
              {d.label} <span className="opt">— {d.question}</span>
            </label>
            <select
              className="inp"
              value={scores[d.dynamic] ?? 3}
              onChange={(e) =>
                setScores((s) => ({ ...s, [d.dynamic]: Number(e.target.value) }))
              }
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        ))}
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
