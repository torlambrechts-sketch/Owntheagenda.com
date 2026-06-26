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
  whiteboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
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
  // Workshops & Assessments — the things teams build and run.
  { href: "/workshops", label: "Workshops", icon: ICONS.workshops, group: "Workshops & Assessments" },
  { href: "/workshops/whiteboards", label: "Whiteboards", icon: ICONS.whiteboard, group: "Workshops & Assessments" },
  { href: "/assessments", label: "Assessments", icon: ICONS.assess, group: "Workshops & Assessments" },
  // Administration — analytics, flows, actions and org management.
  { href: "/insight", label: "Insights", icon: ICONS.health, group: "Administration", facilitatorHidden: true },
  { href: "/workflow", label: "Flows", icon: ICONS.workflow, group: "Administration" },
  { href: "/actions", label: "Actions", icon: ICONS.actions, group: "Administration" },
  { href: "/organization", label: "Organization", icon: ICONS.org, group: "Administration", adminOnly: true },
  { href: "/teams", label: "Teams", icon: ICONS.teams, group: "Administration" },
  { href: "/members", label: "Members", icon: ICONS.members, group: "Administration" },
  { href: "/integrations", label: "Integrations", icon: ICONS.integrations, group: "Administration", adminOnly: true },
  // Help — guidance + the assessment Frameworks reference.
  { href: "/help", label: "Help & Science", icon: ICONS.help, group: "Help" },
  { href: "/assessments/frameworks", label: "Frameworks", icon: ICONS.library, group: "Help" },
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("nav-collapsed") === "1"); } catch { /* no storage */ }
  }, []);
  // Close the mobile nav drawer whenever the route changes (tapping a link).
  useEffect(() => { setMobileNavOpen(false); }, [path]);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("nav-collapsed", next ? "1" : "0"); } catch { /* no storage */ }
      return next;
    });
  }
  // The logo tile is the natural thing to tap: on a phone it opens the menu
  // drawer; on desktop it collapses/expands the text nav as before.
  function onLogoClick() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width:980px)").matches) {
      setMobileNavOpen((o) => !o);
    } else {
      toggleCollapsed();
    }
  }
  const unread = chrome.notifications.filter((n) => !n.read).length;
  const active = (href: string) => path === href || path.startsWith(href + "/");
  // Per-nav-item active. "/assessments" must NOT light up on the
  // Builder/Templates sub-routes, nor on Frameworks (now a Help item);
  // query-only links (Take survey demo) never do.
  const navItemActive = (href: string) => {
    if (href.includes("?")) return false;
    if (href === "/assessments") return path === "/assessments" || (path.startsWith("/assessments/") && !path.startsWith("/assessments/builder") && !path.startsWith("/assessments/templates") && !path.startsWith("/assessments/take") && !path.startsWith("/assessments/frameworks"));
    // "Workshops" (the section landing) owns the home, templates, builder and a
    // specific workshop (/workshops/<id>), but NOT the Whiteboards or Run
    // sibling nav items.
    if (href === "/workshops") return path === "/workshops" || (path.startsWith("/workshops/") && !path.startsWith("/workshops/whiteboards"));
    return active(href);
  };
  // Breadcrumb: prefer an exact route match, then the longest prefix.
  const current = NAV.find((n) => !n.href.includes("?") && path === n.href) ?? NAV.find((n) => navItemActive(n.href));
  const admin = isAdmin(chrome.role);
  const facilitator = chrome.role === "facilitator";
  const visibleNav = NAV.filter((n) => (!n.adminOnly || admin) && !(n.facilitatorHidden && facilitator));
  // The Organization sub-pages collapse to a single "Organization" entry (its
  // own tabs route within the page). Non-admins land on Teams — their first tab.
  const ORG_TABS = ["/organization", "/teams", "/members", "/integrations"];
  const orgHref = admin ? "/organization" : "/teams";
  const orgActive = ORG_TABS.some((h) => active(h));

  // Sidebar groups, in order. Each is one labelled section in the text menu and
  // one icon in the collapsed rail.
  const GROUP_ORDER = ["Workspace", "Workshops & Assessments", "Administration", "Help"];
  const GROUP_ICON: Record<string, JSX.Element> = {
    "Workspace": ICONS.dashboard,
    "Workshops & Assessments": ICONS.workshops,
    "Administration": ICONS.org,
    "Help": ICONS.help,
  };
  const groups = GROUP_ORDER.filter((g) => visibleNav.some((n) => n.group === g));
  // A group is active when any of its items is — Organization tabs fold into orgActive.
  const groupActive = (g: string) =>
    visibleNav.some((n) => n.group === g && (ORG_TABS.includes(n.href) ? orgActive : navItemActive(n.href)));
  // Rail target: the group's first visible item (Organization → its landing tab).
  const groupHref = (g: string) => {
    const first = visibleNav.find((n) => n.group === g);
    if (!first) return "/dashboard";
    return ORG_TABS.includes(first.href) ? orgHref : first.href;
  };
  const helpSlug = SECTION_HELP[path.split("/")[1] ?? ""];
  const helpHref = helpSlug ? `/help/${helpSlug}` : "/help";
  const canSwitch = chrome.workspaces.length > 1;

  return (
    <div className={`app${collapsed ? " collapsed" : ""}${mobileNavOpen ? " mobile-open" : ""}`}>
      {/* mobile drawer scrim */}
      <div className="mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      {/* icon rail */}
      <nav className="rail" aria-label="Sections">
        <button className="logo-tile" onClick={onLogoClick} title="Menu" aria-label="Menu">
          <LogoMark size={40} />
        </button>
        {collapsed ? (
          <button className="rail-expand" onClick={onLogoClick} title="Expand menu" aria-label="Expand menu">›</button>
        ) : null}
        {groups.map((g) => (
          <Link key={g} className={`ri${groupActive(g) ? " active" : ""}`} href={groupHref(g)} title={g}>
            {GROUP_ICON[g]}
          </Link>
        ))}
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
        {groups.map((g) => {
          // List the group's items; the Organization sub-tabs fold into a
          // single "Organization" link rendered in place.
          const items = visibleNav.filter((n) => n.group === g && !ORG_TABS.includes(n.href));
          const hasOrg = visibleNav.some((n) => n.group === g && ORG_TABS.includes(n.href));
          return (
            <div className="grp" key={g}>
              <h4>{g}</h4>
              {items.map((n) => (
                <Link key={n.href} href={n.href} className={navItemActive(n.href) ? "active" : ""}>
                  <span className="dot" />
                  {n.label}
                </Link>
              ))}
              {hasOrg ? (
                <Link href={orgHref} className={orgActive ? "active" : ""}>
                  <span className="dot" />
                  Organization
                </Link>
              ) : null}
            </div>
          );
        })}
      </aside>

      {/* main */}
      <main className="main">
        <div className="appbar">
          <button className="mobile-menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
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
