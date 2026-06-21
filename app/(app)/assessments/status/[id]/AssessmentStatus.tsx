"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { remindSurvey, closeSurvey, setSurveyPaused } from "../../actions";

export type StatusData = {
  surveyId: string;
  name: string;
  status: string;
  teamId: string | null;
  teamName: string | null;
  openedAt: string | null;
  dueAt: string | null;
  invited: number;
  responded: number;
  masked: boolean;
  respondents: number;
  submissions: string[];
  scale: { min: number; max: number; minLabel: string; maxLabel: string };
  sections: { label: string; mean: number; pct: number; band: 0 | 1 | 2 }[];
  overall: number | null;
  threshold: number | null;
  triggered: { label: string; mean: number }[];
  linkedWorkshop: { id: string; title: string } | null;
  activity: { id: number; label: string; actor: string; at: string }[];
};

const BAND_COLOR = ["var(--rust)", "var(--amber)", "var(--green)"] as const;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : "—";
}

// Cumulative responses-over-time line from anonymous submission timestamps.
function Chart({ submissions, target }: { submissions: string[]; target: number }) {
  const W = 620, H = 170, pad = 8;
  if (!submissions.length) {
    return <div className="ast-empty">The response trend appears once results unmask (5+ responses).</div>;
  }
  const ts = submissions.map((s) => new Date(s).getTime()).sort((a, b) => a - b);
  const t0 = ts[0], t1 = Math.max(ts[ts.length - 1], t0 + 1);
  const max = Math.max(target, ts.length);
  const pts = ts.map((t, i) => ({
    x: pad + ((t - t0) / (t1 - t0)) * (W - pad * 2),
    y: H - pad - ((i + 1) / max) * (H - pad * 2),
  }));
  if (pts.length === 1) pts.unshift({ x: pad, y: H - pad });
  const line = pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - pad} L ${pts[0].x.toFixed(1)} ${H - pad} Z`;
  const targetY = H - pad - (target / max) * (H - pad * 2);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", height: H }} aria-hidden="true">
      <defs><linearGradient id="astfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--green)" stopOpacity="0.16" /><stop offset="100%" stopColor="var(--green)" stopOpacity="0" /></linearGradient></defs>
      <line x1={pad} y1={targetY} x2={W - pad} y2={targetY} stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="5 4" />
      <path d={area} fill="url(#astfill)" />
      <path d={line} fill="none" stroke="var(--green)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4.5" fill="var(--green)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 38, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  const color = pct >= 75 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--rust)";
  return (
    <svg width="108" height="108" viewBox="0 0 100 100" role="img" aria-label={`Response rate ${pct} percent`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--open-bg)" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 50 50)" />
      <text x="50" y="56" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)">{pct}%</text>
    </svg>
  );
}

export function AssessmentStatus({ data }: { data: StatusData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState(data.status);
  const closed = status === "closed";
  const paused = status === "paused";

  // Use the true response count (works for anonymous surveys too, where the
  // attributed roster can't tell who completed). Clamp the rate to 100%.
  const responded = Math.min(data.respondents, data.invited);
  const rate = data.invited ? Math.min(100, Math.round((data.respondents / data.invited) * 100)) : 0;
  const outstanding = Math.max(0, data.invited - data.respondents);
  const closesIn = daysUntil(data.dueAt);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2600); }
  function remind() {
    startTransition(async () => {
      const res = await remindSurvey(data.surveyId);
      if (res.error) flash(res.error);
      else { flash(typeof res.pending === "number" ? `Reminder sent to ${res.pending} ${res.pending === 1 ? "person" : "people"}` : "Reminder sent"); router.refresh(); }
    });
  }
  function close() {
    if (!confirm("Close this assessment? Respondents can no longer submit.")) return;
    startTransition(async () => {
      const res = await closeSurvey(data.surveyId);
      if (res.error) flash(res.error);
      else { setStatus("closed"); flash("Assessment closed"); router.refresh(); }
    });
  }
  function togglePause() {
    startTransition(async () => {
      const res = await setSurveyPaused(data.surveyId, !paused);
      if (res.error) flash(res.error);
      else { setStatus(paused ? "open" : "paused"); flash(paused ? "Assessment resumed" : "Assessment paused"); router.refresh(); }
    });
  }

  const kpis = [
    { title: "Responses", big: String(data.respondents), sub: `of ${data.invited} invited`, subColor: "var(--muted)" },
    { title: "Response rate", big: `${rate}%`, sub: "target ≥ 75%", subColor: rate >= 75 ? "var(--green)" : "var(--amber)" },
    { title: "Outstanding", big: String(outstanding), sub: outstanding ? "not yet responded" : "everyone responded", subColor: outstanding ? "var(--amber)" : "var(--green)" },
    { title: closed ? "Closed" : paused ? "Status" : "Closes in", big: closed ? "—" : paused ? "Paused" : closesIn != null ? (closesIn <= 0 ? "due" : `${closesIn}d`) : "—", sub: data.dueAt ? fmtDate(data.dueAt) : "no due date", subColor: "var(--muted)" },
  ];

  return (
    <div>
      <div className="a-ps" style={{ marginBottom: 10 }}>
        <Link href="/assessments" className="linkbtn">Assessments</Link> › {data.name} › Live status
      </div>
      <div className="a-phead" style={{ marginBottom: 18 }}>
        <div>
          <div className="a-pt">{data.name}{paused ? " — paused" : !closed ? " — live" : ""}</div>
          <div className="a-ps">
            {data.teamName ? `${data.teamName} · ` : ""}{data.openedAt ? `opened ${fmtDate(data.openedAt)} · ` : ""}
            {closed ? "closed" : paused ? "paused" : closesIn != null ? (closesIn <= 0 ? "closing now" : `closes in ${closesIn} days`) : "open"} · {data.invited} invited
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`pill sm ${closed ? "draft" : paused ? "internal" : "open"}`}>{closed ? "Closed" : paused ? "Paused" : "Collecting"}</span>
          {!closed ? (
            <>
              <button className="btn-prim" disabled={pending} onClick={remind}>Send reminder</button>
              <button className="btn-sec" disabled={pending} onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
              <button className="btn-sec" disabled={pending} onClick={close}>Close</button>
            </>
          ) : null}
        </div>
      </div>

      <div className="ast-kpis">
        {kpis.map((k) => (
          <div className="ast-kpi" key={k.title}>
            <div className="ast-kpi-t">{k.title}</div>
            <div className="ast-kpi-big">{k.big}</div>
            <div className="ast-kpi-sub" style={{ color: k.subColor }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="ast-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="a-ovcard">
            <div className="ast-card-h"><span>Responses over time</span><span className="ast-card-sub">cumulative</span></div>
            <Chart submissions={data.submissions} target={Math.round(data.invited * 0.75)} />
          </div>
          <div className="a-ovcard" style={{ padding: 0, overflow: "hidden" }}>
            <div className="ast-card-h" style={{ padding: "15px 18px 0" }}><span>Section scores</span><span className="ast-card-sub">on a {data.scale.min}–{data.scale.max} scale</span></div>
            {data.masked || !data.sections.length ? (
              <div className="ast-empty" style={{ margin: 18 }}>Section means stay hidden until enough people respond.</div>
            ) : (
              <div style={{ padding: "12px 8px 8px" }}>
                {data.sections.map((s) => (
                  <div className="ast-secrow" key={s.label}>
                    <div className="ast-secname">{s.label}</div>
                    <div className="ast-secbar"><span style={{ width: `${s.pct}%`, background: BAND_COLOR[s.band] }} /></div>
                    <div className="ast-secmean" style={{ color: BAND_COLOR[s.band] }}>{s.mean.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="a-ovcard" style={{ textAlign: "center" }}>
            <div className="ast-eyebrow">Overall response rate</div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}><Ring pct={rate} /></div>
            <div className="ast-ring-sub">{responded} of {data.invited} responded · target ≥ 75%</div>
          </div>

          {data.triggered.length ? (
            <div className="ast-trigger">
              <div className="ast-trigger-h">⚠ Trigger watch</div>
              <div className="ast-trigger-lead">{data.triggered.length} {data.triggered.length === 1 ? "section is" : "sections are"} below {data.threshold != null ? `the ${data.threshold.toFixed(1)} threshold` : "the healthy band"}</div>
              <div className="ast-trigger-list">
                {data.triggered.map((t) => <div key={t.label} className="ast-trigger-row"><span>{t.label}</span><b>{t.mean.toFixed(1)}</b></div>)}
              </div>
              {data.linkedWorkshop ? (
                <Link className="btn-sec sm" href={`/workshops/${data.linkedWorkshop.id}`} style={{ marginTop: 10, width: "100%", justifyContent: "center" }}>Open mitigation workshop →</Link>
              ) : (
                <Link className="btn-prim sm" href="/workshops" style={{ marginTop: 10, width: "100%", justifyContent: "center" }}>Schedule mitigation workshop →</Link>
              )}
            </div>
          ) : data.masked ? null : (
            <div className="ast-ok">✓ All sections are within the healthy band.</div>
          )}

          <div className="a-ovcard">
            <div className="ast-eyebrow" style={{ marginBottom: 10 }}>Activity</div>
            {data.activity.length ? data.activity.slice(0, 6).map((a) => (
              <div className="ast-feed" key={a.id}>
                <div className="ast-feed-dot" />
                <div style={{ flex: 1, minWidth: 0 }}><div className="ast-feed-t">{a.label}</div><div className="ast-feed-w">{a.actor ? `${a.actor} · ` : ""}{relTime(a.at)}</div></div>
              </div>
            )) : <div className="ast-empty">No activity yet.</div>}
          </div>
        </div>
      </div>

      <div className={`toast${toast ? " show" : ""}`}><span>{toast}</span></div>
    </div>
  );
}
