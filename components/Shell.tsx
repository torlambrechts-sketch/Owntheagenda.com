"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { signout } from "@/app/auth/actions";
import { setActiveWorkspace } from "@/app/(app)/actions";
import { initials } from "@/lib/util";

export type ShellChrome = {
  workspaceName: string;
  workspaceId: string;
  workspaces: { id: string; name: string }[];
  userName: string;
  userEmail: string | null;
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
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard, group: "Workspace" },
  { href: "/members", label: "Members", icon: ICONS.members, group: "People" },
  { href: "/teams", label: "Teams", icon: ICONS.teams, group: "People" },
  { href: "/workshops", label: "Workshops", icon: ICONS.workshops, group: "Effectiveness" },
  { href: "/actions", label: "Actions", icon: ICONS.actions, group: "Effectiveness" },
  { href: "/assessments", label: "Assessments", icon: ICONS.assess, group: "Effectiveness" },
];

export function Shell({
  chrome,
  children,
}: {
  chrome: ShellChrome;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [wsOpen, setWsOpen] = useState(false);
  const active = (href: string) => path === href || path.startsWith(href + "/");
  const current = NAV.find((n) => active(n.href));
  const groups = ["Workspace", "People", "Effectiveness"];
  const canSwitch = chrome.workspaces.length > 1;

  return (
    <div className="app">
      {/* icon rail */}
      <nav className="rail" aria-label="Sections">
        <div className="logo-tile">
          <LogoMark size={40} />
        </div>
        {NAV.map((n) => (
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
            {NAV.filter((n) => n.group === g).map((n) => (
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
