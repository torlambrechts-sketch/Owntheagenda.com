import Link from "next/link";

// The Assessments section sub-nav (the handoff's left "ASSESSMENTS" menu),
// rendered as the app's standard in-shell tab band — mirrors OrgShell so the
// Assessments module gets the same contextual navigation idiom as Organization.
export type AssessmentTab = "overview" | "builder" | "templates" | "participants" | "take";

const I = (d: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const TABS: { key: AssessmentTab; label: string; href: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", href: "/assessments", icon: I(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>) },
  { key: "builder", label: "Builder", href: "/assessments/builder", icon: I(<><path d="M13 3 4 12l-1 5 5-1 9-9z" /><path d="m14 4 6 6" /></>) },
  { key: "templates", label: "Templates", href: "/assessments/templates", icon: I(<><rect x="3" y="3" width="18" height="7" rx="1" /><rect x="3" y="13" width="18" height="8" rx="1" /></>) },
  { key: "participants", label: "Participants", href: "/members", icon: I(<><path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 19v-2a4 4 0 0 0-3-3.87" /></>) },
  { key: "take", label: "Take survey (demo)", href: "/assessments/builder?demo=1", icon: I(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>) },
];

export function AssessmentNav({ active }: { active: AssessmentTab }) {
  return (
    <nav className="otabband" aria-label="Assessment sections" style={{ marginBottom: 20 }}>
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`otabband-t${active === t.key ? " on" : ""}`}
          aria-current={active === t.key ? "page" : undefined}
        >
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
