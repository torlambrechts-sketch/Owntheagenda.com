"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PlanTask = {
  id: string;
  parent_id: string | null;
  title: string;
  owner_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  ord: number;
};

const COLS = "id, parent_id, title, owner_name, start_date, end_date, status, ord";
const STATUS_NEXT: Record<string, string> = { todo: "doing", doing: "done", done: "todo" };
const STATUS_LABEL: Record<string, string> = { todo: "To do", doing: "In progress", done: "Done" };

function row(r: Record<string, unknown>): PlanTask {
  return {
    id: r.id as string,
    parent_id: (r.parent_id as string) ?? null,
    title: (r.title as string) ?? "",
    owner_name: (r.owner_name as string) ?? null,
    start_date: (r.start_date as string) ?? null,
    end_date: (r.end_date as string) ?? null,
    status: (r.status as string) ?? "todo",
    ord: (r.ord as number) ?? 0,
  };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string | null) => (s ? new Date(s + "T00:00:00") : null);
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const fmtShort = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function PlanBoard({
  sessionId,
  blockOrd,
  canEdit,
  members,
  sourceSessionId,
}: {
  sessionId: string;
  blockOrd: number;
  canEdit: boolean;
  members: { name: string }[];
  sourceSessionId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [view, setView] = useState<"list" | "timeline">("list");
  const [seeding, setSeeding] = useState(false);
  const editingId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("plan_task")
      .select(COLS)
      .eq("session_id", sessionId)
      .eq("block_ord", blockOrd)
      .order("ord", { ascending: true });
    if (data) setTasks(data.map(row));
  }, [supabase, sessionId, blockOrd]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`plan:${sessionId}:${blockOrd}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plan_task", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const n = payload.new as Record<string, unknown>;
          const o = payload.old as Record<string, unknown>;
          if (payload.eventType === "DELETE") {
            setTasks((t) => t.filter((x) => x.id !== (o.id as string)));
            return;
          }
          if ((n.block_ord as number) !== blockOrd) return;
          if (editingId.current === (n.id as string)) return; // don't clobber my active edit
          setTasks((t) => {
            const r = row(n);
            const i = t.findIndex((x) => x.id === r.id);
            if (i === -1) return [...t, r].sort((a, b) => a.ord - b.ord);
            const copy = [...t];
            copy[i] = r;
            return copy;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, blockOrd]);

  function patchLocal(id: string, p: Partial<PlanTask>) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  async function save(id: string, p: Partial<PlanTask>) {
    await supabase.from("plan_task").update(p).eq("id", id);
  }
  async function addTask(parentId: string | null) {
    const today = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7);
    const maxOrd = tasks.reduce((m, t) => Math.max(m, t.ord), 0);
    const { data } = await supabase
      .from("plan_task")
      .insert({
        session_id: sessionId,
        block_ord: blockOrd,
        parent_id: parentId,
        title: "",
        status: "todo",
        ord: maxOrd + 1,
        start_date: iso(today),
        end_date: iso(end),
      })
      .select(COLS)
      .maybeSingle();
    if (data) setTasks((t) => [...t, row(data)]);
  }
  async function del(id: string) {
    setTasks((t) => t.filter((x) => x.id !== id && x.parent_id !== id));
    await supabase.from("plan_task").delete().eq("id", id);
  }
  function cycleStatus(t: PlanTask) {
    const next = STATUS_NEXT[t.status] ?? "todo";
    patchLocal(t.id, { status: next });
    save(t.id, { status: next });
  }
  async function pullForward() {
    if (!sourceSessionId || seeding) return;
    setSeeding(true);
    await supabase.rpc("seed_plan_from_session", { p_source: sourceSessionId, p_target: sessionId, p_block: blockOrd });
    await load();
    setSeeding(false);
  }

  // ---- ordered display: top-level tasks, each followed by its sub-tasks ----
  const display = useMemo(() => {
    const tops = tasks.filter((t) => !t.parent_id).sort((a, b) => a.ord - b.ord);
    const out: { t: PlanTask; depth: number }[] = [];
    for (const top of tops) {
      out.push({ t: top, depth: 0 });
      for (const sub of tasks.filter((s) => s.parent_id === top.id).sort((a, b) => a.ord - b.ord)) {
        out.push({ t: sub, depth: 1 });
      }
    }
    // orphans (sub whose parent was removed)
    for (const t of tasks) if (t.parent_id && !tasks.some((p) => p.id === t.parent_id)) out.push({ t, depth: 0 });
    return out;
  }, [tasks]);

  function TaskRow({ t, depth }: { t: PlanTask; depth: number }) {
    return (
      <div className={`pl-row${depth ? " sub" : ""}`}>
        <button className={`pl-stat ${t.status}`} disabled={!canEdit} onClick={() => cycleStatus(t)} title={STATUS_LABEL[t.status]} />
        <input
          className="pl-title"
          value={t.title}
          placeholder={depth ? "Sub-task…" : "Task…"}
          disabled={!canEdit}
          onFocus={() => (editingId.current = t.id)}
          onBlur={() => { editingId.current = null; save(t.id, { title: t.title }); }}
          onChange={(e) => patchLocal(t.id, { title: e.target.value })}
        />
        <input
          className="pl-owner"
          list="pl-members"
          value={t.owner_name ?? ""}
          placeholder="Owner"
          disabled={!canEdit}
          onFocus={() => (editingId.current = t.id)}
          onBlur={() => { editingId.current = null; save(t.id, { owner_name: t.owner_name || null }); }}
          onChange={(e) => patchLocal(t.id, { owner_name: e.target.value })}
        />
        <input className="pl-date" type="date" value={t.start_date ?? ""} disabled={!canEdit}
          onFocus={() => (editingId.current = t.id)} onBlur={() => (editingId.current = null)}
          onChange={(e) => { patchLocal(t.id, { start_date: e.target.value || null }); save(t.id, { start_date: e.target.value || null }); }} />
        <input className="pl-date" type="date" value={t.end_date ?? ""} disabled={!canEdit}
          onFocus={() => (editingId.current = t.id)} onBlur={() => (editingId.current = null)}
          onChange={(e) => { patchLocal(t.id, { end_date: e.target.value || null }); save(t.id, { end_date: e.target.value || null }); }} />
        {canEdit ? (
          <div className="pl-act">
            {depth === 0 ? <button className="pl-mini" title="Add sub-task" onClick={() => addTask(t.id)}>＋</button> : null}
            <button className="pl-mini del" title="Delete" onClick={() => del(t.id)}>✕</button>
          </div>
        ) : null}
      </div>
    );
  }

  // ---- timeline (waterfall) ----
  const timeline = useMemo(() => {
    const dated = display.filter((d) => d.t.start_date && d.t.end_date);
    if (!dated.length) return null;
    let min = parse(dated[0].t.start_date)!;
    let max = parse(dated[0].t.end_date)!;
    for (const d of dated) {
      const s = parse(d.t.start_date)!;
      const e = parse(d.t.end_date)!;
      if (s < min) min = s;
      if (e > max) max = e;
    }
    const span = Math.max(1, dayDiff(min, max) + 1);
    const ticks: Date[] = [];
    const step = Math.max(1, Math.ceil(span / 6));
    for (let i = 0; i <= span; i += step) {
      const d = new Date(min);
      d.setDate(d.getDate() + i);
      ticks.push(d);
    }
    return { min, max, span, ticks };
  }, [display]);

  return (
    <div className="planboard">
      <datalist id="pl-members">
        {members.map((m, i) => <option key={i} value={m.name} />)}
      </datalist>

      <div className="pl-bar">
        <div className="pl-views">
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
          <button className={view === "timeline" ? "on" : ""} onClick={() => setView("timeline")}>Timeline</button>
        </div>
        <div className="pl-bar-r">
          {canEdit && sourceSessionId && !display.length ? <button className="btn-ghost sm" disabled={seeding} onClick={pullForward} title="Copy last session's open tasks">{seeding ? "Pulling…" : "⤵ Pull forward last plan"}</button> : null}
          {canEdit ? <button className="btn-prim sm" onClick={() => addTask(null)}>＋ Add task</button> : null}
        </div>
      </div>

      {!display.length ? (
        <div className="pl-empty">No tasks yet.{canEdit ? " Add the first one above." : ""}</div>
      ) : view === "list" ? (
        <div className="pl-list">
          <div className="pl-row head">
            <span /><span className="pl-title">Task</span><span className="pl-owner">Owner</span>
            <span className="pl-date">Start</span><span className="pl-date">End</span><span className="pl-act" />
          </div>
          {display.map((d) => <TaskRow key={d.t.id} t={d.t} depth={d.depth} />)}
        </div>
      ) : (
        <div className="pl-gantt">
          {timeline ? (
            <>
              <div className="pl-gantt-axis">
                <span className="pl-gantt-label" />
                <div className="pl-gantt-track">
                  {timeline.ticks.map((d, i) => (
                    <span key={i} className="pl-tick" style={{ left: `${(dayDiff(timeline.min, d) / timeline.span) * 100}%` }}>{fmtShort(d)}</span>
                  ))}
                </div>
              </div>
              {display.map(({ t, depth }) => {
                const s = parse(t.start_date);
                const e = parse(t.end_date);
                const has = s && e;
                const left = has ? (dayDiff(timeline.min, s!) / timeline.span) * 100 : 0;
                const width = has ? Math.max(2, ((dayDiff(s!, e!) + 1) / timeline.span) * 100) : 0;
                return (
                  <div className={`pl-gantt-row${depth ? " sub" : ""}`} key={t.id}>
                    <span className="pl-gantt-label" title={t.title}>{t.title || "Untitled"}</span>
                    <div className="pl-gantt-track">
                      {has ? (
                        <div className={`pl-gbar ${t.status}`} style={{ left: `${left}%`, width: `${width}%` }}>
                          <span>{t.owner_name || ""}</span>
                        </div>
                      ) : <span className="pl-nodate">no dates</span>}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="pl-empty">Add start &amp; end dates to see the timeline.</div>
          )}
        </div>
      )}
    </div>
  );
}
