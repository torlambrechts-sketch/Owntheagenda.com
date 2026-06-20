"use client";

// The "wait for responses" surface. Shows a live progress ring (responses
// collected vs the target), a reminder nudge for non-responders, and a manual
// override to start the workshop before the threshold is met. The Flow also
// advances on its own the moment the target is reached (DB trigger), so this
// is for visibility and the impatient — not a required click.

export function ReadinessGate({
  done,
  target,
  ready,
  canManage,
  pending,
  onRemind,
  onStartNow,
}: {
  done: number;
  target: number;
  ready: boolean;
  canManage: boolean;
  pending: boolean;
  onRemind: () => void;
  onStartNow: () => void;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;

  return (
    <div className={`rg${ready ? " ready" : ""}`}>
      <div className="rg-top">
        <svg className="rg-ring" width="44" height="44" viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r={r} className="rg-track" />
          <circle
            cx="22"
            cy="22"
            r={r}
            className="rg-fill"
            strokeDasharray={c}
            strokeDashoffset={off}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <div className="rg-counts">
          <strong>
            {done}
            <span className="rg-of"> / {target}</span>
          </strong>
          <span className="rg-label">{ready ? "Threshold met — building" : "responses collected"}</span>
        </div>
      </div>
      {canManage ? (
        <div className="rg-acts">
          <button className="linkbtn xs" disabled={pending} onClick={onRemind}>
            Remind non-responders
          </button>
          {!ready ? (
            <button className="linkbtn xs" disabled={pending} onClick={onStartNow}>
              Start workshop now →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
