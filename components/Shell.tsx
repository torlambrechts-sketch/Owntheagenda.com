"use client";

import { useState } from "react";
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
};

const NAV: { href: string; label: string; icon: JSX.Element; group: string; adminOnly?: boolean; facilitatorHidden?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard, group: "Workspace" },
  { href: "/health", label: "Health", icon: ICONS.health, group: "Workspace", facilitatorHidden: true },
  { href: "/members", label: "Members", icon: ICONS.members, group: "People" },
  { href: "/teams", label: "Teams", icon: ICONS.teams, group: "People" },
  { href: "/workshops", label: "Workshops", icon: ICONS.workshops, group: "Effectiveness" },
  { href: "/sessions", label: "Sessions", icon: ICONS.sessions, group: "Effectiveness" },
  { href: "/canvas", label: "Canvas", icon: ICONS.canvas, group: "Effectiveness" },
  { href: "/actions", label: "Actions", icon: ICONS.actions, group: "Effectiveness" },
  { href: "/library", label: "Library", icon: ICONS.library, group: "Effectiveness" },
  { href: "/assessments", label: "Assessments", icon: ICONS.assess, group: "Effectiveness" },
  { href: "/organization", label: "Organization", icon: ICONS.org, group: "Organization", adminOnly: true },
  { href: "/integrations", label: "Integrations", icon: ICONS.integrations, group: "Organization", adminOnly: true },
];

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
  const unread = chrome.notifications.filter((n) => !n.read).length;
  const active = (href: string) => path === href || path.startsWith(href + "/");
  const current = NAV.find((n) => active(n.href));
  const admin = isAdmin(chrome.role);
  const facilitator = chrome.role === "facilitator";
  const visibleNav = NAV.filter((n) => (!n.adminOnly || admin) && !(n.facilitatorHidden && facilitator));
  const groups = ["Workspace", "People", "Effectiveness", "Organization"].filter((g) =>
    visibleNav.some((n) => n.group === g),
  );
  const canSwitch = chrome.workspaces.length > 1;

  return (
    <div className="app">
      {/* icon rail */}
      <nav className="rail" aria-label="Sections">
        <div className="logo-tile">
          <LogoMark size={40} />
        </div>
        {visibleNav.map((n) => (
          <Link
            key={n.href}
            className={`ri${active(n.href) ? " active" : ""}`}
            href={n.href}
            title={n.label}
          >
            {n.icon}
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
        </div>
        {groups.map((g) => (
          <div className="grp" key={g}>
            <h4>{g}</h4>
            {visibleNav.filter((n) => n.group === g).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={active(n.href) ? "active" : ""}
              >
                <span className="dot" />
                {n.label}
              </Link>
            ))}
          </div>
        ))}
      </aside>

      {/* main */}
      <main className="main">
        <div className="appbar">
          <div className="crumb">
            {current ? (
              <>
                {current.group} <span style={{ color: "var(--faint)" }}>›</span>{" "}
                <b>{current.label}</b>
              </>
            ) : (
              <b>OwnTheAgenda</b>
            )}
          </div>
          <div className="right">
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
