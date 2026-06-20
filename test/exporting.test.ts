import { describe, it, expect } from "vitest";
import { csvCell, toCsv, fileSlug } from "@/lib/exporting";

describe("csvCell", () => {
  it("passes plain values through", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
  });
  it("renders null/undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes and escapes fields with comma, quote or newline", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(toCsv([["a", "b"], [1, 2]])).toBe("a,b\r\n1,2");
  });
  it("escapes per-cell within a row", () => {
    expect(toCsv([["Psychological safety", 5.2]])).toBe("Psychological safety,5.2");
    expect(toCsv([["a,b", 'c"d']])).toBe('"a,b","c""d"');
  });
});

describe("fileSlug", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(fileSlug("Team Effectiveness — Q3!")).toBe("team-effectiveness-q3");
  });
  it("falls back when empty", () => {
    expect(fileSlug("!!!")).toBe("export");
  });
});
