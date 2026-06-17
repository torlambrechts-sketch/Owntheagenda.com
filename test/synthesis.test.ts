import { describe, it, expect } from "vitest";
import { heuristicSynthesis, buildSynthesisContent, type SynthIdea, type SynthBlock } from "@/lib/synthesis";

const idea = (text: string, votes: number, block_ord = 1, lane: string | null = null): SynthIdea => ({
  id: text,
  block_ord,
  lane,
  text,
  votes,
});

describe("heuristicSynthesis", () => {
  it("ranks top priorities; surfaces minority + opposition as divergent", () => {
    const ranked = [idea("A", 5), idea("B", 3), idea("C", 2), idea("D", 1), idea("E", 1), idea("F", 0)];
    const r = heuristicSynthesis(ranked, [], ranked, [{ id: "d1", title: "Cut scope" }]);
    expect(r.themes[0].title).toBe("Top priorities");
    expect(r.themes[0].points[0]).toContain("A");
    expect(r.actions).toContain("A");
    // D/E are supported-but-not-top -> divergent; opposition -> divergent
    expect(r.divergent.some((d) => d.startsWith("D"))).toBe(true);
    expect(r.divergent.some((d) => d.includes("Cut scope"))).toBe(true);
  });

  it("turns feedback lanes into themes", () => {
    const fb: SynthBlock = { ord: 2, title: "SSC", activity_type: "feedback", config: { lanes: ["Start", "Stop"] } };
    const ideas = [idea("go faster", 0, 2, "Start"), idea("stop meetings", 0, 2, "Stop")];
    const titles = heuristicSynthesis([], [fb], ideas, []).themes.map((t) => t.title);
    expect(titles).toContain("Start");
    expect(titles).toContain("Stop");
  });

  it("falls back to top ideas as actions when nothing was voted", () => {
    const ranked = [idea("only idea", 0)];
    expect(heuristicSynthesis(ranked, [], ranked, []).actions).toEqual(["only idea"]);
  });
});

describe("buildSynthesisContent", () => {
  it("includes voted, minority and opposition sections", () => {
    const ranked = [idea("A", 5), idea("B", 4), idea("C", 3), idea("D", 1)];
    const text = buildSynthesisContent(ranked, [], ranked, [{ id: "d", title: "Risky call" }]);
    expect(text).toContain("VOTED IDEAS");
    expect(text).toContain("MINORITY-SUPPORTED");
    expect(text).toContain("OPPOSITION");
    expect(text).toContain("Risky call");
  });
});
