import type { IconKey } from "@/lib/frameworks";

// Inline SVG icons for the Frameworks surface, keyed by category. Server-safe
// (no client runtime), stroke = currentColor so the accent token drives colour.
const PATHS: Record<IconKey, React.ReactNode> = {
  boxes: (<><path d="M3 7l9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>),
  shield: (<><path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z" /><path d="M9 12l2 2 4-4" /></>),
  compass: (<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2Z" /></>),
  chart: (<><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></>),
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></>),
  grad: (<><path d="M12 4 2 9l10 5 10-5-10-5Z" /><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /></>),
  rocket: (<><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M9 15l-3-3c2-6 6-9 12-9 0 6-3 10-9 12Z" /><circle cx="14.5" cy="9.5" r="1.5" /></>),
  book: (<><path d="M4 5v14M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2" /></>),
};

export function FrameworkIcon({ icon, size = 18 }: { icon: IconKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[icon] ?? PATHS.book}
    </svg>
  );
}
