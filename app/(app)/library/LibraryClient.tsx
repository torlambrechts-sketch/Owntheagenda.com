"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { individualDimensionMeans, compositeScore, type SurveyInstrument } from "@/lib/survey";
import { AssessmentRunner } from "@/components/AssessmentRunner";
import { useTableControls } from "@/components/TableControls";
import { sendSurvey } from "../assessments/actions";
import { submitIndividual, setShared, deleteTemplate } from "./actions";

export type LibTemplate = {
  id: string;
  key: string;
  name: string;
  category: string;
  scope: string;
  source: string | null;
  description: string | null;
  custom: boolean;
};
type Team = { id: string; name: string };
type MyResult = { key: string; scores: Record<string, number>; shared: boolean };

const CATEGORY: Record<string, string> = {
  psych_safety: "Psychological safety",
  team_effectiveness: "Team effectiveness",
  team_learning: "Team learning",
  personality: "Personality & working style",
};

type Panel =
  | { mode: "launch"; tpl: LibTemplate }
  | { mode: "take"; tpl: LibTemplate }
  | { mode: "view"; tpl: LibTemplate }
  | null;

export function LibraryClient({
  templates,
  instruments,
  manageableTeams,
  myResults,
  isAdmin,
}: {
  templates: LibTemplate[];
  instruments: Record<string, SurveyInstrument>;
  manageableTeams: Team[];
  myResults: MyResult[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [results, setResults] = useState<Record<string, MyResult>>(
    () => Object.fromEntries(myResults.map((r) => [r.key, r])),
  );
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  const visible = useMemo(() => templates.filter((t) => !removed.has(t.id)), [templates, removed]);
  const team = useMemo(() => visible.filter((t) => t.scope === "team"), [visible]);
  const individual = useMemo(() => visible.filter((t) => t.scope === "individual"), [visible]);
  const nameByKey = useMemo(() => Object.fromEntries(templates.map((t) => [t.key, t.name])), [templates]);
  const myProfileKeys = useMemo(
    () => Object.keys(results).filter((k) => instruments[k] && results[k]),
    [results, instruments],
  );

  // Close the take/launch modal on Escape.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flash(m: string) {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  function toggleShare(key: string) {
    const next = !results[key]?.shared;
    setResults((r) => ({ ...r, [key]: { ...r[key], shared: next } }));
    startTransition(async () => {
      const res = await setShared(key, next);
      if (res.error) {
        flash(res.error);
        setResults((r) => ({ ...r, [key]: { ...r[key], shared: !next } })); // revert
      } else {
        flash(next ? "Shared with your team" : "Sharing stopped — private again");
      }
    });
  }

  function removeTpl(t: LibTemplate) {
    if (!confirm(`Delete “${t.name}”? This can’t be undone.`)) return;
    setRemoved((s) => new Set(s).add(t.id));
    startTransition(async () => {
      const res = await deleteTemplate(t.id);
      if (res.error) {
        flash(res.error);
        setRemoved((s) => { const n = new Set(s); n.delete(t.id); return n; }); // revert
      } else {
        flash("Template deleted");
        router.refresh();
      }
    });
  }

  const manage = (t: LibTemplate) =>
    isAdmin ? (
      <div className="cardmanage">
        <Link href={`/library/new?from=${t.id}`} className="linkbtn">Duplicate</Link>
        {t.custom ? <Link href={`/library/new?id=${t.id}`} className="linkbtn">Edit</Link> : null}
        {t.custom ? <button className="linkbtn" style={{ color: "var(--rust)" }} disabled={pending} onClick={() => removeTpl(t)}>Delete</button> : null}
      </div>
    ) : null;

  // One card renderer for both sections and the filtered view (scope-aware foot).
  const renderCard = (t: LibTemplate) => (
    <Card key={t.key} t={t} inst={instruments[t.key]} manage={manage(t)}>
      <button className="btn-ghost sm" onClick={() => setPanel({ mode: "view", tpl: t })}>View</button>
      {t.scope === "team" ? (
        manageableTeams.length > 0 ? (
          <button className="btn-prim" onClick={() => setPanel({ mode: "launch", tpl: t })}>Launch ▸</button>
        ) : (
          <span className="libhint">Only a team lead can launch</span>
        )
      ) : results[t.key] ? (
        <button className="btn-ghost" onClick={() => setPanel({ mode: "take", tpl: t })}>✓ Completed · Retake</button>
      ) : (
        <button className="btn-prim" onClick={() => setPanel({ mode: "take", tpl: t })}>Take it ▸</button>
      )}
    </Card>
  );

  const lib = useTableControls<LibTemplate>(templates, {
    search: { placeholder: "Search assessments…", text: (t) => `${t.name} ${t.source ?? ""} ${t.description ?? ""}` },
    sorts: [
      { key: "section", label: "By section", cmp: () => 0 },
      { key: "name", label: "Name (A–Z)", cmp: (a, b) => a.name.localeCompare(b.name) },
    ],
    facets: [
      { key: "scope", label: "Type", options: [
        { value: "team", label: "Team", test: (t) => t.scope === "team" },
        { value: "individual", label: "Individual", test: (t) => t.scope === "individual" },
      ] },
      { key: "custom", label: "Source", options: [
        { value: "custom", label: "Custom", test: (t) => t.custom },
        { value: "builtin", label: "Built-in", test: (t) => !t.custom },
      ] },
    ],
  });

  return (
    <>
      {isAdmin ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
          <Link href="/library/new" className="btn-prim" style={{ flex: "none" }}>+ New template</Link>
        </div>
      ) : null}

      {myProfileKeys.length > 0 ? (
        <div>
          <div className="cat-head" style={{ fontSize: 15 }}>Your profile <span className="n">{myProfileKeys.length}</span></div>
          <p className="page-sub" style={{ marginTop: -6 }}>Private to you. Share a result to let your teammates see it.</p>
          <div className="tpl-grid">
            {myProfileKeys.map((k) => (
              <ProfileCard
                key={k}
                name={nameByKey[k] ?? k}
                inst={instruments[k]}
                result={results[k]}
                pending={pending}
                onToggleShare={() => toggleShare(k)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {lib.controls}

      {lib.active ? (
        lib.view.length ? (
          <div className="tpl-grid">{lib.view.map(renderCard)}</div>
        ) : (
          <div className="card empty">No assessments match these filters.</div>
        )
      ) : (
        <>
          <Section
            title="Team assessments"
            sub="Sent to a team as an anonymous survey — answered live in a workshop or ahead as pre-work."
            items={team}
            render={renderCard}
          />
          <Section
            title="Individual assessments"
            sub="Self-assessments you take yourself. Your results are private to you."
            items={individual}
            render={renderCard}
          />
        </>
      )}

      {panel ? (
        <div className="libpanel-backdrop" onClick={() => setPanel(null)}>
          <div className="libpanel" onClick={(e) => e.stopPropagation()}>
            <div className="libpanel-h">
              <div>
                <div className="pact">{panel.mode === "launch" ? "Launch to a team" : panel.mode === "take" ? "Self-assessment" : "What's inside"}</div>
                <h2>{panel.tpl.name}</h2>
              </div>
              <button className="xbtn" onClick={() => setPanel(null)} aria-label="Close">✕</button>
            </div>

            {panel.mode === "view" ? (
              <ContentPreview inst={instruments[panel.tpl.key] ?? null} />
            ) : panel.mode === "launch" ? (
              <LaunchForm
                teams={manageableTeams}
                pending={pending}
                onSend={(teamId, due) =>
                  startTransition(async () => {
                    const res = await sendSurvey(teamId, panel.tpl.key, due);
                    if (res.error) flash(res.error);
                    else {
                      flash("Assessment sent to the team");
                      setPanel(null);
                      router.refresh();
                    }
                  })
                }
              />
            ) : (
              <TakeForm
                inst={instruments[panel.tpl.key] ?? null}
                templateKey={panel.tpl.key}
                onSubmit={async (scores) => {
                  const key = panel.tpl.key;
                  const res = await submitIndividual(key, scores);
                  if (res.error) { flash(res.error); throw new Error(res.error); }
                  setResults((r) => ({ ...r, [key]: { key, scores, shared: r[key]?.shared ?? false } }));
                  flash("Your read is saved — private to you");
                  setPanel(null);
                  router.refresh();
                }}
              />
            )}
          </div>
        </div>
      ) : null}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}

function Section({
  title,
  sub,
  items,
  render,
}: {
  title: string;
  sub: string;
  items: LibTemplate[];
  render: (t: LibTemplate) => ReactNode;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className="cat-head" style={{ fontSize: 15 }}>{title} <span className="n">{items.length}</span></div>
      <p className="page-sub" style={{ marginTop: -6 }}>{sub}</p>
      <div className="tpl-grid">{items.map(render)}</div>
    </div>
  );
}

const BAR_COLORS = ["var(--forest)", "var(--role)", "var(--rust)", "var(--green)", "var(--draft-fg)"];

function Card({ t, inst, children, manage }: { t: LibTemplate; inst?: SurveyInstrument; children: ReactNode; manage?: ReactNode }) {
  const dims = inst?.dimensions?.length ?? 0;
  const items = inst?.items?.length ?? 0;
  return (
    <div className="tpl">
      {inst ? (
        <div className="thumb">
          {inst.dimensions.slice(0, 7).map((d, i) => (
            <span key={i} className="bar" style={{ height: `${35 + ((i * 17) % 55)}%`, background: BAR_COLORS[i % BAR_COLORS.length], opacity: 0.5 }} />
          ))}
        </div>
      ) : null}
      <div className="body">
        <div className="libtags">
          {t.category && t.category !== "custom" ? <span className="scopetag">{CATEGORY[t.category] ?? t.category}</span> : null}
          {t.custom ? <span className="scopetag custom">Custom</span> : null}
        </div>
        <h3>{t.name}</h3>
        {t.source ? <div className="src">{t.source}</div> : null}
        <p>{t.description}</p>
        {inst ? (
          <div className="meta">
            <span>◇ {items} questions</span>
            <span>▤ {dims} dimensions</span>
            <span>↕ {inst.scale.min}–{inst.scale.max}</span>
          </div>
        ) : null}
        <div className="foot">{children}</div>
        {manage}
      </div>
    </div>
  );
}

function ContentPreview({ inst }: { inst: SurveyInstrument | null }) {
  if (!inst) return <div className="libhint">No preview available for this template.</div>;
  return (
    <div className="tplview">
      <div className="tplview-scale">
        Answered on a <b>{inst.scale.min}–{inst.scale.max}</b> scale · {inst.scale.minLabel} → {inst.scale.maxLabel}
      </div>
      {inst.dimensions.map((d) => {
        const qs = inst.items.filter((it) => it.dimension === d.key);
        return (
          <div className="tplview-dim" key={d.key}>
            <div className="tplview-dh">{d.label} <span className="n">{qs.length}</span></div>
            {d.blurb ? <div className="tplview-blurb">{d.blurb}</div> : null}
            <ol className="tplview-items">
              {qs.map((it) => <li key={it.key}>{it.text}</li>)}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function ProfileCard({
  name,
  inst,
  result,
  pending,
  onToggleShare,
}: {
  name: string;
  inst: SurveyInstrument;
  result: MyResult;
  pending: boolean;
  onToggleShare: () => void;
}) {
  const max = inst.scale.max;
  const dims = individualDimensionMeans(inst, result.scores);
  const composite = compositeScore(inst, dims);
  return (
    <div className="tpl">
      <div className="body">
        <h3 style={{ marginBottom: 8 }}>{name}</h3>
        <div className="assess-agg" style={{ boxShadow: "none", border: "none", padding: 0, flex: 1 }}>
          {composite != null ? (
            <div className="svcomposite">
              <span className="svc-num">{composite}</span>
              <span className="svc-den">/ 100</span>
              <span className="svc-lab">overall index</span>
            </div>
          ) : null}
          {dims.map((d) => {
            const pct = d.mean == null ? 0 : Math.round((d.mean / max) * 100);
            return (
              <div className="svdim" key={d.key}>
                <div className="svdim-top"><span className="svdim-label">{d.label}</span><span className="svdim-val">{d.mean == null ? "· · ·" : `${d.mean.toFixed(1)} / ${max}`}</span></div>
                <div className="svtrack"><div className="svfill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
        <div className="foot" style={{ marginTop: 12 }}>
          <button className={`shbtn${result.shared ? " on" : ""}`} disabled={pending} onClick={onToggleShare}>
            {result.shared ? "✓ Shared with team · stop" : "Share with team"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LaunchForm({
  teams,
  pending,
  onSend,
}: {
  teams: Team[];
  pending: boolean;
  onSend: (teamId: string, due: string | null) => void;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [due, setDue] = useState("");
  return (
    <div className="libpanel-body">
      <p className="assess-lead">Sends an anonymous survey to the team. Set a due date to schedule it ahead of a workshop.</p>
      <div className="two" style={{ alignItems: "end" }}>
        <div className="field">
          <label>Team</label>
          <select className="inp" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </div>
        <div className="field">
          <label>Due date <span className="opt">(optional)</span></label>
          <input className="inp" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <div className="mactions">
        <button className="btn-prim" disabled={pending || !teamId} onClick={() => onSend(teamId, due || null)}>Send to team ▸</button>
      </div>
    </div>
  );
}

function TakeForm({
  inst,
  templateKey,
  onSubmit,
}: {
  inst: SurveyInstrument | null;
  templateKey: string;
  onSubmit: (scores: Record<string, number>) => void;
}) {
  if (!inst) return <p className="assess-lead">This instrument isn’t available right now.</p>;
  return (
    <div className="libpanel-body">
      <AssessmentRunner
        instrument={{ name: inst.name, scale: inst.scale, dimensions: inst.dimensions, items: inst.items }}
        draftKey={`otaa:lib:${templateKey}`}
        privacyNote="Private to you."
        submitLabel="Save my read ›"
        onSubmit={onSubmit}
      />
    </div>
  );
}
