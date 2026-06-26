"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { buildFromTemplate, createBlankWorkshop, createSeededWorkshop, scheduleWorkshop, updateWorkshopTitle } from "./actions";
import { Icon, catVis, WA } from "./visuals";
import type { TemplateCard, AssessOption } from "./WorkshopsClient";

const SCORE_COLOR = ["var(--rust)", "var(--amber)", "var(--green)"] as const;

type NwMode = "assessment" | "template" | "blank";
const NW_MODES: { key: NwMode; icon: string; title: string; blurb: string }[] = [
  { key: "assessment", icon: "Sparkles", title: "From assessment", blurb: "Auto-suggest an agenda from results" },
  { key: "template", icon: "Layers", title: "From template", blurb: "Start from a curated agenda" },
  { key: "blank", icon: "PenLine", title: "Blank", blurb: "Empty phase columns" },
];

// "New workshop" slide-over — start point (assessment / template / blank), then
// details (name / team / date), then create and land in the builder. Extracted
// from WorkshopHome so the section header can open it from any section.
export function NewWorkshopWindow({
  open,
  onClose,
  teamId,
  templates,
  surveyInsts = [],
  teamOptions = [],
  assessOptions = [],
  onFlash,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  templates: TemplateCard[];
  surveyInsts?: { kind: string; name: string }[];
  teamOptions?: { id: string; name: string }[];
  assessOptions?: AssessOption[];
  onFlash: (m: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nwMode, setNwMode] = useState<NwMode>(assessOptions.some((a) => a.seedBlocks.length) ? "assessment" : "blank");
  const [nwName, setNwName] = useState("");
  const [nwTeam, setNwTeam] = useState(teamId);
  const [nwDate, setNwDate] = useState("");
  const [nwTemplate, setNwTemplate] = useState<string | null>(null);
  const [nwAssessment, setNwAssessment] = useState<string | null>(assessOptions.find((a) => a.seedBlocks.length)?.surveyId ?? null);

  const seedTemplate = nwMode === "template" ? templates.find((t) => t.id === nwTemplate) ?? null : null;
  const selectedAssess = nwMode === "assessment" ? assessOptions.find((a) => a.surveyId === nwAssessment) ?? null : null;

  const canCreate =
    nwMode === "blank" ||
    (nwMode === "template" && !!nwTemplate) ||
    (nwMode === "assessment" && !!selectedAssess && selectedAssess.seedBlocks.length > 0);

  function createWorkshop() {
    if (!canCreate) {
      onFlash(nwMode === "template" ? "Pick a template first" : nwMode === "assessment" ? "Pick an assessment with results" : "Could not create");
      return;
    }
    const title = nwName.trim();
    startTransition(async () => {
      let id: string | undefined;
      let err: string | undefined;
      if (nwMode === "template" && nwTemplate) {
        const r = await buildFromTemplate(nwTeam, nwTemplate);
        id = r.id; err = r.error;
      } else if (nwMode === "assessment" && selectedAssess) {
        const r = await createSeededWorkshop(
          nwTeam,
          title || `${selectedAssess.name} follow-up`,
          selectedAssess.seedBlocks.map((b) => ({ title: b.title, activityType: b.activityType as never, duration: b.duration, prompt: b.prompt })),
        );
        id = r.id; err = r.error;
      } else {
        const r = await createBlankWorkshop(nwTeam, title || "Untitled workshop");
        id = r.id; err = r.error;
      }
      if (err) { onFlash(err); return; }
      if (!id) { onFlash("Could not create the workshop"); return; }
      if (title && nwMode === "template") await updateWorkshopTitle(id, title);
      if (nwDate) await scheduleWorkshop(id, `${nwDate}T09:00`);
      router.push(`/workshops/${id}`);
    });
  }

  return (
    <SideWindow
      open={open}
      onClose={onClose}
      title="New workshop"
      subtitle="Start from an assessment, a template, or a blank canvas"
      footer={
        <>
          <span style={{ fontSize: 12, color: WA.faint2, marginRight: "auto" }}>
            {nwMode === "blank" ? "Opens an empty builder" : nwMode === "template" ? (seedTemplate ? `Seeds ${seedTemplate.steps} blocks` : "") : (selectedAssess?.seedBlocks.length ? `Seeds ${selectedAssess.seedBlocks.length} blocks` : "")}
          </span>
          <button className="btn-sec" onClick={onClose}>Cancel</button>
          <div className="right">
            <button className="btn-prim" disabled={pending || !canCreate} onClick={createWorkshop}>
              <Icon name="Wand2" size={15} color="#fff" /> Create workshop
            </button>
          </div>
        </>
      }
    >
      {/* Start point — three mode cards */}
      <div className="nw-eyebrow">Start point</div>
      <div className="nw-modes">
        {NW_MODES.map((m) => (
          <button key={m.key} type="button" className={`nw-mode${nwMode === m.key ? " on" : ""}`} onClick={() => { setNwMode(m.key); if (m.key === "assessment") setNwTeam(teamId); }}>
            {m.key === "assessment" ? <span className="nw-mode-badge">Recommended</span> : null}
            <Icon name={m.icon} size={18} color={nwMode === m.key ? WA.accent : WA.faint} />
            <span className="nw-mode-t">{m.title}</span>
            <span className="nw-mode-s">{m.blurb}</span>
          </button>
        ))}
      </div>

      {/* Mode-specific body */}
      {nwMode === "assessment" ? (
        assessOptions.length ? (
          <>
            <div className="nw-eyebrow">Choose assessment</div>
            <div className="nw-assess-list">
              {assessOptions.map((a) => {
                const on = nwAssessment === a.surveyId;
                return (
                  <button key={a.surveyId} type="button" className={`nw-assess-row${on ? " on" : ""}`} disabled={!a.seedBlocks.length} onClick={() => setNwAssessment(a.surveyId)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="nw-assess-t">{a.name}</div>
                      <div className="nw-assess-s">{a.teamName} · {a.responses} response{a.responses === 1 ? "" : "s"} · {a.dateLabel}</div>
                    </div>
                    {a.masked || a.score == null ? (
                      <div className="nw-assess-scale" style={{ textAlign: "right", flexShrink: 0 }}>awaiting<br />responses</div>
                    ) : (
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div className="nw-assess-score" style={{ color: SCORE_COLOR[a.band] }}>{a.score}</div>
                        <div className="nw-assess-scale">of {a.scale}</div>
                      </div>
                    )}
                    {on ? <span className="nw-tpl-check"><Icon name="Check" size={13} color="#fff" /></span> : null}
                  </button>
                );
              })}
            </div>
            {selectedAssess && selectedAssess.seedBlocks.length ? (
              <div className="nw-seedcard">
                <div className="nw-seed-h"><Icon name="Sparkles" size={13} color="#5b5536" /> We’ll seed {selectedAssess.seedBlocks.length} blocks</div>
                <div className="nw-seed-sub">Targeting the lowest-scoring areas of <b>{selectedAssess.name}</b>. You can adjust everything in the builder.</div>
                {selectedAssess.weak.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 11 }}>
                    {selectedAssess.weak.map((w, i) => (
                      <span key={i} className="nw-weak-chip">{w.label} · {w.score}</span>
                    ))}
                  </div>
                ) : null}
                <div className="nw-seed-list">
                  {selectedAssess.seedBlocks.map((b, i) => (
                    <div className="nw-seed-row" key={i}><span className="nw-seed-dot" />{b.title}<span className="nw-seed-meta">{b.phaseLabel} · {b.duration}m</span></div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="form-note">No completed assessments for this team yet{surveyInsts.length ? " — run one from Assessments first" : ""}. Pick <b>Template</b> or <b>Blank</b> to start now.</div>
        )
      ) : null}

      {nwMode === "template" ? (
        <>
          <div className="nw-eyebrow">Choose template</div>
          <div className="nw-tpl-list">
            {templates.map((t) => {
              const v = catVis(t.category);
              const on = nwTemplate === t.id;
              return (
                <button key={t.id} type="button" className={`nw-tpl-row${on ? " on" : ""}`} onClick={() => setNwTemplate(t.id)}>
                  <span className="nw-tpl-ic" style={{ background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={15} color={v.accent} /></span>
                  <span className="nw-tpl-body"><span className="nw-tpl-t">{t.name}</span><span className="nw-tpl-m">{t.minutes} min · {t.steps} blocks</span></span>
                  {on ? <span className="nw-tpl-check"><Icon name="Check" size={13} color="#fff" /></span> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {nwMode === "blank" ? (
        <div className="nw-blanknote">You’ll start with empty phase columns — <b>Open · Explore · Decide · Close</b> — and build the agenda block by block in the builder.</div>
      ) : null}

      {/* Details */}
      <div className="nw-eyebrow">Details</div>
      <div className="field">
        <label htmlFor="nw-name">Workshop name {nwMode === "blank" ? null : <span className="opt">(optional)</span>}</label>
        <input className="inp" id="nw-name" value={nwName} onChange={(e) => setNwName(e.target.value)} placeholder="e.g. Q3 leadership alignment" />
      </div>
      <div className="two">
        <div className="field">
          <label>Team {nwMode === "assessment" ? <span className="opt">(from assessment)</span> : null}</label>
          <select className="inp" value={nwTeam} disabled={nwMode === "assessment"} onChange={(e) => setNwTeam(e.target.value)}>
            {teamOptions.length ? teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>) : <option value={teamId}>This team</option>}
          </select>
        </div>
        <div className="field">
          <label>Date <span className="opt">(optional)</span></label>
          <input className="inp" type="date" value={nwDate} onChange={(e) => setNwDate(e.target.value)} />
        </div>
      </div>
    </SideWindow>
  );
}
