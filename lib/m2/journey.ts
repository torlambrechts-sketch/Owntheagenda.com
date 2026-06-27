import type { Tables } from "@/types/database.types";

// Pure helpers for the MAIN2 team-journey / gamification layer. Kept free of
// Supabase so they can be unit-tested and reused across screens.

export type JourneyLevel = Pick<
  Tables<"journey_level">,
  "level" | "name" | "min_xp" | "icon" | "blurb"
>;

export type LevelProgress = {
  current: JourneyLevel;
  next: JourneyLevel | null;
  /** % of the way from the current level's floor to the next level's floor. */
  pct: number;
  xp: number;
  /** XP remaining to reach the next level (0 once maxed). */
  toNext: number;
};

const FALLBACK_LEVEL: JourneyLevel = {
  level: 1,
  name: "Seedling",
  min_xp: 0,
  icon: "sprout",
  blurb: null,
};

// Given a team's XP and the level ladder, work out which level they're on and
// how far they are toward the next one.
export function levelProgress(xp: number, levels: JourneyLevel[]): LevelProgress {
  const safeXp = Math.max(0, xp || 0);
  const sorted = [...levels].sort((a, b) => a.min_xp - b.min_xp);
  if (sorted.length === 0) {
    return { current: FALLBACK_LEVEL, next: null, pct: 100, xp: safeXp, toNext: 0 };
  }

  let current = sorted[0];
  for (const l of sorted) if (safeXp >= l.min_xp) current = l;
  const next = sorted.find((l) => l.min_xp > current.min_xp) ?? null;

  const floor = current.min_xp;
  const ceil = next?.min_xp ?? current.min_xp;
  const span = ceil - floor;
  const pct = next && span > 0 ? Math.min(100, Math.round(((safeXp - floor) / span) * 100)) : 100;
  const toNext = next ? Math.max(0, ceil - safeXp) : 0;

  return { current, next, pct, xp: safeXp, toNext };
}
