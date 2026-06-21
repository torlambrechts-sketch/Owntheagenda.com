import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { AssessmentBuilder, type Doc, type EditSeed, type QType } from "@/app/(app)/library/builder/AssessmentBuilder";

// Full-screen assessment builder (outside the app shell, like the run surface).
// Admin-only — the save RPC also enforces it. With `?id=`, loads an existing
// workspace template into the editor for in-place editing.
export default async function AssessmentBuilderPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/assessments");

  const supabase = createClient();

  let edit: EditSeed | undefined;
  if (searchParams.id) {
    const { data } = await supabase
      .from("assessment_template")
      .select("id, name, category, scope, description, source, definition, workspace_id")
      .eq("id", searchParams.id)
      .maybeSingle();
    // Only workspace-owned templates are editable here.
    if (data && data.workspace_id === ctx.workspace.id) {
      edit = {
        id: data.id as string,
        category: (data.category as string) ?? "custom",
        scope: (data.scope as string) ?? "team",
        description: (data.description as string) ?? "",
        source: (data.source as string) ?? "",
        ...parseDefinition(data.name as string, data.definition),
      };
    }
  }

  // The workspace's own assessments, listed in the gallery for in-place editing.
  let existing: { id: string; name: string; category: string }[] = [];
  if (!edit) {
    const { data } = await supabase
      .from("assessment_template")
      .select("id, name, category")
      .eq("workspace_id", ctx.workspace.id)
      .order("name");
    existing = (data ?? []).map((t) => ({ id: t.id as string, name: t.name as string, category: (t.category as string) ?? "custom" }));
  }

  return <AssessmentBuilder edit={edit} existing={existing} />;
}

// Reverse of the builder's buildDefinition: definition jsonb -> editable Doc.
function parseDefinition(name: string, definition: unknown): { doc: Doc; threshold: number; agg: string } {
  const def = (definition ?? {}) as {
    scale?: { min?: number; max?: number };
    dimensions?: { key: string; label?: string }[];
    items?: { key: string; dimension: string; text?: string; reverse?: boolean; type?: string; options?: string[]; required?: boolean; qScale?: string }[];
    threshold?: number;
    aggregation?: string;
  };
  const baseScale = scaleToStr(def.scale);
  const dims = def.dimensions ?? [];
  const items = def.items ?? [];
  const sections = dims.map((d) => ({
    id: "s_" + d.key,
    name: d.label || d.key,
    questions: items.filter((it) => it.dimension === d.key).map((it) => {
      const type = (["likert", "single", "multi", "text"].includes(it.type ?? "") ? it.type : "likert") as QType;
      return {
        id: "q_" + it.key,
        text: it.text ?? "",
        type,
        required: it.required ?? true,
        reverse: !!it.reverse,
        scale: it.qScale ?? baseScale,
        options: it.options ?? (type === "single" ? ["Yes", "Partly", "No"] : type === "multi" ? ["Option A", "Option B", "Option C"] : []),
      };
    }),
  }));
  return {
    doc: { title: name, sections: sections.length ? sections : [{ id: "s_1", name: "Section 1", questions: [] }] },
    threshold: typeof def.threshold === "number" ? def.threshold : 3.0,
    agg: def.aggregation ?? "Section mean",
  };
}

function scaleToStr(scale?: { min?: number; max?: number }): string {
  if (!scale) return "1–5";
  if (scale.min === 0 && scale.max === 10) return "0–10";
  if (scale.min === 1 && scale.max === 7) return "1–7";
  return "1–5";
}
