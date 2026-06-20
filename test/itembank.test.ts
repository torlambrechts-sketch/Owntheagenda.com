import { describe, it, expect } from "vitest";
import { ITEM_BANK, BANK_TOPICS, searchBank } from "@/lib/itembank";

describe("item bank", () => {
  it("has a healthy library of items", () => {
    expect(ITEM_BANK.length).toBeGreaterThanOrEqual(40);
  });

  it("every item is well-formed", () => {
    for (const it of ITEM_BANK) {
      expect(it.id.trim()).toBeTruthy();
      expect(it.text.trim()).toBeTruthy();
      expect(it.topic.trim()).toBeTruthy();
      expect(it.dimension.trim()).toBeTruthy();
      expect(it.source.trim()).toBeTruthy();
    }
  });

  it("ids are unique (safe to use as React keys / dedupe)", () => {
    const ids = ITEM_BANK.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("derives topics in first-seen order with no duplicates", () => {
    expect(new Set(BANK_TOPICS).size).toBe(BANK_TOPICS.length);
    expect(BANK_TOPICS).toContain("Psychological safety");
    expect(BANK_TOPICS[0]).toBe(ITEM_BANK[0].topic);
  });

  it("includes some reverse-keyed items to blunt acquiescence bias", () => {
    expect(ITEM_BANK.some((i) => i.reverse)).toBe(true);
  });
});

describe("searchBank", () => {
  it("returns everything for an empty query and no topic", () => {
    expect(searchBank("").length).toBe(ITEM_BANK.length);
  });

  it("filters by topic", () => {
    const res = searchBank("", "Trust");
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((i) => i.topic === "Trust")).toBe(true);
  });

  it("matches text case-insensitively", () => {
    const res = searchBank("MISTAKE");
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((i) => /mistake/i.test(i.text))).toBe(true);
  });

  it("matches on dimension and source too", () => {
    expect(searchBank("Edmondson").length).toBeGreaterThan(0);
    expect(searchBank("Belonging").length).toBeGreaterThan(0);
  });

  it("returns nothing for a no-match query", () => {
    expect(searchBank("zzz-no-such-term-xyz").length).toBe(0);
  });
});
