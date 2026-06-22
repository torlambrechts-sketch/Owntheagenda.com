"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTableControls } from "@/components/TableControls";
import type { ProgramView, TaskView, Member } from "./WorkflowClient";

const TASK_LABEL: Record<string, string> = {
  push_assessment: "Assessment",
  collect: "Collect",
  workshop: "Workshop",
  repulse: "Re-pulse",
  action: "Commitment",
};
function fmtDue(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Tabbed green table of flows — the Organization/Workshops tabbed-table
// pattern: a forest folder tab-band for status, the shared search/sort
// toolbar, and a white tbl-card. A row expands in place to reveal its run
// stages (provided by the parent via renderExpanded).

type Named = { id: string; name: string };

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Ongoing" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
];
const STATUS_PILL: Record<string, string> = { active: "open", completed: "open", archived: "draft" };
const statusLabel = (s: string) => (s === "completed" ? "Completed" : s === "archived" ? "Archived" : "Active");

export function FlowsTable({
  programs,
  teams,
  members,
  canManage,
  pending,
  onToggleTask,
  onAssignTask,
  onView,
  renderExpanded,
}: {
  programs: ProgramView[];
  teams: Named[];
  members: Member[];
  canManage: boolean;
  pending: boolean;
  onToggleTask: (task: TaskView, status: string) => void;
  onAssignTask: (taskId: string, ownerId: string | null, ownerName: string | null) => void;
  onView: (p: ProgramView) => void;
  renderExpanded: (p: ProgramView) => ReactNode;
}) {
  const [statusTab, setStatusTab] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const teamName = (id: string | null) => (id ? teams.find((t) => t.id === id)?.name ?? "—" : "—");

  const counts: Record<string, number> = { all: programs.length };
  for (const p of programs) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const tabs = STATUS_TABS.filter((t) => t.key === "all" || counts[t.key]);

  const tc = useTableControls<ProgramView>(programs, {
    search: { placeholder: "Search flows…", text: (p) => `${p.title} ${teamName(p.teamId)}` },
    sorts: [
      { key: "recent", label: "Most recent", cmp: () => 0 },
      { key: "title", label: "Name (A–Z)", cmp: (a, b) => a.title.localeCompare(b.title) },
      { key: "progress", label: "Furthest along", cmp: (a, b) => b.currentOrd - a.currentOrd },
    ],
  });
  const rows = statusTab === "all" ? tc.view : tc.view.filter((p) => p.status === statusTab);

  useEffect(() => {
    if (openId && !rows.some((r) => r.id === openId)) setOpenId(null);
  }, [rows, openId]);

  if (programs.length === 0) return null;

  return (
    <>
      <div className="cat-head" style={{ marginTop: 30 }}>
        Your flows <span className="n">{programs.length}</span>
      </div>
      <nav className="otabband" aria-label="Flow status">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`otabband-t${statusTab === t.key ? " on" : ""}`}
            onClick={() => setStatusTab(t.key)}
          >
            {t.label}
            <span className="otabband-c">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </nav>
      <div className="opanel">
        <div className="opanel-body">
          {programs.length >= 4 ? <div className="wk-listbar">{tc.controls}<span /></div> : null}
          {rows.length === 0 ? (
            <div className="empty">No flows match your filters.</div>
          ) : (
            <div className="tbl-card">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Flow</th>
                    <th style={{ width: 140 }}>Team</th>
                    <th style={{ width: 150 }}>Progress</th>
                    <th style={{ width: 96 }}>Due</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const open = openId === p.id;
                    const total = p.steps.length || 1;
                    const pct = Math.round((Math.min(p.currentOrd, total) / total) * 100);
                    const typeLabel = p.playKey ? "Play" : p.kind === "flow" ? "Flow" : "Program";
                    return (
                      <FlowRows
                        key={p.id}
                        id={p.id}
                        open={open}
                        onToggle={() => setOpenId(open ? null : p.id)}
                        title={p.title}
                        typeLabel={typeLabel}
                        team={teamName(p.teamId)}
                        stage={`Stage ${Math.min(p.currentOrd, total)} of ${total}`}
                        pct={pct}
                        dueAt={p.dueAt}
                        completed={p.status === "completed"}
                        statusPill={STATUS_PILL[p.status] ?? "draft"}
                        statusText={statusLabel(p.status)}
                        tasks={p.tasks}
                        members={members}
                        canManage={canManage}
                        pending={pending}
                        onToggleTask={onToggleTask}
                        onAssignTask={onAssignTask}
                        onView={() => onView(p)}
                        expanded={open ? renderExpanded(p) : null}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function isOverdue(due: string | null, done: boolean) {
  return !!due && !done && new Date(due) < new Date();
}

function TaskSubRow({
  t,
  members,
  canManage,
  pending,
  onToggleTask,
  onAssignTask,
}: {
  t: TaskView;
  members: Member[];
  canManage: boolean;
  pending: boolean;
  onToggleTask: (task: TaskView, status: string) => void;
  onAssignTask: (taskId: string, ownerId: string | null, ownerName: string | null) => void;
}) {
  const done = t.status === "done";
  const isAction = t.source === "action";
  const overdue = isOverdue(t.dueAt, done);
  return (
    <tr className="flow-subrow">
      <td>
        <span className="flow-sub">
          <button
            type="button"
            className={`flow-check${done ? " on" : ""}`}
            disabled={!canManage || pending}
            aria-label={done ? "Mark open" : "Mark done"}
            onClick={() => onToggleTask(t, done ? "open" : "done")}
          >
            {done ? "✓" : ""}
          </button>
          <span className={`pill sm ${isAction ? "internal" : done ? "open" : "draft"}`}>
            {TASK_LABEL[t.kind] ?? t.kind}
          </span>
          <span className={`flow-sub-title${done ? " done" : ""}`}>{t.title}</span>
        </span>
      </td>
      <td className="flow-sub-meta">
        {canManage && !isAction ? (
          <select
            className="inp sm flow-owner"
            value={t.ownerId ?? ""}
            disabled={pending}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const m = members.find((x) => x.id === e.target.value);
              onAssignTask(t.id, m?.id ?? null, m?.name ?? null);
            }}
          >
            <option value="">{t.ownerName ?? "Unassigned"}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          t.ownerName ?? "Unassigned"
        )}
      </td>
      <td className={`flow-sub-meta${overdue ? " overdue" : ""}`}>
        {fmtDue(t.dueAt)}
        {overdue ? " · overdue" : ""}
      </td>
      <td colSpan={3} className="flow-sub-meta">{done ? "Done" : "To do"}</td>
    </tr>
  );
}

function FlowRows({
  id,
  open,
  onToggle,
  title,
  typeLabel,
  team,
  stage,
  pct,
  dueAt,
  completed,
  statusPill,
  statusText,
  tasks,
  members,
  canManage,
  pending,
  onToggleTask,
  onAssignTask,
  onView,
  expanded,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  onView: () => void;
  title: string;
  typeLabel: string;
  team: string;
  stage: string;
  pct: number;
  dueAt: string | null;
  completed: boolean;
  statusPill: string;
  statusText: string;
  tasks: TaskView[];
  members: Member[];
  canManage: boolean;
  pending: boolean;
  onToggleTask: (task: TaskView, status: string) => void;
  onAssignTask: (taskId: string, ownerId: string | null, ownerName: string | null) => void;
  expanded: ReactNode;
}) {
  const [showCommitments, setShowCommitments] = useState(false);
  const drivers = tasks.filter((t) => t.source === "flow" && t.status !== "skipped");
  const commitments = tasks.filter((t) => t.source === "action" && t.status !== "skipped");
  const flowOverdue = isOverdue(dueAt, completed);
  return (
    <>
      <tr
        className={`flow-row${open ? " open" : ""}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td>
          <span className="flow-cell">
            <span className="flow-title">{title}</span>
            <span className={`pill sm ${typeLabel === "Program" ? "interview" : "internal"}`}>{typeLabel}</span>
          </span>
        </td>
        <td>{team}</td>
        <td>
          <span className="flow-prog-row">
            <span className="a-progress flow-prog"><span style={{ width: `${pct}%` }} /></span>
            <small>{stage}</small>
          </span>
        </td>
        <td className={`flow-due${flowOverdue ? " overdue" : ""}`}>
          {fmtDue(dueAt)}
          {flowOverdue ? <span className="flow-due-flag">overdue</span> : null}
        </td>
        <td><span className={`pill sm ${statusPill}`}>{statusText}</span></td>
        <td className="r">
          <button className="linkbtn" style={{ marginRight: 10 }} onClick={(e) => { e.stopPropagation(); onView(); }}>View ›</button>
          <span className={`flow-chev${open ? " open" : ""}`}>▾</span>
        </td>
      </tr>

      {drivers.map((t) => (
        <TaskSubRow
          key={t.id}
          t={t}
          members={members}
          canManage={canManage}
          pending={pending}
          onToggleTask={onToggleTask}
          onAssignTask={onAssignTask}
        />
      ))}

      {commitments.length ? (
        <tr className="flow-subrow flow-commit-toggle" onClick={() => setShowCommitments((v) => !v)}>
          <td colSpan={6}>
            <span className="flow-sub flow-commit-head">
              <span className={`flow-chev xs${showCommitments ? " open" : ""}`}>▾</span>
              {commitments.length} commitment{commitments.length === 1 ? "" : "s"} from the workshop
              <span className="flow-commit-done">
                {commitments.filter((c) => c.status === "done").length}/{commitments.length} done
              </span>
            </span>
          </td>
        </tr>
      ) : null}
      {showCommitments
        ? commitments.map((t) => (
            <TaskSubRow
              key={t.id}
              t={t}
              members={members}
              canManage={canManage}
              pending={pending}
              onToggleTask={onToggleTask}
              onAssignTask={onAssignTask}
            />
          ))
        : null}

      {open ? (
        <tr className="flow-exp-row">
          <td colSpan={6}>
            <div className="flow-exp">{expanded}</div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
