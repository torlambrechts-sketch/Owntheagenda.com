import { createClient } from "@/lib/supabase/server";
import { INSTRUMENTS, instrumentFromRow, type SurveyInstrument } from "@/lib/survey";

// Server-side resolver for the assessment template library. Instruments live in
// the `assessment_template` table (global rows + per-workspace custom rows);
// these helpers turn them into the SurveyInstrument shape the run/respond
// surfaces render. The built-in INSTRUMENTS map is kept only as a fallback so a
// momentary read failure never blanks a live survey.

export type AssessmentTemplate = {
  id: string;
  workspace_id: string | null;
  key: string;
  name: string;
  category: string;
  scope: string; // 'team' | 'individual'
  source: string | null;
  description: string | null;
};

type TemplateWithDef = AssessmentTemplate & { definition: unknown };

const COLUMNS = "id, workspace_id, key, name, category, scope, source, description, definition";

// Every template visible to the caller (global + own workspace, via RLS),
// ordered for display: individual then team, alphabetical within.
export async function listTemplates(): Promise<TemplateWithDef[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("assessment_template")
    .select(COLUMNS)
    .order("scope", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as TemplateWithDef[];
}

// kind → SurveyInstrument map resolved from a set of rows, built-ins as fallback.
export function instrumentsFrom(rows: TemplateWithDef[]): Record<string, SurveyInstrument> {
  const map: Record<string, SurveyInstrument> = { ...INSTRUMENTS };
  for (const r of rows) {
    const inst = instrumentFromRow(r);
    if (inst) map[r.key] = inst;
  }
  return map;
}

// Full kind → SurveyInstrument map (one round-trip).
export async function resolveInstruments(): Promise<Record<string, SurveyInstrument>> {
  return instrumentsFrom(await listTemplates());
}

// One instrument by kind, preferring a workspace-custom row over the global one,
// falling back to the built-in definition.
export async function resolveInstrument(kind: string): Promise<SurveyInstrument | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("assessment_template")
    .select("key, name, definition")
    .eq("key", kind)
    .order("workspace_id", { ascending: true, nullsFirst: false });
  const row = (data ?? [])[0] as { key: string; name: string; definition: unknown } | undefined;
  if (row) {
    const inst = instrumentFromRow(row);
    if (inst) return inst;
  }
  return INSTRUMENTS[kind] ?? null;
}
