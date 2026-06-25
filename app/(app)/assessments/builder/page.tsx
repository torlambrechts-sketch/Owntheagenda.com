import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { listTemplates } from "@/lib/assessments";
import { BuilderClient, type StarterTemplate, type QType } from "./BuilderClient";

type TplDef = {
  scale?: { min: number; max: number; minLabel: string; maxLabel: string };
  dimensions?: { key: string; label: string }[];
  items?: { key?: string; dimension?: string; text?: string; type?: string; options?: string[]; reverse?: boolean }[];
};

// In-shell assessment builder (the handoff's Builder screen) — rendered inside
// the app shell with the Assessments sub-nav, not as a full-screen surface.
// Admin-only; the save RPC also enforces it. Deep-links from the Templates tab:
//   ?tpl=<key>  edit that template in place (workspace templates only)
//   ?use=<key>  start a new template from that one (clone)
//   ?new=template  start from blank
export default async function AssessmentBuilderInShell({
  searchParams,
}: {
  searchParams: { demo?: string; tpl?: string; use?: string; new?: string };
}) {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/assessments");

  const rows = await listTemplates();

  // The workspace's own instruments, offered in the gallery for editing.
  const mine: StarterTemplate[] = rows
    .filter((t) => t.workspace_id === ctx.workspace.id)
    .map((t) => starterFromTemplate(t.name, t.category, t.description, t.definition));

  // Resolve a deep-linked template (by key), preferring the workspace copy.
  const wantedKey = searchParams.tpl ?? searchParams.use ?? null;
  let initial: { starter: StarterTemplate; editId: string | null } | null = null;
  if (wantedKey) {
    const match = rows
      .filter((t) => t.key === wantedKey)
      .sort((a, b) => (a.workspace_id === ctx.workspace.id ? -1 : 1) - (b.workspace_id === ctx.workspace.id ? -1 : 1))[0];
    if (match) {
      const clone = !!searchParams.use || match.workspace_id !== ctx.workspace.id;
      const starter = starterFromTemplate(clone ? `${match.name} (copy)` : match.name, match.category, match.description, match.definition);
      initial = { starter, editId: clone ? null : match.id };
    }
  } else if (searchParams.new === "template" || searchParams.new === "1") {
    initial = {
      starter: { title: "", category: "Custom", desc: "", builtIn: false, sections: [{ name: "Section 1", questions: [{ text: "", type: "likert" }] }] },
      editId: null,
    };
  }

  return <BuilderClient mine={mine} demo={searchParams.demo === "1"} initial={initial} />;
}

// Build the editor's StarterTemplate shape from a stored instrument definition,
// grouping items under their dimension and preserving the question type/options.
function starterFromTemplate(name: string, category: string | null, description: string | null, definition: unknown): StarterTemplate {
  const def = (definition ?? {}) as TplDef;
  const dims = def.dimensions ?? [];
  const items = def.items ?? [];
  return {
    title: name,
    category: category || "Custom",
    desc: description || "Your workspace instrument.",
    builtIn: false,
    scale: def.scale, // preserve the source scale (e.g. 1–7) through the editor
    sections: dims.map((d) => ({
      name: d.label,
      questions: items
        .filter((it) => it.dimension === d.key)
        .map((it) => ({
          text: it.text ?? "",
          type: normalizeType(it.type),
          key: it.key, // preserve the item key so historical responses still resolve
          ...(it.reverse ? { reverse: true } : {}),
          ...(it.options?.length ? { options: it.options } : {}),
        })),
    })),
  };
}

function normalizeType(t?: string): QType {
  if (t === "rating10" || t === "yesno" || t === "single" || t === "multi" || t === "text" || t === "number") return t;
  return "likert";
}
