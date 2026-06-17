"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Team Charter (Start Smart): the durable "active working tool". The facilitator
// curates the team's purpose, goals, roles, work methods and norms during the
// session; everyone sees it form live; the review step compiles it.

type Goal = { text: string; owner?: string; due?: string };
type Role = { name: string; responsibilities: string };
type WorkMethods = { meetings?: string; communication?: string; tools?: string; decisions?: string };
type Charter = {
  purpose: string | null;
  goals: Goal[];
  roles: Role[];
  work_methods: WorkMethods;
  norms: { text: string }[];
  status: string;
};
type Section = "purpose" | "goals" | "roles" | "work_methods" | "norms" | "review";

const SECTION_META: Record<Exclude<Section, "review">, { label: string; hint: string }> = {
  purpose: { label: "Purpose", hint: "One sentence: why does this team exist?" },
  goals: { label: "Goals", hint: "SMART goals — one per line." },
  roles: { label: "Roles & responsibilities", hint: "One per line as “Name: what they own”." },
  work_methods: { label: "How we work", hint: "Meetings, communication, tools, decisions." },
  norms: { label: "Collaboration norms", hint: "How we behave together — one per line." },
};
const REVIEW_ORDER: Exclude<Section, "review">[] = ["purpose", "goals", "roles", "work_methods", "norms"];

const empty: Charter = { purpose: null, goals: [], roles: [], work_methods: {}, norms: [], status: "draft" };

function mapCharter(r: any): Charter {
  return {
    purpose: r.purpose ?? null,
    goals: Array.isArray(r.goals) ? r.goals : [],
    roles: Array.isArray(r.roles) ? r.roles : [],
    work_methods: r.work_methods && typeof r.work_methods === "object" ? r.work_methods : {},
    norms: Array.isArray(r.norms) ? r.norms : [],
    status: r.status ?? "draft",
  };
}
const linesToGoals = (t: string): Goal[] => t.split("\n").map((s) => s.trim()).filter(Boolean).map((text) => ({ text }));
const linesToNorms = (t: string) => t.split("\n").map((s) => s.trim()).filter(Boolean).map((text) => ({ text }));
const linesToRoles = (t: string): Role[] =>
  t.split("\n").map((s) => s.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(":");
    return i === -1 ? { name: line, responsibilities: "" } : { name: line.slice(0, i).trim(), responsibilities: line.slice(i + 1).trim() };
  });
const goalsToLines = (g: Goal[]) => g.map((x) => x.text).join("\n");
const normsToLines = (n: { text: string }[]) => n.map((x) => x.text).join("\n");
const rolesToLines = (r: Role[]) => r.map((x) => (x.responsibilities ? `${x.name}: ${x.responsibilities}` : x.name)).join("\n");

