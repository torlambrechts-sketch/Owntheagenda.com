"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { submitRequest, setVote, setStatus } from "./actions";

export type RoadmapItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string | null;
  vote_count: number;
  created_by: string | null;
};

const COLUMNS = [
  { key: "planned", label: "Planned" },
  { key: "in_progress", label: "In progress" },
  { key: "shipped", label: "Shipped" },
];
const STATUS_OPTS = ["requested", "planned", "in_progress", "shipped", "declined"];

export function RoadmapClient({
  items,
  votedIds,
  isStaff,
}: {
  items: RoadmapItem[];
  votedIds: string[];
  isStaff: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [voted, setVoted] = useState<Set<string>>(new Set(votedIds));
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.vote_count])),
  );
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function toggleVote(it: RoadmapItem) {
    const on = !voted.has(it.id);
    setVoted((prev) => {
      const n = new Set(prev);
      if (on) n.add(it.id);
      else n.delete(it.id);
      return n;
    });
    setCounts((prev) => ({ ...prev, [it.id]: Math.max(0, (prev[it.id] ?? 0) + (on ? 1 : -1)) }));
    start(async () => {
      const res = await setVote(it.id, on);
      if (res.error) {
        flash(res.error);
        router.refresh();
      }
    });
  }

  function changeStatus(id: string, status: string) {
    start(async () => {
      const res = await setStatus(id, status);
      if (res.error) flash(res.error);
      else {
        flash("Updated");
        router.refresh();
      }
    });
  }

  async function submit() {
    setErr(null);
    const res = await submitRequest(title, desc);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setTitle("");
    setDesc("");
    setOpen(false);
    flash("Request submitted — thanks!");
    router.refresh();
  }

  const requested = items.filter((i) => i.status === "requested");

  function itemCard(it: RoadmapItem) {
    const isVoted = voted.has(it.id);
    return (
      <div className="rm-item" key={it.id}>
        <button className={`rm-vote${isVoted ? " on" : ""}`} disabled={pending} onClick={() => toggleVote(it)} title={isVoted ? "Remove vote" : "Upvote"}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M6 11l6-6 6 6" /></svg>
          <span>{counts[it.id] ?? 0}</span>
        </button>
        <div className="rm-body">
          <b>{it.title}</b>
          {it.description ? <span>{it.description}</span> : null}
          {isStaff ? (
            <select className="inp rm-status" value={it.status} disabled={pending} onChange={(e) => changeStatus(it.id, e.target.value)}>
              {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="roadmap">
      <div className="rm-top">
        <button className="btn-prim" onClick={() => { setErr(null); setOpen(true); }}>Request a feature</button>
      </div>

      {requested.length ? (
        <section className="rm-triage">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            {isStaff ? "Requests to triage" : "Your requests"} <span className="n">{requested.length}</span>
          </div>
          <div className="rm-list">{requested.map(itemCard)}</div>
        </section>
      ) : null}

      <div className="rm-cols">
        {COLUMNS.map((col) => {
          const colItems = items.filter((i) => i.status === col.key);
          return (
            <div className="rm-col" key={col.key}>
              <div className="rm-col-h">{col.label}<span className="n">{colItems.length}</span></div>
              <div className="rm-list">
                {colItems.length ? colItems.map(itemCard) : <div className="rm-empty">Nothing here yet.</div>}
              </div>
            </div>
          );
        })}
      </div>

      <SideWindow
        open={open}
        onClose={() => setOpen(false)}
        title="Request a feature"
        subtitle="Tell us what would help your teams"
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setOpen(false)}>Cancel</button>
            <div className="right"><button className="btn-prim" disabled={!title.trim()} onClick={submit}>Submit</button></div>
          </>
        }
      >
        {err ? <div className="form-err">{err}</div> : null}
        <div className="field">
          <label htmlFor="rm-t">Title</label>
          <input className="inp" id="rm-t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Notion integration" />
        </div>
        <div className="field">
          <label htmlFor="rm-d">Details <span className="opt">(optional)</span></label>
          <textarea className="inp" id="rm-d" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What problem would it solve?" />
        </div>
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
