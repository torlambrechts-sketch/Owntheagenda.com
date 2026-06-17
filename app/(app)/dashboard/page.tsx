import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/util";

export default async function DashboardPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const [members, teams, pending] = await Promise.all([
    supabase.from("membership").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "active"),
    supabase.from("team").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).is("deleted_at", null),
    supabase.from("invitation").select("*", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "pending"),
  ]);

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
          <div className="num" style={{ textTransform: "capitalize" }}>
            {ctx.workspace.plan}
          </div>
          <div className="lab">Plan · {ctx.workspace.data_region.toUpperCase()}</div>
        </div>
      </div>

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
      </div>
    </div>
  );
}
