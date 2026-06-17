"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Decision = {
  id: string;
  title: string;
  rationale: string | null;
  status: string;
  deciderId: string | null;
  resourceNote: string | null;
};
type Contrib = { decisionId: string; userId: string; agreement: number | null };
type P = { userId: string; name: string };

export function DecisionsPanel({
  sessionId,
  userId,
  isFacilitator,
  participants,
}: {
  sessionId: string;
  userId: string;
  isFacilitator: boolean;
  participants: P[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [contribs, setContribs] = useState<Contrib[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [resourceDraft, setResourceDraft] = useState<Record<string, string>>({});
  const [actText, setActText] = useState<Record<string, string>>({});
  const [actOwner, setActOwner] = useState<Record<string, string>>({});
  const [actDue, setActDue] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    const { data: ds } = await supabase
      .from("decision")
      .select("id, title, rationale, status, decider_user_id, resource_note")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    const rows = (ds ?? []).map((d: any) => ({
      id: d.id, title: d.title, rationale: d.rationale, status: d.status,
      deciderId: d.decider_user_id, resourceNote: d.resource_note,
    }));
    setDecisions(rows);
    const ids = rows.map((r) => r.id);
    const { data: cs } = ids.length
      ? await supabase.from("decision_contributor").select("decision_id, user_id, agreement").in("decision_id", ids)
      : { data: [] as any[] };
    setContribs((cs ?? []).map((c: any) => ({ decisionId: c.decision_id, userId: c.user_id, agreement: c.agreement })));
  }, [supabase, sessionId]);

  useEffect(() => {
    reload();
    const ch = supabase
      .channel(`decisions:${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decision", filter: `session_id=eq.${sessionId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "decision_contributor" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const nameOf = (uid: string | null) => (uid ? participants.find((p) => p.userId === uid)?.name ?? "Member" : null);
  const forDecision = (id: string) => contribs.filter((c) => c.decisionId === id && c.agreement != null);
  const myAgreement = (id: string) => forDecision(id).find((c) => c.userId === userId)?.agreement ?? null;
  const oppose = (id: string) => forDecision(id).filter((c) => c.agreement === 1).length;
  const avg = (id: string) => {
    const xs = forDecision(id).map((c) => c.agreement!) as number[];
    return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null;
  };

  function flashErr(m: string) {
    setErr(m);
    setTimeout(() => setErr(null), 3200);
  }
  async function call<T>(p: Promise<{ error: { message: string } | null }>): Promise<boolean> {
    const { error } = await p;
    if (error) { flashErr(error.message); return false; }
    await reload();
    return true;
  }

  async function add() {
    if (!title.trim()) return;
    const ok = await call(supabase.rpc("create_decision", { p_session: sessionId, p_title: title.trim() }) as any);
    if (ok) setTitle("");
  }
  const setDecider = (id: string, uid: string) => call(supabase.rpc("set_daci", { p_decision: id, p_user: uid, p_role: "approver" }) as any);
  const saveResource = (id: string) => call(supabase.rpc("update_decision", { p_decision: id, p_resource_note: resourceDraft[id] ?? "" }) as any);
  const recordMine = (id: string, lvl: number) => call(supabase.rpc("record_agreement", { p_decision: id, p_level: lvl }) as any);
  const supersede = (id: string) => call(supabase.rpc("supersede_decision", { p_decision: id }) as any);
  async function commit(id: string) {
    const { error } = await supabase.rpc("commit_decision", { p_decision: id });
    if (!error) return reload();
    if (/opposition/i.test(error.message)) {
      const note = window.prompt("Opposition was recorded. Enter a written override rationale to commit anyway:");
      if (!note || !note.trim()) return;
      await call(supabase.rpc("commit_decision", { p_decision: id, p_override_note: note.trim() }) as any);
    } else {
      flashErr(error.message);
    }
  }
  async function addAction(id: string) {
    const ok = await call(
      supabase.rpc("add_decision_action", {
        p_decision: id,
        p_text: (actText[id] ?? "").trim(),
        p_owner: (actOwner[id] ?? "").trim(),
        p_due: actDue[id] || null,
      }) as any,
    );
    if (ok) { setActText((s) => ({ ...s, [id]: "" })); setActOwner((s) => ({ ...s, [id]: "" })); setActDue((s) => ({ ...s, [id]: "" })); }
  }

  return (
    <div className="rs dpanel">
      <h5>
        Decisions <span style={{ color: "var(--faint)" }}>{decisions.filter((d) => d.status === "committed").length} committed</span>
      </h5>

      {err ? <div className="form-err" style={{ marginBottom: 8 }}>{err}</div> : null}

      {decisions.map((d) => {
        const open = openId === d.id;
        const committed = d.status === "committed";
        const superseded = d.status === "superseded";
        const op = oppose(d.id);
        return (
          <div className={`dcard${committed ? " done" : ""}${superseded ? " gone" : ""}`} key={d.id}>
            <div className="dtop" onClick={() => setOpenId(open ? null : d.id)}>
              <span className={`pill sm ${committed ? "open" : superseded ? "reject" : "draft"}`}>{d.status}</span>
              <span className="dt">{d.title}</span>
              <span className="caret">{open ? "▾" : "▸"}</span>
            </div>

            {open && !superseded ? (
              <div className="dbody">
                {/* gradient of agreement (everyone) */}
                <div className="dlabel">Your agreement</div>
                <div className="fist sm">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} className={myAgreement(d.id) === v ? "sel" : ""} onClick={() => recordMine(d.id, v)}>{v}</button>
                  ))}
                </div>
                <div className="dmeta">
                  {avg(d.id) ? <>avg {avg(d.id)} · {forDecision(d.id).length} in</> : "no agreement yet"}
                  {op > 0 ? <span className="oppose"> · {op} oppose</span> : null}
                </div>

                {isFacilitator && !committed ? (
                  <>
                    <div className="dlabel">Decider (Approver)</div>
                    <select className="inp sm" value={d.deciderId ?? ""} onChange={(e) => setDecider(d.id, e.target.value)}>
                      <option value="" disabled>Name a decider…</option>
                      {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
                    </select>

                    <div className="dlabel">Resourcing note <span className="opt">— what are we stopping to fund this?</span></div>
                    <textarea
                      className="inp sm"
                      rows={2}
                      value={resourceDraft[d.id] ?? d.resourceNote ?? ""}
                      onChange={(e) => setResourceDraft((s) => ({ ...s, [d.id]: e.target.value }))}
                      onBlur={() => saveResource(d.id)}
                      placeholder="e.g. Pause the Helsinki pilot"
                    />
                    <div className="drow">
                      <button className="btn-prim sm" onClick={() => commit(d.id)}>Commit ▸</button>
                      <button className="btn-sec sm" onClick={() => supersede(d.id)}>Supersede</button>
                    </div>
                  </>
                ) : null}

                {committed ? (
                  <>
                    <div className="dmeta">Decider · {nameOf(d.deciderId) ?? "—"}</div>
                    {d.resourceNote ? <div className="dmeta">Resourcing · {d.resourceNote}</div> : null}
                    <div className="dlabel">Add an action (owner + due required)</div>
                    <input className="inp sm" placeholder="Action…" value={actText[d.id] ?? ""} onChange={(e) => setActText((s) => ({ ...s, [d.id]: e.target.value }))} />
                    <div className="drow">
                      <input className="inp sm" placeholder="Owner" value={actOwner[d.id] ?? ""} onChange={(e) => setActOwner((s) => ({ ...s, [d.id]: e.target.value }))} />
                      <input className="inp sm" type="date" value={actDue[d.id] ?? ""} onChange={(e) => setActDue((s) => ({ ...s, [d.id]: e.target.value }))} />
                    </div>
                    <button className="btn-sec sm" disabled={!(actText[d.id] ?? "").trim() || !(actOwner[d.id] ?? "").trim() || !actDue[d.id]} onClick={() => addAction(d.id)}>+ Action</button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="dadd">
        <input className="inp sm" placeholder="Capture a decision…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button className="btn-prim sm" disabled={!title.trim()} onClick={add}>Add</button>
      </div>
    </div>
  );
}
