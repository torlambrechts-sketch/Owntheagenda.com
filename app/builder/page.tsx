import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { AssessmentBuilder } from "@/app/(app)/library/builder/AssessmentBuilder";

// Full-screen assessment builder (outside the app shell, like the run surface).
// Admin-only — the save RPC also enforces it.
export default async function AssessmentBuilderPage() {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/assessments");
  return <AssessmentBuilder />;
}
