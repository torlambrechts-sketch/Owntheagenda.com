import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { MembersClient, type MemberRow, type InviteRow, type RequestRow } from "./MembersClient";

export default async function MembersPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const { data: memberships } = await supabase
    .from("membership")
    .select("id, user_id, role")
    .eq("workspace_id", wsId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  // Pending self-join requests awaiting an admin's approval.
  const { data: pendRows } = await supabase
    .from("membership")
    .select("id, user_id, role, created_at")
    .eq("workspace_id", wsId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const userIds = Array.from(
    new Set([...(memberships ?? []).map((m) => m.user_id), ...(pendRows ?? []).map((m) => m.user_id)]),
  );
  const { data: profiles } = userIds.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", userIds)
    : { data: [] as any[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const requests: RequestRow[] = (pendRows ?? []).map((m) => {
    const p = byId.get(m.user_id);
    return {
      membershipId: m.id,
      name: p?.full_name || p?.display_name || p?.email || "Unknown",
      email: p?.email ?? null,
      role: m.role,
    };
  });

  const members: MemberRow[] = (memberships ?? []).map((m) => {
    const p = byId.get(m.user_id);
    return {
      membershipId: m.id,
      userId: m.user_id,
      name: p?.full_name || p?.display_name || p?.email || "Unknown",
      email: p?.email ?? null,
      role: m.role,
      isSelf: m.user_id === ctx.userId,
    };
  });

  const { data: invRows } = await supabase
    .from("invitation")
    .select("id, email, role, expires_at")
    .eq("workspace_id", wsId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const invites: InviteRow[] = (invRows ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expires_at,
  }));

  const { data: teamRows } = await supabase
    .from("team")
    .select("id, name")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("name");

  return (
    <div>
      <h1 className="page-title">Members</h1>
      <p className="page-sub">
        Everyone in {ctx.workspace.name}. Invite people and set what they can do.
      </p>
      <MembersClient
        workspaceId={wsId}
        canManage={isAdmin(ctx.role)}
        members={members}
        invites={invites}
        requests={requests}
        teams={teamRows ?? []}
        joinCode={ctx.workspace.join_code ?? null}
      />
    </div>
  );
}
