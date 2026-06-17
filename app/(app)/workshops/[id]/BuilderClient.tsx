"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { ACTIVITY, clock } from "@/lib/util";
import type { Enums } from "@/types/database.types";
import {
  addBlock,
  updateBlock,
  deleteBlock,
  reorderBlocks,
  updateWorkshopTitle,
} from "../actions";

type Activity = Enums<"activity_type">;
type Dyn = Enums<"team_dynamic"> | "";

export type BlockRow = {
  id: string;
  title: string;
  activityType: Activity;
  duration: number;
  prompt: string | null;
  linkedDynamic: Enums<"team_dynamic"> | null;
};

const DYN: [Dyn, string][] = [
  ["", "— none —"],
  ["psych_safety", "Psychological safety"],
  ["trust", "Trust"],
  ["conflict_norms", "Conflict norms"],
  ["role_clarity", "Role clarity"],
  ["decision_rights", "Decision rights"],
];
const ACTS: Activity[] = ["checkin", "canvas", "vote", "discuss", "outcome"];

export function BuilderClient({
  workshop,
  teamName,
  canManage,
  blocks,
}: {
  workshop: { id: string; title: string };
  teamName: string;
  canManage: boolean;
  blocks: BlockRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  // block editor side-window
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState<Activity>("canvas");
  const [duration, setDuration] = useState(10);
  const [prompt, setPrompt] = useState("");
  const [dyn, setDyn] = useState<Dyn>("");
  const [error, setError] = useState<string | null>(null);

  // title editor
  const [titleOpen, setTitleOpen] = useState(false);
  const [wsTitle, setWsTitle] = useState(workshop.title);

  const totalMin = blocks.reduce((s, b) => s + b.duration, 0);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }
  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) flash(res.error);
      else {
        flash(ok);
        router.refresh();
      }
    });
  }

  function openAdd() {
    setEditId(null);
    setTitle("");
    setActivity("canvas");
    setDuration(10);
    setPrompt("");
    setDyn("");
    setError(null);
    setOpen(true);
  }
  function openEdit(b: BlockRow) {
    setEditId(b.id);
    setTitle(b.title);
    setActivity(b.activityType);
    setDuration(b.duration);
    setPrompt(b.prompt ?? "");
    setDyn(b.linkedDynamic ?? "");
    setError(null);
    setOpen(true);
  }
  async function saveBlock() {
    setError(null);
    const payload = {
      title,
      activityType: activity,
      duration: Number(duration) || 5,
      prompt: prompt || null,
      linkedDynamic: (dyn || null) as Enums<"team_dynamic"> | null,
    };
    const res = editId
      ? await updateBlock({ workshopId: workshop.id, blockId: editId, ...payload })
      : await addBlock({ workshopId: workshop.id, ...payload });
    if (res.error) return setError(res.error);
    setOpen(false);
    flash(editId ? "Step updated" : "Step added");
    router.refresh();
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const ids = blocks.map((b) => b.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => reorderBlocks(workshop.id, ids), "Reordered");
  }
  async function saveTitle() {
    const res = await updateWorkshopTitle(workshop.id, wsTitle);
    if (res.error) flash(res.error);
    else {
      setTitleOpen(false);
      flash("Workshop renamed");
      router.refresh();
    }
  }

  let acc = 0;

  return (
    <>
      <div className="summary" style={{ marginTop: 8 }}>
        <div className="stat">
          <div className="num" style={{ fontSize: 24 }}>
            {workshop.title}
          </div>
          <div className="lab">{teamName}</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num">{totalMin}</div>
          <div className="lab">Minutes</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num">{blocks.length}</div>
          <div className="lab">Blocks</div>
        </div>
        <div className="actions">
          {canManage ? (
            <button className="btn-sec" onClick={() => { setWsTitle(workshop.title); setTitleOpen(true); }}>
              Rename
            </button>
          ) : null}
          <button
            className="btn-prim"
            onClick={() => router.push(`/run/${workshop.id}`)}
          >
            Start session ▸
          </button>
        </div>
      </div>

      <div className="blocks">
        {blocks.map((b, i) => {
          const start = acc;
          acc += b.duration;
          const act = ACTIVITY[b.activityType] ?? { label: b.activityType, cls: "" };
          return (
            <div className="block" key={b.id}>
              <div className="time">
                <div className="t">{clock(start)}</div>
                <div className="d">{b.duration} min</div>
              </div>
              <div className="bcard">
                <div className="top">
                  <h4>{b.title}</h4>
                  <span className={`pill sm ${act.cls}`}>{act.label}</span>
                  <span className="sp" />
                  {canManage ? (
                    <>
                      <button className="icon-btn" title="Move up" disabled={pending || i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button className="icon-btn" title="Move down" disabled={pending || i === blocks.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button className="icon-btn" title="Edit" onClick={() => openEdit(b)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </button>
                      <button className="icon-btn danger" title="Delete" disabled={pending}
                        onClick={() => { if (confirm("Delete this step?")) run(() => deleteBlock(workshop.id, b.id), "Step removed"); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </>
                  ) : null}
                </div>
                {b.linkedDynamic ? (
                  <span className="grounded">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
                    Grounded · {DYN.find((d) => d[0] === b.linkedDynamic)?.[1]}
                  </span>
                ) : null}
                {b.prompt ? <div className="desc">{b.prompt}</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      {canManage ? (
        <div style={{ marginLeft: 78, marginTop: 4 }}>
          <button className="addlink" onClick={openAdd}>+ Add block</button>
        </div>
      ) : null}

      {/* block editor */}
      <SideWindow
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit block" : "Add block"}
        subtitle={workshop.title}
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={!title} onClick={saveBlock}>
                {editId ? "Save changes" : "Add block"}
              </button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        <div className="field">
          <label>Step name</label>
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Trust audit" />
        </div>
        <div className="two">
          <div className="field">
            <label>Activity type</label>
            <select className="inp" value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
              {ACTS.map((a) => (
                <option key={a} value={a}>{ACTIVITY[a].label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Minutes</label>
            <input className="inp" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>Facilitator prompt <span className="opt">(optional)</span></label>
          <textarea className="inp" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="The question you'll read aloud…" />
        </div>
        <div className="field">
          <label>Link to a team dynamic <span className="opt">(optional)</span></label>
          <select className="inp" value={dyn} onChange={(e) => setDyn(e.target.value as Dyn)}>
            {DYN.map((d) => (
              <option key={d[0]} value={d[0]}>{d[1]}</option>
            ))}
          </select>
          <div className="form-note">Linking shows a “Grounded” chip tying the step to the pulse.</div>
        </div>
      </SideWindow>

      {/* rename */}
      <SideWindow
        open={titleOpen}
        onClose={() => setTitleOpen(false)}
        title="Rename workshop"
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setTitleOpen(false)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={!wsTitle} onClick={saveTitle}>Save</button>
            </div>
          </>
        }
      >
        <div className="field">
          <label>Workshop title</label>
          <input className="inp" value={wsTitle} onChange={(e) => setWsTitle(e.target.value)} />
        </div>
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
