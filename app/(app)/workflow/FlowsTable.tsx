"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTableControls } from "@/components/TableControls";
import type { ProgramView, TaskView } from "./WorkflowClient";

const TASK_LABEL: Record<string, string> = {
  push_assessment: "Assessment",
  collect: "Collect",
  workshop: "Workshop",
  repulse: "Re-pulse",
  action: "Action",
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
  canManage,
  pending,
  onToggleTask,
  renderExpanded,
}: {
  programs: ProgramView[];
  teams: Named[];
  canManage: boolean;
  pending: boolean;
  onToggleTask: (taskId: string, status: string) => void;
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
                    <th style={{ width: 160 }}>Team</th>
                    <th style={{ width: 170 }}>Progress</th>
                    <th style={{ width: 110 }}>Status</th>
                    <th style={{ width: 48 }} />
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
                        open={open}
                        onToggle={() => setOpenId(open ? null : p.id)}
                        title={p.title}
                        typeLabel={typeLabel}
                        team={teamName(p.teamId)}
                        stage={`Stage ${Math.min(p.currentOrd, total)} of ${total}`}
                        pct={pct}
                        statusPill={STATUS_PILL[p.status] ?? "draft"}
                        statusText={statusLabel(p.status)}
                        tasks={p.tasks}
                        canManage={canManage}
                        pending={pending}
                        onToggleTask={onToggleTask}
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

function FlowRows({
  open,
  onToggle,
  title,
  typeLabel,
  team,
  stage,
  pct,
  statusPill,
  statusText,
  tasks,
  canManage,
  pending,
  onToggleTask,
  expanded,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  typeLabel: string;
  team: string;
  stage: string;
  pct: number;
  statusPill: string;
  statusText: string;
  tasks: TaskView[];
  canManage: boolean;
  pending: boolean;
  onToggleTask: (taskId: string, status: string) => void;
  expanded: ReactNode;
}) {
  const openTasks = tasks.filter((t) => t.status !== "skipped");
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
        <td><span className={`pill sm ${statusPill}`}>{statusText}</span></td>
        <td className="r"><span className={`flow-chev${open ? " open" : ""}`}>▾</span></td>
      </tr>
      {openTasks.map((t) => {
        const done = t.status === "done";
        return (
          <tr className="flow-subrow" key={t.id}>
            <td>
              <span className="flow-sub">
                <button
                  type="button"
                  className={`flow-check${done ? " on" : ""}`}
                  disabled={!canManage || pending}
                  aria-label={done ? "Mark task open" : "Mark task done"}
                  onClick={() => onToggleTask(t.id, done ? "open" : "done")}
                >
                  {done ? "✓" : ""}
                </button>
                <span className={`pill sm ${done ? "open" : "draft"}`}>{TASK_LABEL[t.kind] ?? t.kind}</span>
                <span className={`flow-sub-title${done ? " done" : ""}`}>{t.title}</span>
              </span>
            </td>
            <td className="flow-sub-meta">{t.ownerName ?? "Unassigned"}</td>
            <td className="flow-sub-meta">{fmtDue(t.dueAt)}</td>
            <td colSpan={2} className="flow-sub-meta">{done ? "Done" : "To do"}</td>
          </tr>
        );
      })}
      {open ? (
        <tr className="flow-exp-row">
          <td colSpan={5}>
            <div className="flow-exp">{expanded}</div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
