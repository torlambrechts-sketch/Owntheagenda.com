import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const userName =
    ctx.profile?.full_name ||
    ctx.profile?.display_name ||
    ctx.email ||
    "You";

  const { data: notifs } = await supabase
    .from("notification")
    .select("id, title, body, link, read_at")
    .eq("workspace_id", ctx.workspace.id)
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
    <Shell
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
        notifications,
      }}
    >
      {children}
    </Shell>
  );
}
