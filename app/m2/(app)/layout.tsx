import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Main2Shell } from "@/components/m2/Main2Shell";

// Server layout for the MAIN2 in-app surface (dashboard, assessments,
// workshops, insights, team). Loads the chrome the shell needs and reuses
// the existing session/workspace plumbing.
export default async function M2AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const userName =
    ctx.profile?.full_name ||
    ctx.profile?.display_name ||
    ctx.email ||
    "You";

  // The user's primary team in this workspace (for the nav footer label).
  const { data: myTeam } = await supabase
    .from("team_member")
    .select("team:team!inner(name, workspace_id)")
    .eq("user_id", ctx.userId)
    .eq("team.workspace_id", wsId)
    .limit(1)
    .maybeSingle();
  const teamName =
    (myTeam?.team as unknown as { name: string } | null)?.name ?? null;

  const { data: notifs } = await supabase
    .from("notification")
    .select("id, title, body, link, read_at")
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false })
    .limit(12);
  const notifications = (notifs ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    read: !!n.read_at,
  }));

  return (
    <Main2Shell
      chrome={{
        workspaceName: ctx.workspace.name,
        workspaceId: ctx.workspace.id,
        role: ctx.role,
        workspaces: ctx.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
        })),
        userName,
        userEmail: ctx.email,
        teamName,
        notifications,
      }}
    >
      {children}
    </Main2Shell>
  );
}
