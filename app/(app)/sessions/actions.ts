"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  heuristicSynthesis,
  buildSynthesisContent,
  type Theme,
  type SynthIdea as IdeaRow,
  type SynthBlock as BlockRow,
  type Opposed,
} from "@/lib/synthesis";

export type Synthesis = { ai: boolean; note?: string; themes: Theme[]; actions: string[]; divergent: string[] };

// Add one of the synthesised actions to the tracked Actions board.
export async function addSessionAction(sessionId: string, text: string): Promise<{ error?: string }> {
  const t = text.trim();
  if (!t) return { error: "Empty action." };
  const supabase = createClient();
  const { error } = await supabase.rpc("add_action", { p_session: sessionId, p_text: t });
  if (error) return { error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/actions");
  return {};
}

// Facilitator approves the current draft as final.
export async function approveSummary(sessionId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("approve_summary", { p_session: sessionId });
  if (error) return { error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return {};
}

export async function synthesizeSession(
  sessionId: string,
): Promise<{ error?: string } & Partial<Synthesis>> {
  const supabase = createClient();
  const { data: session } = await supabase.from("session").select("id, workshop_id").eq("id", sessionId).maybeSingle();
  if (!session) return { error: "Session not found." };

  const [{ data: blocks }, { data: ideas }, { data: votes }, { data: decisions }] = await Promise.all([
    supabase.from("block").select("ord, title, activity_type, config").eq("workshop_id", session.workshop_id).order("ord", { ascending: true }),
    supabase.from("idea").select("id, block_ord, lane, text").eq("session_id", sessionId),
    supabase.from("idea_vote").select("idea_id").eq("session_id", sessionId),
    supabase.from("decision").select("id, title, status").eq("session_id", sessionId),
  ]);

  const voteCount = new Map<string, number>();
  for (const v of votes ?? []) voteCount.set(v.idea_id, (voteCount.get(v.idea_id) ?? 0) + 1);
  const ideaList: IdeaRow[] = (ideas ?? []).map((i: any) => ({
    id: i.id, block_ord: i.block_ord, lane: i.lane, text: i.text, votes: voteCount.get(i.id) ?? 0,
  }));

  // decisions with recorded opposition (fist-of-five = 1)
  const decList = (decisions ?? []) as { id: string; title: string; status: string }[];
  const decIds = decList.map((d) => d.id);
  const { data: contribs } = decIds.length
    ? await supabase.from("decision_contributor").select("decision_id, agreement").in("decision_id", decIds)
    : { data: [] as { decision_id: string; agreement: number | null }[] };
  const opposed: Opposed[] = decList.filter((d) => (contribs ?? []).some((c) => c.decision_id === d.id && c.agreement === 1));

  if (!ideaList.length && !decList.length) {
    return { error: "This session has no brainstorm, vote, feedback, or decision content to synthesise." };
  }

  const blockList = (blocks ?? []) as BlockRow[];
  const isVotey = (ord: number) => {
    const b = blockList.find((x) => x.ord === ord);
    return b ? b.activity_type === "brainstorm" || b.activity_type === "vote" : false;
  };
  const ranked = ideaList.filter((i) => isVotey(i.block_ord)).sort((a, b) => b.votes - a.votes);
  const feedbackBlocks = blockList.filter((b) => b.activity_type === "feedback");

  let result: { themes: Theme[]; actions: string[]; divergent: string[] } | null = null;
  let ai = false;
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const r = await callClaude(key, buildSynthesisContent(ranked, feedbackBlocks, ideaList, opposed));
      if (r) { result = r; ai = true; }
    } catch {
      /* fall through to the deterministic synthesis */
    }
  }
  if (!result) result = heuristicSynthesis(ranked, feedbackBlocks, ideaList, opposed);

  const content = { themes: result.themes, actions: result.actions, divergent: result.divergent };
  await supabase.rpc("save_summary", { p_session: sessionId, p_content: content as any, p_ai: ai });
  revalidatePath(`/sessions/${sessionId}`);
  return {
    ai,
    note: ai ? undefined : "Quick synthesis. Set ANTHROPIC_API_KEY to have Claude write the themes.",
    ...content,
  };
}

async function callClaude(
  key: string,
  content: string,
): Promise<{ themes: Theme[]; actions: string[]; divergent: string[] } | null> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const system =
    "You are an executive team facilitator. Synthesise a leadership session's raw output faithfully — never invent decisions. " +
    'Respond with ONLY minified JSON of shape {"themes":[{"title":string,"points":[string]}],"actions":[string],"divergent":[string]}. ' +
    "themes: 2-4 affinity clusters of what was raised. actions: 3-5 concrete, ownable next steps. " +
    "divergent: minority or dissenting views worth NOT losing (low-vote-but-supported ideas, recorded opposition) — surface them, never smooth them over. No prose outside the JSON.";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: "user", content }] }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]);
  if (!parsed || !Array.isArray(parsed.themes)) return null;
  const themes: Theme[] = parsed.themes
    .filter((t: any) => t && typeof t.title === "string")
    .map((t: any) => ({ title: t.title, points: Array.isArray(t.points) ? t.points.map(String) : [] }));
  return {
    themes,
    actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
    divergent: Array.isArray(parsed.divergent) ? parsed.divergent.map(String) : [],
  };
}
