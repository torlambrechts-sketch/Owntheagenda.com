import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { TemplateBuilder, type ExistingTemplate, type BankItem, type TemplateVersion } from "../TemplateBuilder";

// Author a workspace-custom assessment. Create (no id), edit (?id=…), or start
// from a copy of any readable instrument (?from=…). Admin-only — the save RPC
// also enforces it.
export default async function TemplateBuilderPage({
  searchParams,
}: {
  searchParams: { id?: string; from?: string };
}) {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/assessments");
  const supabase = createClient();

  function toExisting(data: {
    id: string; name: string; category: string; scope: string;
    source: string | null; description: string | null; definition: unknown;
  }): ExistingTemplate {
    return {
      id: data.id,
      name: data.name,
      category: data.category,
      scope: data.scope,
      source: data.source,
      description: data.description,
      definition: data.definition as ExistingTemplate["definition"],
    };
  }

  let existing: ExistingTemplate | null = null;
  let seed: ExistingTemplate | null = null;

  if (searchParams.id) {
    const { data } = await supabase
      .from("assessment_template")
      .select("id, name, category, scope, source, description, definition, workspace_id")
      .eq("id", searchParams.id)
      .maybeSingle();
    // Editing is restricted to this workspace's own custom instruments.
    if (data && data.workspace_id === ctx.workspace.id) existing = toExisting(data);
    else redirect("/assessments");
  } else if (searchParams.from) {
    // Clone any *readable* instrument (a global built-in or an own custom one)
    // into a fresh draft — RLS already limits what can be read.
    const { data } = await supabase
      .from("assessment_template")
      .select("id, name, category, scope, source, description, definition")
      .eq("id", searchParams.from)
      .maybeSingle();
    if (data) seed = toExisting(data);
  }

  // Question bank: every item from every instrument the workspace can read, so
  // an author can search and reuse validated wording instead of starting blank.
  const { data: bankRows } = await supabase
    .from("assessment_template")
    .select("name, source, category, definition")
    .order("name");
  const bankItems: BankItem[] = [];
  const seenText = new Set<string>();
  for (const row of bankRows ?? []) {
    const def = row.definition as { items?: { text?: string }[]; scale?: { max?: number } } | null;
    const dims = (row.definition as { dimensions?: { key: string; label: string }[] } | null)?.dimensions ?? [];
    const dimLabel = new Map(dims.map((d) => [d.key, d.label]));
    for (const it of (def?.items ?? [])) {
      const text = (it.text ?? "").trim();
      if (!text || seenText.has(text.toLowerCase())) continue;
      seenText.add(text.toLowerCase());
      bankItems.push({
        text,
        instrument: row.name as string,
        source: (row.source as string | null) ?? null,
        dimension: dimLabel.get((it as { dimension?: string }).dimension ?? "") ?? null,
      });
    }
  }

  // Known categories (for the controlled-taxonomy picker), distinct + sorted.
  const baseCategories = ["psych_safety", "team_effectiveness", "team_learning", "personality", "custom"];
  const categories = Array.from(
    new Set([...baseCategories, ...((bankRows as { category?: string }[] | null) ?? []).map((r) => r.category).filter(Boolean) as string[]]),
  ).sort();

  // Version history for the instrument being edited. Degrades to [] if the
  // assessment_template_version migration hasn't been applied yet (the query
  // returns an error we ignore rather than throw).
  let versions: TemplateVersion[] = [];
  if (existing) {
    // assessment_template_version isn't in the repo's generated types (the
    // committed types/database.types.ts is intentionally not regenerated here to
    // avoid pulling in unrelated schema drift), so this query is untyped and
    // guarded.
    const { data: vrows, error: vErr } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => { eq: (k: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: TemplateVersion[] | null; error: unknown }> } } };
      };
    })
      .from("assessment_template_version")
      .select("version, name, created_at")
      .eq("template_id", existing.id)
      .order("version", { ascending: false })
      .limit(25);
    if (!vErr && Array.isArray(vrows)) versions = vrows;
  }

  return <TemplateBuilder existing={existing} seed={seed} bankItems={bankItems} categories={categories} versions={versions} />;
}
