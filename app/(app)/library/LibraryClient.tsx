"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { individualDimensionMeans, type SurveyInstrument } from "@/lib/survey";
import { sendSurvey } from "../assessments/actions";
import { submitIndividual, setShared } from "./actions";

export type LibTemplate = {
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
  | null;

export function LibraryClient({
  templates,
  instruments,
  manageableTeams,
  myResults,
}: {
  templates: LibTemplate[];
  instruments: Record<string, SurveyInstrument>;
  manageableTeams: Team[];
  myResults: MyResult[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [results, setResults] = useState<Record<string, MyResult>>(
    () => Object.fromEntries(myResults.map((r) => [r.key, r])),
  );
  const [toast, setToast] = useState<string | null>(null);

  const team = useMemo(() => templates.filter((t) => t.scope === "team"), [templates]);
  const individual = useMemo(() => templates.filter((t) => t.scope === "individual"), [templates]);
  const nameByKey = useMemo(() => Object.fromEntries(templates.map((t) => [t.key, t.name])), [templates]);
  const myProfileKeys = useMemo(
    () => Object.keys(results).filter((k) => instruments[k] && results[k]),
    [results, instruments],
  );

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
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

  return (
    <>
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

      <Section
        title="Team assessments"
        sub="Sent to a team as an anonymous survey — answered live in a workshop or ahead as pre-work."
        items={team}
        render={(t) => (
          <Card key={t.key} t={t}>
            {manageableTeams.length > 0 ? (
              <button className="btn-prim" onClick={() => setPanel({ mode: "launch", tpl: t })}>Launch ▸</button>
            ) : (
              <span className="libhint">Only a team lead can launch</span>
            )}
          </Card>
        )}
      />

      <Section
        title="Individual assessments"
        sub="Self-assessments you take yourself. Your results are private to you."
        items={individual}
        render={(t) => (
          <Card key={t.key} t={t}>
            {results[t.key] ? (
              <button className="btn-ghost" onClick={() => setPanel({ mode: "take", tpl: t })}>✓ Completed · Retake</button>
            ) : (
              <button className="btn-prim" onClick={() => setPanel({ mode: "take", tpl: t })}>Take it ▸</button>
            )}
          </Card>
        )}
      />

      {panel ? (
        <div className="libpanel-backdrop" onClick={() => setPanel(null)}>
          <div className="libpanel" onClick={(e) => e.stopPropagation()}>
            <div className="libpanel-h">
              <div>
                <div className="pact">{panel.mode === "launch" ? "Launch to a team" : "Self-assessment"}</div>
                <h2>{panel.tpl.name}</h2>
              </div>
              <button className="xbtn" onClick={() => setPanel(null)} aria-label="Close">✕</button>
            </div>

            {panel.mode === "launch" ? (
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
                pending={pending}
                onSubmit={(scores) =>
                  startTransition(async () => {
                    const key = panel.tpl.key;
                    const res = await submitIndividual(key, scores);
                    if (res.error) flash(res.error);
                    else {
                      setResults((r) => ({ ...r, [key]: { key, scores, shared: r[key]?.shared ?? false } }));
                      flash("Your read is saved — private to you");
                      setPanel(null);
                      router.refresh();
                    }
                  })
                }
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

function Card({ t, children }: { t: LibTemplate; children: ReactNode }) {
  return (
    <div className="tpl">
      <div className="body">
        <div className="libtags">
          <span className="scopetag">{CATEGORY[t.category] ?? t.category}</span>
          {t.custom ? <span className="scopetag custom">Custom</span> : null}
        </div>
        <h3>{t.name}</h3>
        {t.source ? <div className="src">{t.source}</div> : null}
        <p>{t.description}</p>
        <div className="foot">{children}</div>
      </div>
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
  return (
    <div className="tpl">
      <div className="body">
        <h3 style={{ marginBottom: 8 }}>{name}</h3>
        <div className="assess-agg" style={{ boxShadow: "none", border: "none", padding: 0, flex: 1 }}>
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
  pending,
  onSubmit,
}: {
  inst: SurveyInstrument | null;
  pending: boolean;
  onSubmit: (scores: Record<string, number>) => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  if (!inst) return <p className="assess-lead">This instrument isn’t available right now.</p>;
  const max = inst.scale.max;
  const allRated = inst.items.every((it) => scores[it.key]);
  return (
    <div className="libpanel-body">
      <p className="assess-lead">{inst.scale.min} = {inst.scale.minLabel} · {max} = {inst.scale.maxLabel}. Private to you.</p>
      {inst.dimensions.map((d) => (
        <div key={d.key} className="svgroup">
          <div className="svgroup-h">{d.label}</div>
          {inst.items.filter((it) => it.dimension === d.key).map((it) => (
            <div className="asq" key={it.key}>
              <div className="asq-q"><span>{it.text}</span></div>
              <div className="asopts sv7">
                {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
                  <button key={v} className={scores[it.key] === v ? "on" : ""} onClick={() => setScores((s) => ({ ...s, [it.key]: v }))}>{v}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="mactions">
        <button className="btn-prim" disabled={!allRated || pending} onClick={() => onSubmit(scores)}>{pending ? "Saving…" : "Save my read"}</button>
      </div>
    </div>
  );
}
