import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { listTemplates } from "@/lib/assessments";
import { AssessmentNav } from "@/components/AssessmentNav";
import { TemplatesManager, type TemplateCard } from "./TemplatesManager";

// Templates — the management surface for assessment blueprints (the design's
// "Templates" screen). Every instrument the caller can read: the global
// built-ins plus this workspace's own custom instruments, straight from
// `assessment_template` via RLS. Authoring (create / edit / clone) happens in
// the builder at /library/new; this page lists, opens and deletes them.
export default async function TemplatesPage() {
  const ctx = await requireSession();
  const admin = isAdmin(ctx.role);
  const rows = await listTemplates();

  const cards: TemplateCard[] = rows.map((t) => {
    const def = (t.definition ?? {}) as {
      dimensions?: { key: string; label: string }[];
      items?: unknown[];
      scale?: { min?: number; max?: number };
    };
    const dims = def.dimensions ?? [];
    const items = def.items ?? [];
    return {
      id: t.id,
      key: t.key,
      name: t.name,
      category: t.category,
      scope: t.scope === "individual" ? "individual" : "team",
      source: t.source,
      description: t.description,
      sections: dims.length,
      questions: items.length,
      sectionNames: dims.map((d) => d.label).filter(Boolean).slice(0, 6),
      scale: def.scale && typeof def.scale.min === "number" && typeof def.scale.max === "number" ? `${def.scale.min}–${def.scale.max}` : null,
      // Only this workspace's own rows are editable / deletable; global
      // built-ins (workspace_id null) are read-only and can be cloned.
      owned: t.workspace_id === ctx.workspace.id,
      builtIn: t.workspace_id == null,
    };
  });

  return (
    <>
      <AssessmentNav active="templates" />
      <TemplatesManager cards={cards} isAdmin={admin} />
    </>
  );
}
