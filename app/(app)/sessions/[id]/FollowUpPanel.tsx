"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { scheduleFollowUp, skipFollowUp, completeFollowUp, rescheduleFollowUp } from "./followup-actions";

export type FollowUp = {
  id: string;
  kind: string;
  title: string;
  owner_id: string | null;
  scheduled_at: string | null;
  workshop_id: string | null;
  status: string;
};

const KINDS = [
  { key: "check_in", label: "Check-in", blurb: "A quick review of progress", spawn: false, days: 7 },
  { key: "remeasure", label: "Re-measure", blurb: "Re-run an assessment to see the shift", spawn: true, days: 90 },
  { key: "working_session", label: "Working session", blurb: "Another workshop to keep building", spawn: true, days: 14 },
  { key: "meeting", label: "Meeting", blurb: "A calendar hold to follow up", spawn: false, days: 7 },
];
const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function isOverdue(d: string | null, status: string) {
  if (!d || status !== "planned") return false;
  return d.slice(0, 10) < new Date().toISOString().slice(0, 10);
}
function escIcs(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/[\r\n]+/g, "\\n");
}
function downloadIcs(title: string, when: string | null) {
  const base = (when ?? new Date().toISOString()).slice(0, 10);
  const day = base.replace(/-/g, "");
  const endD = new Date(base + "T00:00:00");
  endD.setDate(endD.getDate() + 1);
  const end = endD.toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OwnTheAgenda//Follow-up//EN", "BEGIN:VEVENT",
    `UID:${Math.random().toString(36).slice(2)}@owntheagenda`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${escIcs(title)}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.slice(0, 40)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function FollowUpPanel({
  sessionId,
  canManage,
  followUps,
  templates,
  members,
  backSession,
  commitments,
}: {
  sessionId: string;
  canManage: boolean;
  followUps: FollowUp[];
  templates: { id: string; name: string; category: string }[];
  members: { id: string; name: string }[];
  backSession?: string | null;
  commitments?: { done: number; total: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("check_in");
  const [title, setTitle] = useState("Check-in on commitments");
  const [when, setWhen] = useState(plusDays(7));
  const [owner, setOwner] = useState("");
  const [template, setTemplate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editWhen, setEditWhen] = useState("");
  const [editTitle, setEditTitle] = useState("");

  const def = KINDS.find((k) => k.key === kind)!;
  const ownerName = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;

  function pickKind(k: typeof KINDS[number]) {
    setKind(k.key);
    setWhen(plusDays(k.days));
    setTitle(k.key === "remeasure" ? "Re-measure" : k.key === "working_session" ? "Working session" : k.key === "meeting" ? "Follow-up meeting" : "Check-in on commitments");
    if (k.spawn && !template) {
      const re = templates.find((t) => /re-?measure/i.test(t.name) || /remeasure/i.test(t.id));
      setTemplate((k.key === "remeasure" && re ? re.id : templates[0]?.id) ?? "");
    }
  }
  function submit() {
    setErr(null);
    start(async () => {
      const res = await scheduleFollowUp({
        sessionId, kind, title, when,
        owner: owner || null,
        template: def.spawn ? template || null : null,
      });
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }
  function skip(id: string) {
    start(async () => {
      await skipFollowUp(sessionId, id);
      router.refresh();
    });
  }
  function complete(id: string) {
    start(async () => {
      await completeFollowUp(sessionId, id);
      router.refresh();
    });
  }
  function startEdit(f: FollowUp) {
    setEditId(f.id);
    setEditWhen((f.scheduled_at ?? "").slice(0, 10));
    setEditTitle(f.title);
  }
  function saveEdit() {
    if (!editId || !editWhen) return;
    start(async () => {
      await rescheduleFollowUp(sessionId, editId, editWhen, editTitle);
      setEditId(null);
      router.refresh();
    });
  }

  const active = followUps.filter((f) => f.status !== "skipped");

  return (
    <div className="ro-block">
      <div className="ro-block-h">
        <h3>Next steps</h3>
        {canManage && !open ? <button className="btn-prim" onClick={() => setOpen(true)}>Plan the follow-up ▸</button> : null}
      </div>

      {(backSession || (commitments && commitments.total > 0)) ? (
        <div className="fu-context">
          {backSession ? <Link className="linkbtn xs" href={`/sessions/${backSession}`}>↩ Continues a prior session</Link> : null}
          {commitments && commitments.total > 0 ? (
            <span className="fu-commit">{commitments.done} of {commitments.total} plan tasks done</span>
          ) : null}
        </div>
      ) : null}

      {active.length ? (
        <div className="fu-list">
          {active.map((f) => (
            <div className="fu-item" key={f.id}>
              <span className={`pill sm ${f.status === "completed" ? "open" : "draft"}`}>{KIND_LABEL[f.kind] ?? f.kind}</span>
              {editId === f.id ? (
                <div className="fu-edit">
                  <input className="inp" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
                  <input className="inp" type="date" value={editWhen} onChange={(e) => setEditWhen(e.target.value)} />
                  <button className="linkbtn xs" disabled={pending || !editWhen} onClick={saveEdit}>Save</button>
                  <button className="linkbtn xs" onClick={() => setEditId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div className="fu-main">
                    <div className="fu-title">{f.title}</div>
                    <div className="fu-meta">
                      <span className={isOverdue(f.scheduled_at, f.status) ? "fu-overdue" : ""}>{fmt(f.scheduled_at)}</span>
                      {isOverdue(f.scheduled_at, f.status) ? " · overdue" : ""}
                      {ownerName(f.owner_id) ? ` · ${ownerName(f.owner_id)}` : ""}
                      {f.status === "completed" ? " · done" : ""}
                    </div>
                  </div>
                  <div className="fu-act">
                    <button className="linkbtn xs" onClick={() => downloadIcs(f.title, f.scheduled_at)}>Add to calendar</button>
                    {f.workshop_id ? <Link className="linkbtn xs" href={`/run/${f.workshop_id}`}>Open ▸</Link> : null}
                    {canManage && f.status === "planned" ? <button className="linkbtn xs" disabled={pending} onClick={() => startEdit(f)}>Reschedule</button> : null}
                    {canManage && f.status === "planned" ? <button className="linkbtn xs" disabled={pending} onClick={() => complete(f.id)}>Mark complete</button> : null}
                    {canManage && f.status === "planned" ? <button className="linkbtn xs" disabled={pending} onClick={() => skip(f.id)}>Skip</button> : null}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        !open ? <div className="ro-empty">No follow-up scheduled yet.</div> : null
      )}

      {open ? (
        <div className="fu-form">
          <div className="fu-kinds">
            {KINDS.map((k) => (
              <button key={k.key} className={`fu-kind${kind === k.key ? " on" : ""}`} onClick={() => pickKind(k)}>
                <b>{k.label}</b><span>{k.blurb}</span>
              </button>
            ))}
          </div>
          <div className="fu-fields">
            <label className="field"><span>Title</span>
              <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field"><span>When</span>
              <input className="inp" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <label className="field"><span>Owner</span>
              <select className="inp" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">— unassigned —</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            {def.spawn ? (
              <label className="field"><span>From template</span>
                <select className="inp" value={template} onChange={(e) => setTemplate(e.target.value)}>
                  <option value="" disabled>— choose a template —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <small className="field-hint">This spins up a ready-to-run session you can open later.</small>
              </label>
            ) : null}
          </div>
          {err ? <div className="form-err">{err}</div> : null}
          <div className="fu-foot">
            <button className="btn-sec" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-prim" disabled={pending || (def.spawn && !template)} onClick={submit}>Schedule ▸</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
