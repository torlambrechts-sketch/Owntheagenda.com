// Pure synthesis helpers — the deterministic fallback and the prompt
// builder. Kept framework-free so they're unit-testable in isolation.

export type Theme = { title: string; points: string[] };
export type SynthIdea = { id: string; block_ord: number; lane: string | null; text: string; votes: number };
export type SynthBlock = { ord: number; title: string; activity_type: string; config: any };
export type Opposed = { id: string; title: string };

// Deterministic synthesis: top priorities + feedback lanes as themes,
// top-voted as actions, and the minority/divergent tail surfaced.
export function heuristicSynthesis(
  ranked: SynthIdea[],
  feedbackBlocks: SynthBlock[],
  ideaList: SynthIdea[],
  opposed: Opposed[],
): { themes: Theme[]; actions: string[]; divergent: string[] } {
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
  const top = ranked.filter((i) => i.votes > 0).slice(0, 3).map((i) => i.text);
  const divergent = [
    ...ranked.filter((i) => i.votes > 0).slice(3, 6).map((i) => `${i.text} (${i.votes} votes) — supported but not top`),
    ...opposed.map((d) => `Opposition logged on decision: ${d.title}`),
  ];
  return { themes, actions: top.length ? top : ranked.slice(0, 3).map((i) => i.text), divergent };
}

// Compact text representation handed to the model.
export function buildSynthesisContent(
  ranked: SynthIdea[],
  feedbackBlocks: SynthBlock[],
  ideaList: SynthIdea[],
  opposed: Opposed[],
): string {
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
  const minority = ranked.filter((i) => i.votes > 0).slice(3);
  if (minority.length) {
    lines.push("\nMINORITY-SUPPORTED IDEAS (some votes, did not top the list):");
    minority.slice(0, 8).forEach((i) => lines.push(`- ${i.text} [${i.votes}]`));
  }
  if (opposed.length) {
    lines.push("\nDECISIONS WITH RECORDED OPPOSITION:");
    opposed.forEach((d) => lines.push(`- ${d.title}`));
  }
  return lines.join("\n");
}
