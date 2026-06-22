import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { parsePhases } from "../blocks";
import { TemplatesClient, type TemplateVM } from "./TemplatesClient";

// In-app workshop template manager + editor (the "Templates" / "Template editor"
// views from the Workshop App handoff). System templates (workspace_id null) are
// read-only here; workspace-owned ones are fully editable by workspace admins.
export default async function TemplatesPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const admin = isAdmin(ctx.role);

  const { data: templates } = await supabase
    .from("template")
    .select("id, workspace_id, key, name, category, source, description, default_duration, definition")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  // Usage: how many workshops in this workspace were built from each template.
  const { data: usageRows } = await supabase
    .from("workshop")
    .select("template_id")
    .eq("workspace_id", ctx.workspace.id)
    .not("template_id", "is", null);
  const usage = new Map<string, number>();
  for (const w of usageRows ?? []) {
    if (w.template_id) usage.set(w.template_id, (usage.get(w.template_id) ?? 0) + 1);
  }

  const items: TemplateVM[] = (templates ?? []).map((t) => {
    const phases = parsePhases(t.definition);
    const minutes = phases.reduce((s, p) => s + p.minutes, 0) || t.default_duration;
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      source: t.source,
      description: t.description,
      owned: t.workspace_id === ctx.workspace.id,
      system: t.workspace_id === null,
      steps: phases.length,
      minutes,
      used: usage.get(t.id) ?? 0,
      phases,
    };
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Link href="/workshops" className="linkbtn" style={{ fontSize: 12 }}>
          ‹ Workshops
        </Link>
      </div>
      <h1 className="page-title">Workshop templates</h1>
      <p className="page-sub">
        Proven frameworks your team can run in one click. Open one to tweak its
        agenda, or build your own from the block library.
      </p>
      <TemplatesClient items={items} canManage={admin} />
    </div>
  );
}
