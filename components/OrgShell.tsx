import Link from "next/link";
import type { ReactNode } from "react";

// The Organization section shell: a green section heading + a forest tab band
// (Conscia design system §3) shared by Organization, Teams, Members and
// Integrations. Admin-only tabs are hidden from non-admins.
type TabKey = "organization" | "teams" | "members" | "integrations";

const TABS: { key: TabKey; label: string; href: string; adminOnly?: boolean }[] = [
  { key: "organization", label: "Organization", href: "/organization", adminOnly: true },
  { key: "teams", label: "Teams", href: "/teams" },
  { key: "members", label: "Members", href: "/members" },
  { key: "integrations", label: "Integrations", href: "/integrations", adminOnly: true },
];

export function OrgShell({
  active,
  isAdmin,
  subtitle,
  children,
}: {
  active: TabKey;
  isAdmin: boolean;
  subtitle?: string;
  children: ReactNode;
}) {
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  return (
    <div className="org-shell">
      <h1 className="page-title org-title">Organization</h1>
      <nav className="tabband" aria-label="Organization sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={active === t.key ? "on" : ""}
            aria-current={active === t.key ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {subtitle ? <p className="org-subtitle">{subtitle}</p> : null}
      {children}
    </div>
  );
}
