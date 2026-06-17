"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Theme = { title: string; points: string[] };
export type Synthesis = { ai: boolean; note?: string; themes: Theme[]; actions: string[] };

type IdeaRow = { id: string; block_ord: number; lane: string | null; text: string; votes: number };
type BlockRow = { ord: number; title: string; activity_type: string; config: any };

// Add one of the synthesised actions to the tracked Actions board,
// stamped to this session via the workspace-guarded RPC.
export async function addSessionAction(
  sessionId: string,
  text: string,
): Promise<{ error?: string }> {
  const t = text.trim();
  if (!t) return { error: "Empty action." };
  const supabase = createClient();
  const { error } = await supabase.rpc("add_action", { p_session: sessionId, p_text: t });
  if (error) return { error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/actions");
  return {};
}

export async function synthesizeSession(
  sessionId: string,
): Promise<{ error?: string } & Partial<Synthesis>> {
  const supabase = createClient();
  const { data: session } = await supabase
    .from("session")
    .select("id, workshop_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { error: "Session not found." };

  const [{ data: blocks }, { data: ideas }, { data: votes }] = await Promise.all([
    supabase.from("block").select("ord, title, activity_type, config").eq("workshop_id", session.workshop_id).order("ord", { ascending: true }),
    supabase.from("idea").select("id, block_ord, lane, text").eq("session_id", sessionId),
    supabase.from("idea_vote").select("idea_id").eq("session_id", sessionId),
  ]);

  const voteCount = new Map<string, number>();
  for (const v of votes ?? []) voteCount.set(v.idea_id, (voteCount.get(v.idea_id) ?? 0) + 1);
  const ideaList: IdeaRow[] = (ideas ?? []).map((i: any) => ({
    id: i.id, block_ord: i.block_ord, lane: i.lane, text: i.text, votes: voteCount.get(i.id) ?? 0,
  }));
  if (!ideaList.length) {
    return { error: "This session has no brainstorm, vote, or feedback content to synthesise." };
  }

  const blockList = (blocks ?? []) as BlockRow[];
  const isVotey = (ord: number) => {
    const b = blockList.find((x) => x.ord === ord);
    return b ? b.activity_type === "brainstorm" || b.activity_type === "vote" : false;
  };
  const ranked = ideaList.filter((i) => isVotey(i.block_ord)).sort((a, b) => b.votes - a.votes);
  const feedbackBlocks = blockList.filter((b) => b.activity_type === "feedback");

  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const ai = await callClaude(key, buildContent(ranked, feedbackBlocks, ideaList));
      if (ai) return { ai: true, themes: ai.themes, actions: ai.actions };
    } catch {
      /* fall through to the deterministic synthesis */
    }
  }

  const h = heuristic(ranked, feedbackBlocks, ideaList);
  return {
    ai: false,
    note: "Quick synthesis. Set ANTHROPIC_API_KEY to have Claude write the themes.",
    themes: h.themes,
    actions: h.actions,
  };
}

function buildContent(ranked: IdeaRow[], feedbackBlocks: BlockRow[], ideaList: IdeaRow[]) {
  const lines: string[] = [];
  if (ranked.length) {
    lines.push("VOTED IDEAS (highest first):");
    ranked.slice(0, 14).forEach((i) => lines.push(`- ${i.text} [${i.votes} vote${i.votes === 1 ? "" : "s"}]`));
  }
  for (const fb of feedbackBlocks) {
    const lanes: string[] = (fb.config?.lanes ?? []) as string[];
    lines.push(`\nFEEDBACK — ${fb.title}:`);
    for (const lane of lanes) {
      const cards = ideaList.filter((i) => i.block_ord === fb.ord && (i.lane ?? "") === lane);
      if (cards.length) {
        lines.push(`  ${lane}:`);
        cards.forEach((c) => lines.push(`   - ${c.text}`));
      }
    }
  }
  return lines.join("\n");
}

async function callClaude(
  key: string,
  content: string,
): Promise<{ themes: Theme[]; actions: string[] } | null> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const system =
    "You are an executive team facilitator. Synthesise a leadership session's raw output into clear themes and concrete next actions. " +
    'Respond with ONLY minified JSON of shape {"themes":[{"title":string,"points":[string]}],"actions":[string]}. ' +
    "Give 2-4 themes (each 1-3 short points) and 3-5 actions; each action must be concrete and ownable. No prose outside the JSON.";
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
  const actions: string[] = Array.isArray(parsed.actions) ? parsed.actions.map(String) : [];
  return { themes, actions };
}

function heuristic(ranked: IdeaRow[], feedbackBlocks: BlockRow[], ideaList: IdeaRow[]) {
  const themes: Theme[] = [];
  if (ranked.length) {
    themes.push({
      title: "Top priorities",
      points: ranked.slice(0, 4).map((i) => (i.votes ? `${i.text} (${i.votes} votes)` : i.text)),
    });
  }
  for (const fb of feedbackBlocks) {
    const lanes: string[] = (fb.config?.lanes ?? []) as string[];
    for (const lane of lanes) {
      const cards = ideaList.filter((i) => i.block_ord === fb.ord && (i.lane ?? "") === lane).map((i) => i.text);
      if (cards.length) themes.push({ title: lane, points: cards.slice(0, 5) });
    }
  }
  const actions = ranked.filter((i) => i.votes > 0).slice(0, 3).map((i) => i.text);
  return { themes, actions: actions.length ? actions : ranked.slice(0, 3).map((i) => i.text) };
}
