import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { TeamDetailClient, type TMRow, type Addable } from "./TeamDetailClient";

export default async function TeamDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const teamId = params.id;

  const { data: team } = await supabase
    .from("team")
    .select("id, name, description, lead_user_id, workspace_id")
    .eq("id", teamId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!team || team.workspace_id !== ctx.workspace.id) notFound();

  const { data: tm } = await supabase
    .from("team_member")
    .select("id, user_id, role_title, is_lead, consent_share")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });
  const teamMembers = tm ?? [];

  // workspace members (for the "add" picker) + profiles for names
  const { data: ws } = await supabase
    .from("membership")
    .select("user_id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", "active");
  const wsUserIds = (ws ?? []).map((m) => m.user_id);

  const { data: profiles } = wsUserIds.length
    ? await supabase
        .from("profile")
        .select("id, full_name, display_name, email")
        .in("id", wsUserIds)
    : { data: [] as any[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameOf = (uid: string) => {
    const p = byId.get(uid);
    return p?.full_name || p?.display_name || p?.email || "Unknown";
  };

  const members: TMRow[] = teamMembers.map((m) => ({
    teamMemberId: m.id,
    userId: m.user_id,
    name: nameOf(m.user_id),
    email: byId.get(m.user_id)?.email ?? null,
    roleTitle: m.role_title,
    isLead: m.is_lead || team.lead_user_id === m.user_id,
    consentShare: m.consent_share,
    isSelf: m.user_id === ctx.userId,
  }));

  const onTeam = new Set(teamMembers.map((m) => m.user_id));
  const addable: Addable[] = wsUserIds
    .filter((uid) => !onTeam.has(uid))
    .map((uid) => ({
      userId: uid,
      name: nameOf(uid),
      email: byId.get(uid)?.email ?? null,
    }));

  const meTM = teamMembers.find((m) => m.user_id === ctx.userId);
  const canManage =
    isAdmin(ctx.role) ||
    team.lead_user_id === ctx.userId ||
    Boolean(meTM?.is_lead);

  return (
    <div>
      <Link href="/teams" className="linkbtn" style={{ fontSize: 12 }}>
        ‹ Teams
      </Link>
      <h1 className="page-title" style={{ marginTop: 6 }}>
        {team.name}
      </h1>
      <p className="page-sub">
        {team.description || "Team members, leadership and consent."}
      </p>
      <TeamDetailClient
        teamId={teamId}
        canManage={canManage}
        isAdmin={isAdmin(ctx.role)}
        team={{ name: team.name, description: team.description }}
        members={members}
        addable={addable}
      />
    </div>
  );
}
