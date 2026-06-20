"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { signout } from "@/app/auth/actions";
import { setActiveWorkspace, markNotificationsRead } from "@/app/(app)/actions";
import { initials, isAdmin } from "@/lib/util";
import type { Enums } from "@/types/database.types";

export type ShellNotification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
};

export type ShellChrome = {
  workspaceName: string;
  workspaceId: string;
  role: Enums<"workspace_role">;
  workspaces: { id: string; name: string }[];
  userName: string;
  userEmail: string | null;
  notifications: ShellNotification[];
};

const ICONS = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  members: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="9" r="2.3" />
      <path d="M21 19c0-2.6-1.8-4.4-4-4.4" />
    </svg>
  ),
  teams: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v4M6 16v-2h12v2" />
    </svg>
  ),
  assess: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </svg>
  ),
  library: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5v14M9 5v14" />
      <rect x="13" y="4" width="7" height="16" rx="1" transform="rotate(8 16.5 12)" />
    </svg>
  ),
  workshops: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v3M16 4v3" />
    </svg>
  ),
  actions: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3 7 2 2 3.5-3.5" />
      <path d="m3 16 2 2 3.5-3.5" />
      <path d="M12 7h9M12 17h9" />
    </svg>
  ),
  sessions: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12a9 9 0 1 0 4-7.5" />
      <path d="M3 3v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  ),
  health: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  ),
  canvas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="14" rx="1.5" />
      <path d="M3 9h18M8 18v2.5M16 18v2.5" />
    </svg>
  ),
  org: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21V7l6-3 6 3v14" />
      <path d="M15 21V11l6 3v7M3 21h18" />
    </svg>
  ),
  integrations: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 7V3M15 7V3M8 7h8v4a4 4 0 0 1-8 0z" />
      <path d="M12 15v6" />
    </svg>
  ),
  help: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 3.9" />
      <path d="M12 17.6v.01" />
    </svg>
  ),
  workflow: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 6h6a4 4 0 0 1 4 4M7 18h6a4 4 0 0 0 4-4" />
    </svg>
  ),
};

const NAV: { href: string; label: string; icon: JSX.Element; group: string; adminOnly?: boolean; facilitatorHidden?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard, group: "Workspace" },
  { href: "/insight/leadership-teams", label: "Leadership Teams", icon: ICONS.health, group: "Insight", facilitatorHidden: true },
  { href: "/insight/trends", label: "Trends", icon: ICONS.health, group: "Insight", facilitatorHidden: true },
  { href: "/insight/reports", label: "Reports", icon: ICONS.health, group: "Insight", facilitatorHidden: true },
  { href: "/workflow", label: "Workflow", icon: ICONS.workflow, group: "Effectiveness" },
  { href: "/workshops", label: "Workshops", icon: ICONS.workshops, group: "Effectiveness" },
  { href: "/actions", label: "Actions", icon: ICONS.actions, group: "Effectiveness" },
  { href: "/assessments", label: "Assessments", icon: ICONS.assess, group: "Effectiveness" },
  { href: "/organization", label: "Organization", icon: ICONS.org, group: "Organization", adminOnly: true },
  { href: "/teams", label: "Teams", icon: ICONS.teams, group: "Organization" },
  { href: "/members", label: "Members", icon: ICONS.members, group: "Organization" },
  { href: "/integrations", label: "Integrations", icon: ICONS.integrations, group: "Organization", adminOnly: true },
  { href: "/help", label: "Help & Science", icon: ICONS.help, group: "Help" },
];

// Per-section contextual help: route segment → the guide's slug.
const SECTION_HELP: Record<string, string> = {
  dashboard: "your-dashboard",
  health: "read-team-health",
  insight: "read-team-health",
  members: "invite-your-company",
  teams: "set-up-teams",
  workshops: "run-first-workshop",
  sessions: "facilitate-live-session",
  canvas: "the-canvas",
  actions: "turn-talk-into-action",
  library: "the-template-library",
  assessments: "run-an-assessment",
  organization: "manage-organization-data",
  integrations: "integrations-guide",
};

