import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, timeAgo } from "@/lib/util";
import { createBlankWorkshop } from "../actions";

// "Builder" section landing (left-nav → Builder). The builder itself is
// per-workshop (/workshops/[id]); this chooser opens an existing agenda or
// builds a fresh draft and drops you straight into it.
export default async function WorkshopBuilderIndex() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: teams } = await supabase
    .from("team")
    .select("id, name, lead_user_id")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const team = teams?.[0] ?? null;
  const teamId = team?.id ?? null;
  const canManage = isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  let workshops: { id: string; title: string; status: string; updated_at: string }[] = [];
  if (team) {
    const { data } = await supabase
      .from("workshop")
      .select("id, title, status, updated_at")
      .eq("team_id", team.id)
      .order("updated_at", { ascending: false });
    workshops = data ?? [];
  }

  async function buildNew() {
    "use server";
    if (!teamId) return;
    const res = await createBlankWorkshop(teamId, "");
    if (res.id) redirect(`/workshops/${res.id}`);
  }

  return (
    <div>
      <h1 className="page-title">Builder</h1>
      <p className="page-sub">Open a workshop to shape its agenda, or build a new one from scratch.</p>

      {!team ? (
        <div className="card empty">Create a team first to build a workshop.</div>
      ) : (
        <>
          {canManage ? (
            <form action={buildNew} style={{ margin: "4px 0 18px" }}>
              <button className="btn-prim" type="submit">＋ Build new workshop</button>
            </form>
          ) : null}

          {workshops.length === 0 ? (
            <div className="card empty">No workshops yet — build your first above.</div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {workshops.map((w) => (
                <Link
                  key={w.id}
                  href={`/workshops/${w.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--line)", textDecoration: "none" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{w.title}</div>
                    <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 1 }}>Edited {timeAgo(w.updated_at)}</div>
                  </div>
                  <span className={`pill sm ${w.status === "live" ? "open" : w.status === "done" ? "draft" : "internal"}`}>{w.status}</span>
                  <span className="linkbtn" style={{ whiteSpace: "nowrap" }}>Open builder →</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
