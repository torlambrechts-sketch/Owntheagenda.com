import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { QuickStartWizard } from "./QuickStartWizard";

// Full-screen Quick Start wizard (outside the app shell, like /builder). Only
// members who can manage the workspace can run setup — it creates a team,
// invitations, and the team's first Flow.
export default async function QuickStartPage() {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/dashboard");
  return <QuickStartWizard workspaceId={ctx.workspace.id} />;
}
