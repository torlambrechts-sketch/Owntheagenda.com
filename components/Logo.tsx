// The "Lead line" mark — the item you own sits on top, marked green.
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <rect width="44" height="44" rx="10" fill="#3a4d3f" />
      <circle cx="13" cy="15" r="3" fill="#3f7d5a" />
      <rect x="19" y="13.5" width="16" height="3" rx="1.5" fill="#f3f1e8" />
      <rect x="13" y="21.5" width="22" height="3" rx="1.5" fill="#f3f1e8" opacity=".45" />
      <rect x="13" y="28.5" width="18" height="3" rx="1.5" fill="#f3f1e8" opacity=".3" />
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
