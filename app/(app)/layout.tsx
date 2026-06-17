import { requireSession } from "@/lib/workspace";
import { Shell } from "@/components/Shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireSession();
  const userName =
    ctx.profile?.full_name ||
    ctx.profile?.display_name ||
    ctx.email ||
    "You";

  return (
    <Shell
      chrome={{
        workspaceName: ctx.workspace.name,
        userName,
        userEmail: ctx.email,
      }}
    >
      {children}
    </Shell>
  );
}
