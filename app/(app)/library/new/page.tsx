import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { TemplateBuilder, type ExistingTemplate } from "../TemplateBuilder";

// Author a workspace-custom assessment. Create (no id) or edit (?id=…).
// Admin-only — the save RPC also enforces it.
export default async function TemplateBuilderPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/assessments");

  let existing: ExistingTemplate | null = null;
  if (searchParams.id) {
    const supabase = createClient();
    const { data } = await supabase
      .from("assessment_template")
      .select("id, name, category, scope, source, description, definition, workspace_id")
      .eq("id", searchParams.id)
      .maybeSingle();
    if (data && data.workspace_id === ctx.workspace.id) {
      existing = {
        id: data.id,
        name: data.name,
        category: data.category,
        scope: data.scope,
        source: data.source,
        description: data.description,
        definition: data.definition as ExistingTemplate["definition"],
      };
    } else {
      redirect("/assessments");
    }
  }

  return <TemplateBuilder existing={existing} />;
}
