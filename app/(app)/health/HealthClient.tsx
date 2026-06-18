"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SideWindow } from "@/components/SideWindow";
import { useTableControls } from "@/components/TableControls";
import { setHealthStatus, setTeamKind, healthDetail } from "./actions";

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

// --- sort / filter helpers (the manual overlay wins over the auto RAG) ---
const STATUS_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };
function axisRag(e: Entity, axis: string): string | null {
  const m = e.manual[axis];
  if (m) return m.status;
  if (axis === "dynamics" && e.dynamics) return ragForDynamics(e.dynamics);
  if (axis === "strategy" && e.strategy) return ragForComposite(e.strategy.composite);
  if (axis === "performance" && e.performance) return ragForComposite(e.performance.composite);
  return null;
}
function entityWorst(e: Entity): string | null {
  const rags = ["dynamics", "strategy", "performance"]
    .map((a) => axisRag(e, a))
    .concat(e.manual.overall?.status ?? null)
    .filter((r): r is string => r != null);
  if (!rags.length) return null;
  return rags.sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])[0];
}
function entityRisk(e: Entity): number {
  const w = entityWorst(e);
  return w == null ? 3 : STATUS_RANK[w];
}
function scoreOf(e: Entity, axis: string): number | null {
  if (axis === "dynamics") return e.dynamics?.score ?? null;
  if (axis === "strategy") return e.strategy?.composite ?? null;
  return e.performance?.composite ?? null;
}
function byScoreDesc(axis: string) {
  return (a: Entity, b: Entity) => {
    const x = scoreOf(a, axis);
    const y = scoreOf(b, axis);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  };
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
function Sparkline({ points, tone, w = 52, h = 14 }: { points: number[]; tone: string | null; w?: number; h?: number }) {
  if (!points || points.length < 2) return null;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const dx = (w - 2 * pad) / (points.length - 1);
  const y = (p: number) => pad + (h - 2 * pad) * (1 - (p - min) / span);
  const pts = points.map((p, i) => `${(pad + i * dx).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const lastX = pad + (points.length - 1) * dx;
  return (
    <svg className={`spark ${tone ?? "flat"}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={h < 20 ? 1.4 : 1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX.toFixed(1)} cy={y(points[points.length - 1]).toFixed(1)} r={h < 20 ? 1.7 : 2.6} fill="currentColor" />
    </svg>
  );
}

type HistPoint = { v: number; at: string; label: string };
type HealthDetail = {
  strategy: HistPoint[];
  performance: HistPoint[];
  dynamics: HistPoint[];
  manual: { axis: string; status: string; note: string | null; by: string | null; at: string }[];
};
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function MomentumChip({ m }: { m?: { nextAt: string | null; open: number } }) {
  if (!m) return null;
  if (m.nextAt) {
    const d = new Date(m.nextAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const overdue = m.nextAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
    return overdue
      ? <span className="moment flag" title="Next step is overdue">Overdue · {d}</span>
      : <span className="moment ok" title="Next step scheduled">Next · {d}</span>;
  }
  if (m.open > 0) {
    return <span className="moment flag" title={`${m.open} open commitment${m.open === 1 ? "" : "s"}, no next step scheduled`}>No next step</span>;
  }
  return null;
}

export function HealthClient({
  entities,
  manageable,
  momentum = {},
}: {
  entities: Entity[];
  manageable: string[];
  momentum?: Record<string, { nextAt: string | null; open: number }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canManage = useMemo(() => new Set(manageable), [manageable]);
  const [edit, setEdit] = useState<{ teamId: string; name: string; axis: string; axisLabel: string } | null>(null);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ teamId: string; name: string } | null>(null);
  const [detailData, setDetailData] = useState<HealthDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function openDetail(e: Entity) {
    setDetail({ teamId: e.team_id, name: e.name });
    setDetailData(null);
    setDetailLoading(true);
    const res = await healthDetail(e.team_id);
    setDetailLoading(false);
    if (res.error) flash(res.error);
    else setDetailData(res.data as HealthDetail);
  }

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
            <MomentumChip m={momentum[e.team_id]} />
            <button className="linkbtn xs" onClick={() => openDetail(e)}>Details</button>
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

  const { view, controls, active } = useTableControls<Entity>(entities, {
    search: { placeholder: "Search team or lead…", text: (e) => `${e.name} ${e.lead ?? ""}` },
    sorts: [
      { key: "group", label: "Org structure", cmp: () => 0 },
      { key: "risk", label: "At risk first", cmp: (a, b) => entityRisk(a) - entityRisk(b) || a.name.localeCompare(b.name) },
      { key: "name", label: "Name (A–Z)", cmp: (a, b) => a.name.localeCompare(b.name) },
      { key: "dynamics", label: "Dynamics (high→low)", cmp: byScoreDesc("dynamics") },
      { key: "strategy", label: "Strategy (high→low)", cmp: byScoreDesc("strategy") },
      { key: "performance", label: "Performance (high→low)", cmp: byScoreDesc("performance") },
    ],
    facets: [
      { key: "kind", label: "Type", options: [
        { value: "leadership_group", label: "Leadership", test: (e) => e.kind === "leadership_group" },
        { value: "team", label: "Teams", test: (e) => e.kind === "team" },
      ] },
      { key: "status", label: "Status", multi: true, options: [
        { value: "red", label: "At risk", test: (e) => entityWorst(e) === "red" },
        { value: "amber", label: "Watch", test: (e) => entityWorst(e) === "amber" },
        { value: "green", label: "On track", test: (e) => entityWorst(e) === "green" },
      ] },
      { key: "flags", label: "Flags", options: [
        { value: "flags", label: "Has dev flags", test: (e) => e.development.length > 0 },
      ] },
    ],
  });

  if (!entities.length) {
    return <div className="empty">No teams you can see yet. Create a team or ask an admin for access.</div>;
  }

  return (
    <div>
      {controls}
      <div className="healthboard">
      {active ? (
        <div className="hsection">
          {view.length ? view.map((t) => <Row key={t.team_id} e={t} />) : <div className="empty">No teams match these filters.</div>}
        </div>
      ) : (
        <>
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
        </>
      )}

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

      {detail ? (
        <SideWindow open={!!detail} onClose={() => setDetail(null)} title={detail.name} subtitle="Health detail — full history">
          {detailLoading ? (
            <div className="muted">Loading…</div>
          ) : detailData ? (
            <div className="hdetail">
              {([["dynamics", "Dynamics"], ["strategy", "Strategy"], ["performance", "Performance"]] as const).map(([k, lbl]) => {
                const series = detailData[k];
                return (
                  <div className="hdetail-axis" key={k}>
                    <div className="hdetail-h">
                      <span>{lbl}</span>
                      {series.length ? <span className="hdetail-now">{series[series.length - 1].v}</span> : <span className="muted">no data</span>}
                    </div>
                    {series.length > 1 ? <Sparkline points={series.map((p) => p.v)} tone={null} w={236} h={42} /> : null}
                    {series.length ? (
                      <ul className="hdetail-points">
                        {series.slice().reverse().map((p, i) => (
                          <li key={i}>
                            <span className="hp-v">{p.v}</span>
                            <span className="hp-l">{p.label}</span>
                            <span className="hp-at">{fmtDate(p.at)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
              <div className="hdetail-axis">
                <div className="hdetail-h"><span>Manual status log</span></div>
                {detailData.manual.length ? (
                  <ul className="hdetail-log">
                    {detailData.manual.map((mlog, i) => (
                      <li key={i}>
                        <span className={`mdot ${mlog.status}`} />
                        <span className="hl-axis">{mlog.axis}</span>
                        {mlog.note ? <span className="hl-note">{mlog.note}</span> : null}
                        <span className="hl-meta">{mlog.by ?? "—"} · {fmtDate(mlog.at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="muted">No manual statuses set.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="muted">No detail available.</div>
          )}
        </SideWindow>
      ) : null}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
      </div>
    </div>
  );
}
