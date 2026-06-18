"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SideWindow } from "@/components/SideWindow";
import { setHealthStatus, setTeamKind } from "./actions";

type Composite = { composite: number; survey_id: string; percentile: number | null; trend: string | null; history: number[] | null } | null;
export type Entity = {
  team_id: string;
  name: string;
  kind: string;
  parent_team_id: string | null;
  lead: string | null;
  dynamics: { score: number; in_band: number; total: number; trend: string | null; history: number[] | null } | null;
  strategy: Composite;
  performance: Composite;
  development: string[];
  manual: Record<string, { status: string; note: string | null }>;
};

const AXES = [
  { key: "dynamics", label: "Dynamics" },
  { key: "strategy", label: "Strategy" },
  { key: "performance", label: "Performance" },
] as const;

function ragForComposite(v: number): string {
  return v >= 67 ? "green" : v >= 50 ? "amber" : "red";
}
function ragForDynamics(d: { in_band: number; total: number }): string {
  if (d.total === 0) return "none";
  if (d.in_band === d.total) return "green";
  return d.in_band * 2 >= d.total ? "amber" : "red";
}

function TrendArrow({ dir }: { dir: string | null }) {
  if (!dir) return null;
  if (dir === "flat") return <span className="tarrow flat" title="No change since last">→</span>;
  return (
    <span className={`tarrow ${dir}`} title={dir === "up" ? "Improving since last" : "Slipping since last"}>
      {dir === "up" ? "↑" : "↓"}
    </span>
  );
}

// Tiny inline history line for an axis. Normalizes within its own range, so axes
// on different scales still read at a glance.
function Sparkline({ points, tone }: { points: number[]; tone: string | null }) {
  if (!points || points.length < 2) return null;
  const w = 52;
  const h = 14;
  const pad = 1.5;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const dx = (w - 2 * pad) / (points.length - 1);
  const y = (p: number) => pad + (h - 2 * pad) * (1 - (p - min) / span);
  const pts = points.map((p, i) => `${(pad + i * dx).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const lastX = pad + (points.length - 1) * dx;
  return (
    <svg className={`spark ${tone ?? "flat"}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX.toFixed(1)} cy={y(points[points.length - 1]).toFixed(1)} r="1.7" fill="currentColor" />
    </svg>
  );
}