export function CharterModule({
  teamId,
  sessionId,
  isFacilitator,
  section,
  title,
  prompt,
  stepLabel,
  showReady,
  ready,
  onToggleReady,
}: {
  teamId: string | null;
  sessionId: string;
  isFacilitator: boolean;
  section: Section;
  title: string;
  prompt: string | null;
  stepLabel: string;
  showReady: boolean;
  ready: boolean;
  onToggleReady: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [charter, setCharter] = useState<Charter>(empty);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    const { data } = await supabase.from("team_charter").select("*").eq("team_id", teamId).maybeSingle();
    if (data) setCharter(mapCharter(data));
  }, [supabase, teamId]);

  useEffect(() => {
    load();
    if (!teamId) return;
    const ch = supabase
      .channel(`charter:${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_charter", filter: `team_id=eq.${teamId}` },
        (payload) => { if (payload.new) setCharter(mapCharter(payload.new as any)); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  function flashMsg(m: string) { setFlash(m); setTimeout(() => setFlash(null), 1800); }

  async function saveSection(sec: Exclude<Section, "review">) {
    if (!teamId) return;
    setSavingSection(sec);
    let value: unknown;
    if (sec === "purpose") value = { text: (draft.purpose ?? charter.purpose ?? "").trim() };
    else if (sec === "goals") value = linesToGoals(draft.goals ?? goalsToLines(charter.goals));
    else if (sec === "norms") value = linesToNorms(draft.norms ?? normsToLines(charter.norms));
    else if (sec === "roles") value = linesToRoles(draft.roles ?? rolesToLines(charter.roles));
    else value = {
      meetings: (draft.meetings ?? charter.work_methods.meetings ?? "").trim() || undefined,
      communication: (draft.communication ?? charter.work_methods.communication ?? "").trim() || undefined,
      tools: (draft.tools ?? charter.work_methods.tools ?? "").trim() || undefined,
      decisions: (draft.decisions ?? charter.work_methods.decisions ?? "").trim() || undefined,
    };
    const { error } = await supabase.rpc("save_charter_section", { p_team: teamId, p_section: sec, p_value: value as never });
    setSavingSection(null);
    if (error) flashMsg(error.message);
    else { flashMsg("Saved"); load(); }
  }

  async function compile() {
    if (!teamId) return;
    setCompiling(true);
    const { error } = await supabase.rpc("compile_charter", { p_team: teamId, p_session: sessionId });
    setCompiling(false);
    flashMsg(error ? error.message : "Charter compiled ✓");
    if (!error) load();
  }

  const dval = (k: string, fallback: string) => (draft[k] !== undefined ? draft[k] : fallback);
  const setD = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function editor(sec: Exclude<Section, "review">) {
    const meta = SECTION_META[sec];
    if (!isFacilitator) return readView(sec);
    return (
      <div className="chsec" key={sec}>
        <div className="chsec-h"><b>{meta.label}</b><span className="chhint">{meta.hint}</span></div>
        {sec === "purpose" ? (
          <textarea className="inp" rows={2} value={dval("purpose", charter.purpose ?? "")} placeholder="Why we exist…" onChange={(e) => setD("purpose", e.target.value)} />
        ) : sec === "work_methods" ? (
          <div className="two">
            {(["meetings", "communication", "tools", "decisions"] as const).map((k) => (
              <div className="field" key={k}>
                <label>{k}</label>
                <textarea className="inp" rows={2} value={dval(k, charter.work_methods[k] ?? "")} onChange={(e) => setD(k, e.target.value)} />
              </div>
            ))}
          </div>
        ) : (
          <textarea
            className="inp"
            rows={4}
            value={dval(sec, sec === "goals" ? goalsToLines(charter.goals) : sec === "norms" ? normsToLines(charter.norms) : rolesToLines(charter.roles))}
            placeholder={meta.hint}
            onChange={(e) => setD(sec, e.target.value)}
          />
        )}
        <div className="chsave">
          <button className="btn-prim" disabled={savingSection === sec} onClick={() => saveSection(sec)}>
            {savingSection === sec ? "Saving…" : "Save section"}
          </button>
        </div>
      </div>
    );
  }

  function readView(sec: Exclude<Section, "review">) {
    const meta = SECTION_META[sec];
    return (
      <div className="chsec" key={sec}>
        <div className="chsec-h"><b>{meta.label}</b></div>
        {sec === "purpose" ? (
          <p className="chbody">{charter.purpose || <span className="ro-empty">Not set yet</span>}</p>
        ) : sec === "work_methods" ? (
          <div className="chmethods">
            {(["meetings", "communication", "tools", "decisions"] as const).map((k) =>
              charter.work_methods[k] ? <div key={k}><span className="chk-label">{k}</span> {charter.work_methods[k]}</div> : null,
            )}
            {!Object.values(charter.work_methods).some(Boolean) ? <span className="ro-empty">Not set yet</span> : null}
          </div>
        ) : (
          <ul className="chlist">
            {sec === "goals" && charter.goals.map((g, i) => <li key={i}>{g.text}</li>)}
            {sec === "norms" && charter.norms.map((n, i) => <li key={i}>{n.text}</li>)}
            {sec === "roles" && charter.roles.map((r, i) => <li key={i}><b>{r.name}</b>{r.responsibilities ? ` — ${r.responsibilities}` : ""}</li>)}
            {((sec === "goals" && !charter.goals.length) || (sec === "norms" && !charter.norms.length) || (sec === "roles" && !charter.roles.length)) ? (
              <li className="ro-empty">Not set yet</li>
            ) : null}
          </ul>
        )}
      </div>
    );
  }

  const sections = section === "review" ? REVIEW_ORDER : [section];

  return (
    <div className="charterwrap">
      <div className="canvashead">
        <div>
          <div className="pact">{stepLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="cright">
          {charter.status === "active" ? <span className="pill sm" style={{ background: "var(--open-bg)", color: "var(--green)" }}>Active</span> : null}
          {showReady ? (
            <button className={`ready${ready ? " on" : ""}`} onClick={onToggleReady}>{ready ? "✓ You're ready" : "I'm ready"}</button>
          ) : null}
        </div>
      </div>
      {prompt ? <div className="canvasprompt">{prompt}</div> : null}

      <div className="charterbody">
        {sections.map((s) => (isFacilitator ? editor(s) : readView(s)))}
        {section === "review" && isFacilitator ? (
          <div className="chcompile">
            <button className="btn-prim" disabled={compiling} onClick={compile}>
              {compiling ? "Compiling…" : charter.status === "active" ? "Re-compile charter" : "Compile charter ▸"}
            </button>
            <span className="chhint">Locks it in as the team’s active working agreement.</span>
          </div>
        ) : null}
        {flash ? <div className="chflash">{flash}</div> : null}
      </div>
    </div>
  );
}