export function Shell({
  chrome,
  children,
}: {
  chrome: ShellChrome;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [wsOpen, setWsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("nav-collapsed") === "1"); } catch { /* no storage */ }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("nav-collapsed", next ? "1" : "0"); } catch { /* no storage */ }
      return next;
    });
  }
  const unread = chrome.notifications.filter((n) => !n.read).length;
  const active = (href: string) => path === href || path.startsWith(href + "/");
  const current = NAV.find((n) => active(n.href));
  const admin = isAdmin(chrome.role);
  const facilitator = chrome.role === "facilitator";
  const visibleNav = NAV.filter((n) => (!n.adminOnly || admin) && !(n.facilitatorHidden && facilitator));
  // The Organization section collapses to a single rail icon (the text menu
  // keeps the sub-links). Non-admins land on Teams — the first tab they can see.
  const orgHref = admin ? "/organization" : "/teams";
  const orgActive = ["/organization", "/teams", "/members", "/integrations"].some((h) => active(h));
  // Insight collapses to one rail icon; the text menu keeps the three sub-pages.
  const insightHref = "/insight/leadership-teams";
  const insightActive = active("/insight");
  const groups = ["Workspace", "Insight", "Effectiveness", "Organization", "Help"].filter((g) =>
    visibleNav.some((n) => n.group === g),
  );
  const helpSlug = SECTION_HELP[path.split("/")[1] ?? ""];
  const helpHref = helpSlug ? `/help/${helpSlug}` : "/help";
  const canSwitch = chrome.workspaces.length > 1;

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      {/* icon rail */}
      <nav className="rail" aria-label="Sections">
        <button className="logo-tile" onClick={toggleCollapsed} title={collapsed ? "Expand menu" : "Collapse menu"} aria-label={collapsed ? "Expand menu" : "Collapse menu"}>
          <LogoMark size={40} />
        </button>
        {(() => {
          let orgDone = false;
          let insightDone = false;
          return visibleNav.map((n) => {
            if (n.group === "Organization") {
              if (orgDone) return null;
              orgDone = true;
              return (
                <Link key="org-rail" className={`ri${orgActive ? " active" : ""}`} href={orgHref} title="Organization">
                  {ICONS.org}
                </Link>
              );
            }
            if (n.group === "Insight") {
              if (insightDone) return null;
              insightDone = true;
              return (
                <Link key="insight-rail" className={`ri${insightActive ? " active" : ""}`} href={insightHref} title="Insight">
                  {ICONS.health}
                </Link>
              );
            }
            return (
              <Link key={n.href} className={`ri${active(n.href) ? " active" : ""}`} href={n.href} title={n.label}>
                {n.icon}
              </Link>
            );
          });
        })()}
        <div className="spacer" />
        <div className="av sm" title={chrome.userName}>
          {initials(chrome.userName)}
        </div>
      </nav>

      {/* section nav */}
      <aside className="nav">
        <div className="word">
          <span className="wm">
            Own<span className="t">the</span>Agenda
          </span>
          <button className="nav-collapse" onClick={toggleCollapsed} title="Collapse menu" aria-label="Collapse menu">‹</button>
        </div>
        {groups.map((g) => (
          <div className="grp" key={g}>
            <h4>{g}</h4>
            {g === "Organization" ? (
              <Link href={orgHref} className={orgActive ? "active" : ""}>
                <span className="dot" />
                Organization
              </Link>
            ) : (
              visibleNav.filter((n) => n.group === g).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={active(n.href) ? "active" : ""}
                >
                  <span className="dot" />
                  {n.label}
                </Link>
              ))
            )}
          </div>
        ))}
      </aside>

      {/* main */}
      <main className="main">
        <div className="appbar">
          <div className="crumb">
            {current ? (
              current.group === current.label ? (
                <b>{current.label}</b>
              ) : (
                <>
                  {current.group} <span style={{ color: "var(--faint)" }}>›</span>{" "}
                  <b>{current.label}</b>
                </>
              )
            ) : (
              <b>OwnTheAgenda</b>
            )}
          </div>
          <div className="right">
            <Link className="help-btn" href={helpHref} aria-label="Help for this page" title="Help for this page">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.3 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 3.9" />
                <path d="M12 17.6v.01" />
              </svg>
            </Link>
            <div className="bell-wrap">
              <button
                className="bell"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notifications"
                aria-expanded={notifOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {unread > 0 ? <span className="bell-badge">{unread > 9 ? "9+" : unread}</span> : null}
              </button>
              {notifOpen ? (
                <div className="notif-menu">
                  <div className="notif-head">
                    <span>Notifications</span>
                    {unread > 0 ? (
                      <button className="linkbtn" onClick={() => markNotificationsRead()}>Mark all read</button>
                    ) : null}
                  </div>
                  {chrome.notifications.length === 0 ? (
                    <div className="notif-empty">You&rsquo;re all caught up.</div>
                  ) : (
                    chrome.notifications.map((n) => (
                      <button
                        key={n.id}
                        className={`notif-item${n.read ? "" : " unread"}`}
                        onClick={() => {
                          if (!n.read) markNotificationsRead(n.id);
                          setNotifOpen(false);
                          if (n.link) router.push(n.link);
                        }}
                      >
                        <span className="dotn" />
                        <span className="nbody">
                          <span className="nt">{n.title}</span>
                          {n.body ? <span className="nb">{n.body}</span> : null}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <div className="ws-switch">
              <button
                className="org-chip"
                onClick={() => canSwitch && setWsOpen((o) => !o)}
                style={{ cursor: canSwitch ? "pointer" : "default" }}
                aria-haspopup={canSwitch}
                aria-expanded={wsOpen}
              >
                <span className="sq">
                  {initials(chrome.workspaceName).slice(0, 2)}
                </span>
                {chrome.workspaceName}
                {canSwitch ? (
                  <span style={{ color: "var(--faint)", marginLeft: 2 }}>▾</span>
                ) : null}
              </button>
              {canSwitch && wsOpen ? (
                <div className="ws-menu">
                  {chrome.workspaces.map((w) => (
                    <button
                      key={w.id}
                      className={`ws-item${
                        w.id === chrome.workspaceId ? " active" : ""
                      }`}
                      onClick={() => setActiveWorkspace(w.id)}
                    >
                      <span className="sq">{initials(w.name).slice(0, 2)}</span>
                      {w.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <form action={signout}>
              <button className="linkbtn" type="submit" title="Sign out">
                Sign out
              </button>
            </form>
            <div className="av sm" title={chrome.userName}>
              {initials(chrome.userName)}
            </div>
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