export function HealthClient({ entities, manageable }: { entities: Entity[]; manageable: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canManage = useMemo(() => new Set(manageable), [manageable]);
  const [edit, setEdit] = useState<{ teamId: string; name: string; axis: string; axisLabel: string } | null>(null);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  const { groups, childrenOf, standalone } = useMemo(() => {
    const childrenOf = new Map<string, Entity[]>();
    for (const e of entities) {
      if (e.kind === "team" && e.parent_team_id) {
        const arr = childrenOf.get(e.parent_team_id) ?? [];
        arr.push(e);
        childrenOf.set(e.parent_team_id, arr);
      }
    }
    const groups = entities.filter((e) => e.kind === "leadership_group");
    const nested = new Set(groups.flatMap((g) => (childrenOf.get(g.team_id) ?? []).map((c) => c.team_id)));
    const standalone = entities.filter((e) => e.kind === "team" && !nested.has(e.team_id));
    return { groups, childrenOf, standalone };
  }, [entities]);

  function openEditor(e: Entity, axis: string, axisLabel: string) {
    const cur = e.manual[axis];
    setDraftStatus(cur?.status ?? null);
    setDraftNote(cur?.note ?? "");
    setEdit({ teamId: e.team_id, name: e.name, axis, axisLabel });
  }
  function saveStatus(status: string | null) {
    if (!edit) return;
    startTransition(async () => {
      const res = await setHealthStatus(edit.teamId, edit.axis, status, draftNote || null);
      if (res.error) flash(res.error);
      else {
        flash(status ? "Status set" : "Status cleared");
        setEdit(null);
        router.refresh();
      }
    });
  }
  function toggleKind(e: Entity) {
    startTransition(async () => {
      const next = e.kind === "leadership_group" ? "team" : "leadership_group";
      const res = await setTeamKind(e.team_id, next);
      if (res.error) flash(res.error);
      else {
        flash(next === "leadership_group" ? "Marked as leadership group" : "Marked as team");
        router.refresh();
      }
    });
  }

  function Tile({ e, axis, label }: { e: Entity; axis: string; label: string }) {
    const manual = e.manual[axis];
    let rag = "none";
    let value: string = "—";
    let sub: string | null = null;
    let trend: string | null = null;
    let history: number[] | null = null;
    if (axis === "dynamics" && e.dynamics) {
      rag = ragForDynamics(e.dynamics);
      value = `${e.dynamics.score}`;
      sub = `${e.dynamics.in_band}/${e.dynamics.total} in band`;
      trend = e.dynamics.trend;
      history = e.dynamics.history;
    } else if (axis === "strategy" && e.strategy) {
      rag = ragForComposite(e.strategy.composite);
      value = `${e.strategy.composite}`;
      sub = e.strategy.percentile != null ? `${e.strategy.percentile}th pct` : "of 100";
      trend = e.strategy.trend;
      history = e.strategy.history;
    } else if (axis === "performance" && e.performance) {
      rag = ragForComposite(e.performance.composite);
      value = `${e.performance.composite}`;
      sub = e.performance.percentile != null ? `${e.performance.percentile}th pct` : "of 100";
      trend = e.performance.trend;
      history = e.performance.history;
    }
    const editable = canManage.has(e.team_id);
    const hasData = value !== "—";
    const cls = `htile rag-${manual ? manual.status : rag}`;
    const body = (
      <>
        <span className="htile-l">
          {label}
          {manual && !editable ? <span className={`mdot ${manual.status}`} title={manual.note ?? undefined} /> : null}
        </span>
        <span className="htile-v">{value}<TrendArrow dir={trend} /></span>
        {history && history.length > 1 ? <Sparkline points={history} tone={trend} /> : null}
        {sub ? <span className="htile-s">{sub}</span> : null}
      </>
    );
    return (
      <div className="htile-wrap">
        {hasData ? (
          <Link href={`/assessments?team=${e.team_id}`} className={`${cls} linkish`} title="View latest results">{body}</Link>
        ) : (
          <div className={cls}>{body}</div>
        )}
        {editable ? (
          <button
            className="htile-set"
            disabled={pending}
            title={manual ? `Manual: ${manual.status}${manual.note ? " — " + manual.note : ""} (edit)` : "Set a manual status"}
            onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); openEditor(e, axis, label); }}
          >
            {manual ? <span className={`mdot ${manual.status}`} /> : <span className="mdot empty" />}
          </button>
        ) : null}
      </div>
    );
  }

  function Row({ e, nested }: { e: Entity; nested?: boolean }) {
    const editable = canManage.has(e.team_id);
    const overall = e.manual.overall;
    return (
      <div className={`hrow${nested ? " nested" : ""}`}>
        <div className="hrow-id">
          <div className="hrow-name">
            {overall ? <span className={`mdot ${overall.status}`} title={overall.note ?? undefined} /> : null}
            <Link href={`/teams/${e.team_id}`} className="hlink">{e.name}</Link>
            {e.kind === "leadership_group" ? <span className="pill sm draft">Leadership</span> : null}
          </div>
          <div className="hrow-meta">
            {e.lead ? <span className="src">Lead · {e.lead}</span> : null}
            {editable ? (
              <button className="linkbtn xs" disabled={pending} onClick={() => toggleKind(e)}>
                {e.kind === "leadership_group" ? "Make team" : "Make group"}
              </button>
            ) : null}
            {editable ? (
              <button className="linkbtn xs" disabled={pending} onClick={() => openEditor(e, "overall", "Overall")}>Set overall</button>
            ) : null}
          </div>
        </div>
        <div className="htiles">
          {AXES.map((a) => <Tile key={a.key} e={e} axis={a.key} label={a.label} />)}
        </div>
        <div className="hdev">
          {e.development.length ? (
            <>
              <span className="hdev-l">Develop</span>
              {e.development.map((d) => <span className="devchip" key={d}>{d}</span>)}
            </>
          ) : (
            <span className="hdev-none">No flags</span>
          )}
        </div>
      </div>
    );
  }

  if (!entities.length) {
    return <div className="empty">No teams you can see yet. Create a team or ask an admin for access.</div>;
  }

  return (
    <div className="healthboard">
      {groups.length ? (
        <div className="hsection">
          <div className="hsection-h">Leadership groups</div>
          {groups.map((g) => (
            <div className="hgroup" key={g.team_id}>
              <Row e={g} />
              {(childrenOf.get(g.team_id) ?? []).map((c) => <Row key={c.team_id} e={c} nested />)}
            </div>
          ))}
        </div>
      ) : null}

      {standalone.length ? (
        <div className="hsection">
          <div className="hsection-h">Teams</div>
          {standalone.map((t) => <Row key={t.team_id} e={t} />)}
        </div>
      ) : null}

      {edit ? (
        <SideWindow
          open={!!edit}
          onClose={() => setEdit(null)}
          title="Set status"
          subtitle={`${edit.name} · ${edit.axisLabel}`}
          size="compact"
          footer={
            <>
              <button className="btn-sec" disabled={pending} onClick={() => saveStatus(null)}>Clear</button>
              <div className="right">
                <button className="btn-prim" disabled={pending || !draftStatus} onClick={() => saveStatus(draftStatus)}>Save</button>
              </div>
            </>
          }
        >
          <div className="field">
            <label>Status</label>
            <div className="ragpick">
              {(["green", "amber", "red"] as const).map((s) => (
                <button
                  key={s}
                  className={`ragbtn ${s}${draftStatus === s ? " on" : ""}`}
                  onClick={() => setDraftStatus(s)}
                >
                  {s === "green" ? "On track" : s === "amber" ? "Watch" : "At risk"}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Note <span className="opt">(optional)</span></label>
            <textarea className="inp" rows={3} value={draftNote} maxLength={280} onChange={(ev) => setDraftNote(ev.target.value)} placeholder="Context the data misses…" />
          </div>
        </SideWindow>
      ) : null}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
