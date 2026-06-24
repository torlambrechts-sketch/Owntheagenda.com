import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { listTemplates } from "@/lib/assessments";
import { AssessmentNav } from "@/components/AssessmentNav";
import { BuilderClient, type StarterTemplate } from "./BuilderClient";

// In-shell assessment builder (the handoff's Builder screen) — rendered inside
// the app shell with the Assessments sub-nav, not as a full-screen surface.
// Admin-only; the save RPC also enforces it.
export default async function AssessmentBuilderInShell({ searchParams }: { searchParams: { demo?: string } }) {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/assessments");

  // The workspace's own instruments, offered in the gallery for editing.
  const rows = await listTemplates();
  const mine: StarterTemplate[] = rows
    .filter((t) => t.workspace_id === ctx.workspace.id)
    .map((t) => {
      const def = (t.definition ?? {}) as { dimensions?: { key: string; label: string }[]; items?: { dimension?: string; text?: string; type?: string }[] };
      const dims = def.dimensions ?? [];
      const items = def.items ?? [];
      return {
        id: t.id,
        key: t.key,
        title: t.name,
        category: t.category || "Custom",
        desc: t.description || "Your workspace instrument.",
        builtIn: false,
        sections: dims.map((d) => ({
          name: d.label,
          questions: items
            .filter((it) => it.dimension === d.key)
            .map((it) => ({ text: it.text ?? "", type: normalizeType(it.type) })),
        })),
      };
    });

  return (
    <>
      <AssessmentNav active="builder" />
      <BuilderClient mine={mine} demo={searchParams.demo === "1"} />
    </>
  );
}

function normalizeType(t?: string): "likert" | "yesno" | "single" | "multi" | "text" {
  if (t === "single" || t === "multi" || t === "text") return t;
  return "likert";
}
