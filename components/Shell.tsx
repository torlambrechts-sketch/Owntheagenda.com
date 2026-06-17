"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { signout } from "@/app/auth/actions";
import { initials } from "@/lib/util";

export type ShellChrome = {
  workspaceName: string;
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
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard, group: "Workspace" },
  { href: "/members", label: "Members", icon: ICONS.members, group: "People" },
  { href: "/teams", label: "Teams", icon: ICONS.teams, group: "People" },
];

export function Shell({
  chrome,
  children,
}: {
  chrome: ShellChrome;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");
  const current = NAV.find((n) => active(n.href));
  const groups = ["Workspace", "People"];

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
            <div className="org-chip">
              <span className="sq">
                {initials(chrome.workspaceName).slice(0, 2)}
              </span>
              {chrome.workspaceName}
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
