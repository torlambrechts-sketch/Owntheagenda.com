"use server";

import { createClient } from "@/lib/supabase/server";

// Scores a leadership-inventory response. Reverse-scoring is applied inside the
// score_leadership RPC, driven by the relational question definitions.
export async function scoreLeadership(
  scores: Record<string, number>,
): Promise<{ error?: string; result?: unknown }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("score_leadership", { p_scores: scores });
  if (error) return { error: error.message };
  return { result: data };
}
