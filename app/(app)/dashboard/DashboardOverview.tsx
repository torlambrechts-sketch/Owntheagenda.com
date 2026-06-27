import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, roleLabel } from "@/lib/util";

const FU_LABEL: Record<string, string> = {
  check_in: "Check-in", remeasure: "Re-measure", working_session: "Working session", meeting: "Meeting", review: "Review",
};

// workspace_health entity (a subset of the Insight rollup we need here).
type HealthEntity = {
  team_id: string;
  name: string;
  dynamics: { score: number; in_band: number; total: number } | null;
  strategy: { composite: number } | null;
  performance: { composite: number } | null;
};

// 0–100 health score → a green/amber/red band + a 1–5 display number.
function band(v: number): string {
  return v >= 67 ? "green" : v >= 50 ? "amber" : "red";
}
function bandColor(v: number): string {
  return v >= 67 ? "var(--green)" : v >= 50 ? "var(--amber)" : "var(--rust)";
}
function toFive(v: number): string {
  return ((v / 100) * 5).toFixed(1);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// audit_log.action ("assessment.opened") → human label ("Assessment opened").
function humanizeAction(action: string): string {
  const s = action.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// The workspace dashboard body, extracted so it can render as the first
// "Dashboard" tab of the merged Insights surface (see /insight).
export async function DashboardOverview() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;
  const admin = isAdmin(ctx.role);

  const [members, teams, pending, openActionRows, workshopCount, activeFlowCount] = await Promise.all([
    supabase.from("membership").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "active"),
    supabase.from("team").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("invitation").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "pending"),
    supabase.from("action_item").select("due_at").eq("workspace_id", wsId).eq("status", "open"),
    supabase.from("workshop").select("*", { count: "exact", head: true }).eq("workspace_id", wsId),
    supabase.from("program").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "active"),
  ]);

  const openActions = openActionRows.data ?? [];
  const now = Date.now();
  const overdueActions = openActions.filter((a) => a.due_at && new Date(a.due_at).getTime() < now).length;

  // ---- workspace Health rollup (admins only — the RPC is workspace-wide) ----
  let entities: HealthEntity[] = [];
  if (admin) {
    const { data } = await supabase.rpc("workspace_health", { p_workspace: wsId });
    entities = ((data as unknown as HealthEntity[]) ?? []).filter(Boolean);
  }
  const scored = entities.filter((e) => e.dynamics && e.dynamics.total > 0);
  const healthAvg = scored.length
    ? scored.reduce((n, e) => n + (e.dynamics?.score ?? 0), 0) / scored.length
    : null;
  // Team health bars — every team with a dynamics reading, weakest first.
  const healthBars = scored
    .map((e) => ({ id: e.team_id, name: e.name, score: e.dynamics!.score }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  // ---- assigned-to-me assessments (personal to-do) ----
  const { data: myAssignments } = await supabase
    .from("assessment_assignment")
    .select("template_key, note, due_at")
    .eq("workspace_id", wsId)
    .eq("assignee_user_id", ctx.userId);
  const assignKeys = Array.from(new Set((myAssignments ?? []).map((a) => a.template_key as string)));
  const [{ data: assignDone }, { data: assignTpls }] = assignKeys.length
    ? await Promise.all([
        supabase.from("individual_response").select("template_key").eq("workspace_id", wsId).eq("user_id", ctx.userId).in("template_key", assignKeys),
        supabase.from("assessment_template").select("key, name").in("key", assignKeys),
      ])
    : [{ data: [] as { template_key: string }[] }, { data: [] as { key: string; name: string }[] }];
  const doneKeys = new Set((assignDone ?? []).map((r) => r.template_key as string));
  const tplName = new Map((assignTpls ?? []).map((t) => [t.key as string, t.name as string]));
  const assignedTodo = (myAssignments ?? [])
    .filter((a) => !doneKeys.has(a.template_key as string))
    .map((a) => ({
      key: a.template_key as string,
      name: tplName.get(a.template_key as string) ?? (a.template_key as string),
      note: (a.note as string | null) ?? null,
      dueAt: (a.due_at as string | null) ?? null,
    }))
    .sort((x, y) => (x.dueAt ?? "9999").localeCompare(y.dueAt ?? "9999"));

  // ---- upcoming workshops ----
  const { data: upcoming } = await supabase
    .from("workshop")
    .select("id, title, scheduled_at")
    .eq("workspace_id", wsId)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(now - 3600 * 1000).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(4);
  const upcomingCount = (upcoming ?? []).length;

  // ---- active assessments (running flows + their collection progress) ----
  const { data: activePrograms } = await supabase
    .from("program")
    .select("id, title, current_ord, min_responses")
    .eq("workspace_id", wsId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(4);
  const activeAssessments = await Promise.all(
    (activePrograms ?? []).map(async (p) => {
      const { data: st } = await supabase.rpc("program_status", { p_program: p.id as string });
      // The collection step carries done/target; take the most-progressed one.
      let pct: number | null = null;
      for (const r of (st ?? []) as { done: number | null; target: number | null }[]) {
        if (r.target && r.target > 0) {
          const v = Math.min(100, Math.round(((r.done ?? 0) / r.target) * 100));
          pct = pct == null ? v : Math.max(pct, v);
        }
      }
      return { id: p.id as string, name: p.title as string, pct };
    }),
  );

  // ---- recent activity (audit log — admins only via RLS) ----
  let activity: { id: number; text: string; when: string }[] = [];
  if (admin) {
    const { data: log } = await supabase
      .from("audit_log")
      .select("id, action, entity_type, created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(6);
    activity = (log ?? []).map((r) => ({
      id: r.id as number,
      text: humanizeAction(r.action as string),
      when: timeAgo(r.created_at as string),
    }));
  }

  // ---- upcoming follow-ups ----
  const { data: followUps } = await supabase
    .from("follow_up")
    .select("id, kind, title, scheduled_at, team_id, workshop_id")
    .eq("workspace_id", wsId)
    .eq("status", "planned")
    .order("scheduled_at", { ascending: true })
    .limit(6);
  const fuTeamIds = Array.from(new Set((followUps ?? []).map((f) => f.team_id).filter((x): x is string => !!x)));
  const { data: fuTeams } = fuTeamIds.length
    ? await supabase.from("team").select("id, name").in("id", fuTeamIds)
    : { data: [] as { id: string; name: string }[] };
  const fuTeamName = new Map((fuTeams ?? []).map((t) => [t.id, t.name]));

  // ---- suggested next step (derived from the live state above) ----
  const weakest = healthBars[0] && healthBars[0].score < 67 ? healthBars[0] : null;
  let nudge: { eyebrow: string; title: string; body: string; cta: string; href: string };
  if (weakest) {
    nudge = {
      eyebrow: "Suggested next step",
      title: `Run a workshop with ${weakest.name}`,
      body: `Their latest pulse sits at ${toFive(weakest.score)} / 5 — the lowest of your teams. A focused session would help surface what's behind it.`,
      cta: "Open Flows",
      href: "/workflow",
    };
  } else if (overdueActions > 0) {
    nudge = {
      eyebrow: "Suggested next step",
      title: `Follow up on ${overdueActions} overdue action${overdueActions === 1 ? "" : "s"}`,
      body: "Commitments from past sessions have slipped their due date. A quick nudge keeps the team's momentum.",
      cta: "Open actions",
      href: "/actions",
    };
  } else if ((activeFlowCount.count ?? 0) === 0 && (teams.count ?? 0) > 0) {
    nudge = {
      eyebrow: "Get started",
      title: "Launch your first flow",
      body: "Run an assessment, wait for responses, then run the workshop on the results — all as one tracked flow.",
      cta: "Open Flows",
      href: "/workflow",
    };
  } else if ((teams.count ?? 0) === 0) {
    nudge = {
      eyebrow: "Get started",
      title: "Set up your first team",
      body: "Name a leadership team, pick a focus, and invite the people you lead with — about two minutes.",
      cta: "Start setup",
      href: "/start",
    };
  } else {
    nudge = {
      eyebrow: "Keep the loop going",
      title: "Re-pulse a team to track movement",
      body: "Re-measuring after a workshop shows whether the changes are landing. Schedule a re-pulse on any active flow.",
      cta: "Open Flows",
      href: "/workflow",
    };
  }

  // ---- KPI row ----
  const kpis: { title: string; big: string; sub: string; delta?: string; deltaColor?: string }[] = [];
  if (admin && healthAvg != null) {
    kpis.push({ title: "Team health", big: toFive(healthAvg), sub: `avg across ${scored.length} team${scored.length === 1 ? "" : "s"}` });
  } else {
    kpis.push({ title: "Teams", big: String(teams.count ?? 0), sub: `${members.count ?? 0} member${(members.count ?? 0) === 1 ? "" : "s"}` });
  }
  kpis.push({ title: "Active flows", big: String(activeFlowCount.count ?? 0), sub: "assessments in progress" });
  kpis.push({ title: "Workshops", big: String(workshopCount.count ?? 0), sub: upcomingCount ? `${upcomingCount} upcoming` : "none scheduled" });
  kpis.push({
    title: "Open actions",
    big: String(openActions.length),
    sub: "from past sessions",
    delta: overdueActions ? `${overdueActions} overdue` : undefined,
    deltaColor: "var(--rust)",
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <div className="dash-head">
        <div>
          <div className="dash-greet">{greeting}</div>
          <h1 className="page-title" style={{ margin: 0 }}>{ctx.workspace.name}</h1>
          <p className="page-sub" style={{ marginTop: 4 }}>Signed in as {ctx.email} · {roleLabel(ctx.role)}</p>
        </div>
        {admin ? (
          <div className="dash-head-acts">
            <Link href="/start" className="btn-sec">Setup wizard</Link>
            <Link href="/assessments" className="btn-prim">+ New assessment</Link>
          </div>
        ) : null}
      </div>

      <div className="dash-kpis">
        {kpis.map((k) => (
          <div className="dash-kpi" key={k.title}>
            <div className="dash-kpi-t">{k.title}</div>
            <div className="dash-kpi-row">
              <span className="dash-kpi-big">{k.big}</span>
              {k.delta ? <span className="dash-kpi-delta" style={{ color: k.deltaColor }}>{k.delta}</span> : null}
            </div>
            <div className="dash-kpi-s">{k.sub}</div>
          </div>
        ))}
      </div>

      {assignedTodo.length ? (
        <div style={{ marginBottom: 22 }}>
          <div className="cat-head" style={{ fontSize: 16, marginTop: 8 }}>Assigned to you <span className="n">{assignedTodo.length}</span></div>
          <div className="tbl-card">
            <table className="tbl">
              <tbody>
                {assignedTodo.map((a) => {
                  const due = a.dueAt ? new Date(a.dueAt) : null;
                  const overdue = due ? due < new Date() : false;
                  const soon = due ? !overdue && due.getTime() - now < 3 * 24 * 3600 * 1000 : false;
                  return (
                    <tr key={a.key}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{a.name}</span>
                        {a.note ? <span style={{ color: "var(--faint)", fontSize: 12 }}> · “{a.note}”</span> : null}
                      </td>
                      <td style={{ color: overdue ? "var(--rust)" : soon ? "var(--amber)" : "var(--muted)", width: 200 }}>
                        {due ? due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "No due date"}
                        {overdue ? " · overdue" : soon ? " · due soon" : ""}
                      </td>
                      <td className="r" style={{ width: 110 }}>
                        <Link className="linkbtn" href="/assessments/library">Take ▸</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="dash-grid">
        <div className="dash-col">
          {healthBars.length ? (
            <div className="dash-card">
              <div className="dash-card-h">
                <div>
                  <div className="dash-card-t">Team health</div>
                  <div className="dash-card-s">Latest pulse · {scored.length} team{scored.length === 1 ? "" : "s"} measured</div>
                </div>
                <Link className="dash-card-link" href="/insight">View all</Link>
              </div>
              {healthBars.map((b) => (
                <div className="dash-bar" key={b.id}>
                  <Link className="dash-bar-n" href="/insight">{b.name}</Link>
                  <span className="dash-bar-track"><span style={{ width: `${Math.round(b.score)}%`, background: bandColor(b.score) }} /></span>
                  <span className="dash-bar-v" style={{ color: bandColor(b.score) }} data-band={band(b.score)}>{toFive(b.score)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {(upcoming ?? []).length ? (
            <div className="dash-card pad0">
              <div className="dash-card-h pad">
                <div className="dash-card-t">Upcoming workshops</div>
                <Link className="dash-card-link" href="/workshops">View all</Link>
              </div>
              {(upcoming ?? []).map((w) => {
                const d = new Date(w.scheduled_at!);
                return (
                  <Link key={w.id} href={`/workshops/${w.id}`} className="dash-ws">
                    <div className="dash-ws-date">
                      <div className="dash-ws-day">{d.toLocaleDateString("en-US", { day: "numeric" })}</div>
                      <div className="dash-ws-mon">{d.toLocaleDateString("en-US", { month: "short" })}</div>
                    </div>
                    <div className="dash-ws-vr" />
                    <div className="dash-ws-body">
                      <div className="dash-ws-t">{w.title}</div>
                      <div className="dash-ws-m">{d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
                    </div>
                    <span className="dash-ws-chev">›</span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          {(followUps ?? []).length ? (
            <div className="dash-card pad0">
              <div className="dash-card-h pad">
                <div className="dash-card-t">Upcoming follow-ups</div>
                <Link className="dash-card-link" href="/actions">View all</Link>
              </div>
              <table className="tbl">
                <tbody>
                  {(followUps ?? []).map((f) => {
                    const overdue = f.scheduled_at ? new Date(f.scheduled_at) < new Date() : false;
                    return (
                      <tr key={f.id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>{f.title}</span>{" "}
                          <span style={{ color: "var(--faint)", fontSize: 12 }}>· {FU_LABEL[f.kind] ?? f.kind}</span>
                        </td>
                        <td style={{ color: "var(--muted)", width: 150 }}>{f.team_id ? fuTeamName.get(f.team_id) ?? "" : ""}</td>
                        <td style={{ color: overdue ? "var(--rust)" : "var(--muted)", width: 150 }}>
                          {f.scheduled_at ? new Date(f.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—"}
                          {overdue ? " · overdue" : ""}
                        </td>
                        <td className="r" style={{ width: 90 }}>
                          {f.workshop_id ? <Link className="linkbtn" href={`/run/${f.workshop_id}`}>Start ▸</Link> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="dash-col">
          <div className="dash-nudge">
            <div className="dash-nudge-eye">✦ {nudge.eyebrow}</div>
            <div className="dash-nudge-t">{nudge.title}</div>
            <div className="dash-nudge-b">{nudge.body}</div>
            <Link href={nudge.href} className="dash-nudge-cta">{nudge.cta} →</Link>
          </div>

          {activeAssessments.length ? (
            <div className="dash-card">
              <div className="dash-mini-h">Active assessments</div>
              {activeAssessments.map((a) => (
                <Link key={a.id} href={`/workflow/${a.id}`} className="dash-active">
                  <div className="dash-active-t">{a.name}</div>
                  <div className="dash-active-row">
                    <span className="dash-active-track"><span style={{ width: `${a.pct ?? 0}%` }} /></span>
                    <span className="dash-active-v">{a.pct != null ? `${a.pct}%` : "—"}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}

          {activity.length ? (
            <div className="dash-card">
              <div className="dash-mini-h">Recent activity</div>
              {activity.map((a) => (
                <div className="dash-act" key={a.id}>
                  <span className="dash-act-dot" aria-hidden />
                  <div className="dash-act-body">
                    <div className="dash-act-t">{a.text}</div>
                    <div className="dash-act-w">{a.when}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="cardgrid" style={{ marginTop: 24 }}>
        <Link href="/members" className="card" style={{ textDecoration: "none" }}>
          <div className="eyebrow">People</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "4px 0 6px" }}>Members &amp; invites</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>Invite colleagues, set roles, and manage who&rsquo;s in the workspace.</p>
        </Link>
        <Link href="/teams" className="card" style={{ textDecoration: "none" }}>
          <div className="eyebrow">Structure</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "4px 0 6px" }}>Teams</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>Organize people into leadership teams and the org hierarchy.</p>
        </Link>
        <Link href="/actions" className="card" style={{ textDecoration: "none" }}>
          <div className="eyebrow">Follow-through</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "4px 0 6px" }}>Actions</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>Track the commitments your teams made in session through to done.</p>
        </Link>
      </div>
    </div>
  );
}
