import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/util";

const FU_LABEL: Record<string, string> = {
  check_in: "Check-in", remeasure: "Re-measure", working_session: "Working session", meeting: "Meeting", review: "Review",
};

export default async function DashboardPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const [members, teams, pending, openActions] = await Promise.all([
    supabase.from("membership").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "active"),
    supabase.from("team").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("invitation").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "pending"),
    supabase.from("action_item").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "open"),
  ]);

  // Assessments assigned to me that I haven't completed yet — a personal to-do
  // with a due-date nudge (delivered in-app, à la Lattice's homepage task).
  // Completion is derived from individual_response, never stored, so it can't
  // drift out of sync.
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

  const { data: upcoming } = await supabase
    .from("workshop")
    .select("id, title, scheduled_at")
    .eq("workspace_id", wsId)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(Date.now() - 3600 * 1000).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);

  const { data: followUps } = await supabase
    .from("follow_up")
    .select("id, kind, title, scheduled_at, team_id, workshop_id")
    .eq("workspace_id", wsId)
    .eq("status", "planned")
    .order("scheduled_at", { ascending: true })
    .limit(8);
  const fuTeamIds = Array.from(new Set((followUps ?? []).map((f) => f.team_id).filter((x): x is string => !!x)));
  const { data: fuTeams } = fuTeamIds.length
    ? await supabase.from("team").select("id, name").in("id", fuTeamIds)
    : { data: [] as { id: string; name: string }[] };
  const fuTeamName = new Map((fuTeams ?? []).map((t) => [t.id, t.name]));

  return (
    <div>
      <h1 className="page-title">{ctx.workspace.name}</h1>
      <p className="page-sub">
        You’re signed in as {ctx.email} · {roleLabel(ctx.role)}
      </p>

      <div className="summary">
        <div className="stat">
          <div className="num">{members.count ?? 0}</div>
          <div className="lab">Members</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num">{teams.count ?? 0}</div>
          <div className="lab">Teams</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num">{pending.count ?? 0}</div>
          <div className="lab">Pending invites</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num">{openActions.count ?? 0}</div>
          <div className="lab">Open actions</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num" style={{ textTransform: "capitalize" }}>
            {ctx.workspace.plan}
          </div>
          <div className="lab">Plan · {ctx.workspace.data_region.toUpperCase()}</div>
        </div>
      </div>

      {assignedTodo.length ? (
        <div style={{ marginBottom: 24 }}>
          <div className="cat-head" style={{ fontSize: 16, marginTop: 8 }}>Assigned to you <span className="n">{assignedTodo.length}</span></div>
          <div className="tbl-card">
            <table className="tbl">
              <tbody>
                {assignedTodo.map((a) => {
                  const due = a.dueAt ? new Date(a.dueAt) : null;
                  const overdue = due ? due < new Date() : false;
                  const soon = due ? !overdue && due.getTime() - Date.now() < 3 * 24 * 3600 * 1000 : false;
                  return (
                    <tr key={a.key}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{a.name}</span>
                        {a.note ? <span style={{ color: "var(--faint)", fontSize: 12 }}> · “{a.note}”</span> : null}
                      </td>
                      <td style={{ color: overdue ? "var(--rust)" : soon ? "var(--amber, var(--rust))" : "var(--muted)", width: 200 }}>
                        {due ? due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "No due date"}
                        {overdue ? " · overdue" : soon ? " · due soon" : ""}
                      </td>
                      <td className="r" style={{ width: 110 }}>
                        <Link className="linkbtn" href="/assessments">Take ▸</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(upcoming ?? []).length ? (
        <div style={{ marginBottom: 24 }}>
          <div className="cat-head" style={{ fontSize: 16, marginTop: 8 }}>Upcoming sessions</div>
          <div className="tbl-card">
            <table className="tbl">
              <tbody>
                {(upcoming ?? []).map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link href={`/workshops/${w.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>{w.title}</Link>
                    </td>
                    <td style={{ color: "var(--muted)", width: 220 }}>
                      {new Date(w.scheduled_at!).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="r" style={{ width: 110 }}>
                      <Link className="linkbtn" href={`/run/${w.id}`}>Start ▸</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(followUps ?? []).length ? (
        <div style={{ marginBottom: 24 }}>
          <div className="cat-head" style={{ fontSize: 16, marginTop: 8 }}>Upcoming follow-ups</div>
          <div className="tbl-card">
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
                      <td style={{ color: "var(--muted)", width: 160 }}>{f.team_id ? fuTeamName.get(f.team_id) ?? "" : ""}</td>
                      <td style={{ color: overdue ? "var(--rust)" : "var(--muted)", width: 180 }}>
                        {f.scheduled_at ? new Date(f.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—"}
                        {overdue ? " · overdue" : ""}
                      </td>
                      <td className="r" style={{ width: 110 }}>
                        {f.workshop_id ? <Link className="linkbtn" href={`/run/${f.workshop_id}`}>Start ▸</Link> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="cardgrid">
        <Link href="/members" className="card" style={{ textDecoration: "none" }}>
          <div className="eyebrow">People</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "4px 0 6px" }}>
            Members &amp; invites
          </h3>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
            Invite colleagues, set roles, and manage who’s in the workspace.
          </p>
        </Link>
        <Link href="/teams" className="card" style={{ textDecoration: "none" }}>
          <div className="eyebrow">Structure</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "4px 0 6px" }}>
            Teams
          </h3>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
            Organize people into leadership teams and the org hierarchy.
          </p>
        </Link>
        <Link href="/actions" className="card" style={{ textDecoration: "none" }}>
          <div className="eyebrow">Follow-through</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "4px 0 6px" }}>
            Actions
          </h3>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
            Track the commitments your teams made in session through to done.
          </p>
        </Link>
      </div>
    </div>
  );
}
