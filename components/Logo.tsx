// The "Lead line" mark — the item you own sits on top, marked with the accent.
// Accent defaults to the app's forest green; "gold" matches the imported
// design's agenda mark. Existing usages are unaffected.
export function LogoMark({ size = 40, accent = "green" }: { size?: number; accent?: "green" | "gold" }) {
  const lead = accent === "gold" ? "#c9a227" : "#3f7d5a";
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <rect width="44" height="44" rx="10" fill="#3a4d3f" />
      <circle cx="13" cy="15" r="3" fill={lead} />
      <rect x="19" y="13.5" width="16" height="3" rx="1.5" fill="#f3f1e8" />
      <rect x="13" y="21.5" width="22" height="3" rx="1.5" fill="#f3f1e8" opacity=".45" />
      <rect x="13" y="28.5" width="18" height="3" rx="1.5" fill="#f3f1e8" opacity=".3" />
    </svg>
  );
}

// Self-contained app-icon / favicon variant — the agenda mark on its own rounded
// square, sized for small surfaces. Mirrors the imported design's favicon.
export function FaviconMark({ size = 32, accent = "gold" }: { size?: number; accent?: "green" | "gold" }) {
  const lead = accent === "gold" ? "#c9a227" : "#3f7d5a";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1a3d32" />
      <circle cx="19" cy="21" r="4.4" fill={lead} />
      <rect x="27" y="18.3" width="22" height="5.4" rx="2.7" fill="#f3f1e8" />
      <circle cx="19" cy="32.8" r="3.6" fill="#f3f1e8" opacity=".5" />
      <rect x="27" y="30.2" width="15" height="5" rx="2.5" fill="#f3f1e8" opacity=".5" />
      <circle cx="19" cy="44.2" r="3.6" fill="#f3f1e8" opacity=".34" />
      <rect x="27" y="41.6" width="18" height="5" rx="2.5" fill="#f3f1e8" opacity=".34" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wm">
      Own<span className="t">the</span>Agenda
    </span>
  );
}
