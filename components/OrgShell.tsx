import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/util";

// The Organization section shell (Conscia design system): a rich org header
// (logo + name + plan / member / team counts) above an underline tab bar
// shared by Organization, Teams, Members and Integrations. Counts are
// resolved here so every tab gets them without plumbing through each page.
type TabKey = "organization" | "teams" | "members" | "integrations";

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", enterprise: "Enterprise" };

export async function OrgShell({
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
  const ctx = await requireSession();
  const supabase = createClient();
  const w = ctx.workspace;

  const [{ count: memberCount }, { count: teamCount }, integ] = await Promise.all([
    supabase.from("membership").select("*", { count: "exact", head: true }).eq("workspace_id", w.id).eq("status", "active"),
    supabase.from("team").select("*", { count: "exact", head: true }).eq("workspace_id", w.id).is("deleted_at", null),
    isAdmin
      ? supabase.from("integration").select("*", { count: "exact", head: true }).eq("workspace_id", w.id).eq("status", "connected")
      : Promise.resolve({ count: 0 }),
  ]);

  const tabs: { key: TabKey; label: string; href: string; count?: number | null; icon: ReactNode }[] = [
    ...(isAdmin ? [{ key: "organization" as TabKey, label: "Organization", href: "/organization", icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" /></svg>
    ) }] : []),
    { key: "teams" as TabKey, label: "Teams", href: "/teams", count: teamCount ?? 0, icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v3M6 16v-2h12v2" /></svg>
    ) },
    { key: "members" as TabKey, label: "Members", href: "/members", count: memberCount ?? 0, icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 19v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></svg>
    ) },
    ...(isAdmin ? [{ key: "integrations" as TabKey, label: "Integrations", href: "/integrations", count: (integ as { count: number | null }).count ?? 0, icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8zM12 16v6" /></svg>
    ) }] : []),
  ];

  return (
    <div className="org-shell">
      <div className="ohead">
        <div className="ologo">{initials(w.name)}</div>
        <div className="ohead-main">
          <h1>{w.name}</h1>
          <div className="osub">
            <span className="ohead-plan">{PLAN_LABEL[w.plan] ?? w.plan} plan</span>
            <span>{memberCount ?? 0} {memberCount === 1 ? "member" : "members"} · {teamCount ?? 0} {teamCount === 1 ? "team" : "teams"}</span>
            {w.join_code ? <span className="ohead-id">ID {w.join_code}</span> : null}
          </div>
        </div>
        {isAdmin ? (
          <div className="ohead-r">
            <Link className="btn-prim" href="/members">Invite people</Link>
          </div>
        ) : null}
      </div>

      <nav className="otabband" aria-label="Organization sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`otabband-t${active === t.key ? " on" : ""}`}
            aria-current={active === t.key ? "page" : undefined}
          >
            {t.icon}
            {t.label}
            {t.count != null ? <span className="otabband-c">{t.count}</span> : null}
          </Link>
        ))}
      </nav>

      <div className="opanel">
        <div className="opanel-body">
          {subtitle ? <p className="opanel-sub">{subtitle}</p> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
