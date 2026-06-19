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

  const tabs: { key: TabKey; label: string; href: string; count?: number | null }[] = [
    ...(isAdmin ? [{ key: "organization" as TabKey, label: "Organization", href: "/organization" }] : []),
    { key: "teams" as TabKey, label: "Teams", href: "/teams", count: teamCount ?? 0 },
    { key: "members" as TabKey, label: "Members", href: "/members", count: memberCount ?? 0 },
    ...(isAdmin ? [{ key: "integrations" as TabKey, label: "Integrations", href: "/integrations", count: (integ as { count: number | null }).count ?? 0 }] : []),
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
            <Link className="btn-sec sm" href="/members">Invite people</Link>
          </div>
        ) : null}
      </div>

      <nav className="otabs" aria-label="Organization sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`otab${active === t.key ? " on" : ""}`}
            aria-current={active === t.key ? "page" : undefined}
          >
            {t.label}
            {t.count != null ? <span className="otab-c">{t.count}</span> : null}
          </Link>
        ))}
      </nav>

      {subtitle ? <p className="org-subtitle">{subtitle}</p> : null}
      {children}
    </div>
  );
}
