"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { useTableControls } from "@/components/TableControls";
import { initials } from "@/lib/util";
import { addAction, editAction, toggleAction, removeAction } from "./actions";

export type ActionRow = {
  id: string;
  text: string;
  owner: string | null;
  ownerId: string | null;
  status: "open" | "done";
  dueAt: string | null;
  teamId: string | null;
  teamName: string;
  workshopId: string | null;
  workshopTitle: string | null;
};
export type TeamOpt = { id: string; name: string };
export type MemberOpt = { id: string; name: string };

const OTHER = "__other";

type Filter = "open" | "done" | "all";

// Relative, human due label + urgency class (only "live" while still open).
function dueInfo(dueAt: string | null, status: string) {
  if (!dueAt) return null;
  const due = new Date(dueAt + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  const label = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  let cls = "";
  let rel = label;
  if (status === "open") {
    if (days < 0) {
      cls = "over";
      rel = `${label} · overdue`;
    } else if (days === 0) {
      cls = "soon";
      rel = "Due today";
    } else if (days === 1) {
      cls = "soon";
      rel = "Due tomorrow";
    } else if (days <= 3) {
      cls = "soon";
    }
  }
  return { cls, rel, days };
}

export function ActionsClient({
  rows,
  teams,
  members,
}: {
  rows: ActionRow[];
  teams: TeamOpt[];
  members: MemberOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");

  // editor side-window
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [text, setText] = useState("");
  // ownerSel: "" = unassigned, a member id, or OTHER (free-text name)
  const [ownerSel, setOwnerSel] = useState("");
  const [ownerText, setOwnerText] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Team", "Action", "Owner", "Due", "Status", "Source"].map(esc).join(",");
    const body = rows.map((r) =>
      [r.teamName, r.text, r.owner ?? "", r.dueAt ?? "", r.status, r.workshopTitle ?? ""].map(esc).join(","),
    );
    const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "owntheagenda-actions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const openCount = rows.filter((r) => r.status === "open").length;
  const doneCount = rows.length - openCount;
  const soonCount = rows.filter((r) => {
    if (r.status !== "open") return false;
    const info = dueInfo(r.dueAt, r.status);
    return info ? info.days <= 7 : false;
  }).length;

  const ac = useTableControls<ActionRow>(rows, {
    search: { placeholder: "Search actions…", text: (r) => `${r.text} ${r.owner ?? ""} ${r.teamName}` },
    sorts: [
      { key: "team", label: "By team", cmp: () => 0 },
      { key: "due", label: "Due (soonest)", cmp: (a, b) => { const ad = a.dueAt ?? "9999-12-31"; const bd = b.dueAt ?? "9999-12-31"; return ad < bd ? -1 : ad > bd ? 1 : 0; } },
      { key: "owner", label: "Owner (A–Z)", cmp: (a, b) => (a.owner ?? "~").localeCompare(b.owner ?? "~") },
    ],
  });

  const visible = useMemo(
    () => ac.view.filter((r) => (filter === "all" ? true : r.status === filter)),
    [ac.view, filter],
  );

  // Open before done; within a status, soonest due first (no-due sinks last).
  function ordered(items: ActionRow[]) {
    return [...items].sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      const ad = a.dueAt ?? "9999-12-31";
      const bd = b.dueAt ?? "9999-12-31";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
  }

  const groups = teams
    .map((t) => ({ team: t, items: ordered(visible.filter((r) => r.teamId === t.id)) }))
    .filter((g) => g.items.length > 0);
  const orphans = ordered(
    visible.filter((r) => !r.teamId || !teams.some((t) => t.id === r.teamId)),
  );

  function openAdd() {
    setEditId(null);
    setTeamId(teams[0]?.id ?? "");
    setText("");
    setOwnerSel("");
    setOwnerText("");
    setDue("");
    setError(null);
    setOpen(true);
  }
  function openEdit(r: ActionRow) {
    setEditId(r.id);
    setTeamId(r.teamId ?? teams[0]?.id ?? "");
    setText(r.text);
    // Linked teammate → select them; free-text name → "Someone else"; neither → unassigned.
    if (r.ownerId && members.some((m) => m.id === r.ownerId)) {
      setOwnerSel(r.ownerId);
      setOwnerText("");
    } else if (r.owner) {
      setOwnerSel(OTHER);
      setOwnerText(r.owner);
    } else {
      setOwnerSel("");
      setOwnerText("");
    }
    setDue(r.dueAt ?? "");
    setError(null);
    setOpen(true);
  }
  async function save() {
    setError(null);
    let ownerId: string | null = null;
    let ownerName: string | null = null;
    if (ownerSel === OTHER) {
      ownerName = ownerText.trim() || null;
    } else if (ownerSel) {
      ownerId = ownerSel;
      ownerName = members.find((m) => m.id === ownerSel)?.name ?? null;
    }
    const res = editId
      ? await editAction({ id: editId, text, owner: ownerName, ownerId, dueAt: due || null })
      : await addAction({ teamId, text, owner: ownerName, ownerId, dueAt: due || null });
    if (res.error) return setError(res.error);
    setOpen(false);
    flash(editId ? "Action updated" : "Action added");
    router.refresh();
  }
  function toggle(r: ActionRow) {
    startTransition(async () => {
      const res = await toggleAction(r.id);
      if (res.error) flash(res.error);
      else router.refresh();
    });
  }
  function remove(r: ActionRow) {
    if (!confirm("Delete this action?")) return;
    startTransition(async () => {
      const res = await removeAction(r.id);
      if (res.error) flash(res.error);
      else {
        flash("Action deleted");
        router.refresh();
      }
    });
  }

  const tabs: [Filter, string, number][] = [
    ["open", "Open", openCount],
    ["done", "Done", doneCount],
    ["all", "All", rows.length],
  ];

  const row = (r: ActionRow) => {
    const info = dueInfo(r.dueAt, r.status);
    const done = r.status === "done";
    return (
      <div className={`aitem${done ? " done" : ""}`} key={r.id}>
        <button
          className={`chk${done ? " on" : ""}`}
          disabled={pending}
          onClick={() => toggle(r)}
          aria-label={done ? "Mark open" : "Mark done"}
          title={done ? "Mark open" : "Mark done"}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
        <div className="abody">
          <div className="atext">{r.text}</div>
          <div className="ameta">
            {r.owner ? (
              <span className="owner">
                <span className="av sm">{initials(r.owner)}</span>
                {r.owner}
              </span>
            ) : (
              <span className="unassigned">No owner</span>
            )}
            {info ? (
              <span className={`due ${info.cls}`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="17" rx="2" />
                  <path d="M3 9h18M8 2v4M16 2v4" />
                </svg>
                {info.rel}
              </span>
            ) : null}
            {r.workshopId ? (
              <Link className="asrc" href={`/workshops/${r.workshopId}`}>
                from {r.workshopTitle ?? "session"}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="atools">
          <button className="icon-btn" title="Edit" onClick={() => openEdit(r)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button className="icon-btn danger" title="Delete" disabled={pending} onClick={() => remove(r)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="summary">
        <div className="stat">
          <div className="num">{openCount}</div>
          <div className="lab">Open</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num">{soonCount}</div>
          <div className="lab">Due this week</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num">{doneCount}</div>
          <div className="lab">Completed</div>
        </div>
        <div className="actions">
          <button className="btn-prim" onClick={openAdd}>
            + New action
          </button>
        </div>
      </div>

      <div className="act-top">
        <div className="segbar">
          {tabs.map(([f, label, n]) => (
            <button
              key={f}
              className={`seg${filter === f ? " on" : ""}`}
              onClick={() => setFilter(f)}
            >
              {label} <span className="sn">{n}</span>
            </button>
          ))}
        </div>
        <button className="btn-sec" style={{ marginLeft: "auto" }} disabled={!rows.length} onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      {rows.length >= 4 ? ac.controls : null}

      {ac.active ? (
        visible.length ? (
          <div className="tbl-card">{visible.map(row)}</div>
        ) : (
          <div className="card empty">No actions match these filters.</div>
        )
      ) : (
        <>
          {groups.length === 0 && orphans.length === 0 ? (
            <div className="card empty">
              {filter === "open"
                ? "No open actions — you're all caught up."
                : filter === "done"
                  ? "No completed actions yet."
                  : "No actions yet. Run a session or add one to start the loop."}
            </div>
          ) : null}

          {groups.map(({ team, items }) => (
            <div key={team.id}>
              <div className="cat-head" style={{ fontSize: 16 }}>
                {team.name} <span className="n">{items.length}</span>
              </div>
              <div className="tbl-card">{items.map(row)}</div>
            </div>
          ))}

          {orphans.length > 0 ? (
            <div>
              <div className="cat-head" style={{ fontSize: 16 }}>
                Unassigned <span className="n">{orphans.length}</span>
              </div>
              <div className="tbl-card">{orphans.map(row)}</div>
            </div>
          ) : null}
        </>
      )}

      <SideWindow
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit action" : "New action"}
        subtitle={editId ? undefined : "Capture a commitment to track"}
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <div className="right">
              <button
                className="btn-prim"
                disabled={!text.trim() || (!editId && !teamId)}
                onClick={save}
              >
                {editId ? "Save changes" : "Add action"}
              </button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        {!editId ? (
          <div className="field">
            <label>Team</label>
            <select className="inp" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label>Action</label>
          <textarea
            className="inp"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Publish a decision-rights map for recurring calls"
          />
        </div>
        <div className="two">
          <div className="field">
            <label>
              Owner <span className="opt">(optional)</span>
            </label>
            <select
              className="inp"
              value={ownerSel}
              onChange={(e) => setOwnerSel(e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value={OTHER}>Someone else…</option>
            </select>
            {ownerSel === OTHER ? (
              <input
                className="inp"
                style={{ marginTop: 6 }}
                value={ownerText}
                onChange={(e) => setOwnerText(e.target.value)}
                placeholder="Name"
              />
            ) : null}
          </div>
          <div className="field">
            <label>
              Due date <span className="opt">(optional)</span>
            </label>
            <input
              className="inp"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
        </div>
        {ownerSel && ownerSel !== OTHER ? (
          <p className="form-note">
            We&rsquo;ll remind {members.find((m) => m.id === ownerSel)?.name ?? "them"} when this is due.
          </p>
        ) : null}
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
