import { describe, it, expect } from "vitest";
import { initials, clock, roleLabel, isAdmin } from "@/lib/util";

describe("initials", () => {
  it("takes first + last initial", () => {
    expect(initials("Henrik Solberg")).toBe("HS");
  });
  it("handles a single name", () => {
    expect(initials("Madonna")).toBe("M");
  });
  it("collapses extra whitespace", () => {
    expect(initials("  ada   lovelace ")).toBe("AL");
  });
  it("falls back when empty or null", () => {
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials(undefined, "—")).toBe("—");
  });
});

describe("clock", () => {
  it("formats cumulative minutes as h:mm", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(10)).toBe("0:10");
    expect(clock(65)).toBe("1:05");
    expect(clock(125)).toBe("2:05");
  });
});

describe("roleLabel", () => {
  it("returns the business-facing role label", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("member")).toBe("Employee");
  });
});

describe("isAdmin", () => {
  it("is true for owner/admin only", () => {
    expect(isAdmin("owner")).toBe(true);
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("member")).toBe(false);
  });
});
