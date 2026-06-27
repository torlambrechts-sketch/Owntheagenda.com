"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  ClipboardList,
  Presentation,
  BarChart3,
  Users,
  Bell,
  Building2,
  ChevronRight,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { signout } from "@/app/auth/actions";
import { markNotificationsRead } from "@/app/(app)/actions";
import { setActiveWorkspaceM2 } from "@/app/m2/actions";
import { initials, isManagerOrAbove, roleLabel } from "@/lib/util";
import type { Enums } from "@/types/database.types";

export type M2Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
};

export type M2Chrome = {
  workspaceName: string;
  workspaceId: string;
  role: Enums<"workspace_role">;
  workspaces: { id: string; name: string }[];
  userName: string;
  userEmail: string | null;
  teamName: string | null;
  notifications: M2Notification[];
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  managerOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/m2/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/m2/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/m2/workshops", label: "Workshops", icon: Presentation },
  { href: "/m2/insights", label: "Insights", icon: BarChart3, managerOnly: true },
  { href: "/m2/team", label: "Team", icon: Users },
];

export function Main2Shell({
  chrome,
  children,
}: {
  chrome: M2Chrome;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawer(false);
  }, [path]);

  const active = (href: string) => path === href || path.startsWith(href + "/");
  const nav = NAV.filter((n) => !n.managerOnly || isManagerOrAbove(chrome.role));
  const current = nav.find((n) => active(n.href));
  const unread = chrome.notifications.filter((n) => !n.read).length;
  const canSwitch = chrome.workspaces.length > 1;

  return (
    <div className={`m2-app${drawer ? " drawer-open" : ""}`}>
      {/* icon rail (desktop) */}
      <nav className="m2-rail" aria-label="Sections">
        <Link className="m2-rail-logo" href="/m2/dashboard" aria-label="OwnTheAgenda home">
          O
        </Link>
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              className={`m2-rail-ic${active(n.href) ? " active" : ""}`}
              href={n.href}
              title={n.label}
              aria-label={n.label}
            >
              <Icon strokeWidth={1.9} />
            </Link>
          );
        })}
        <div className="m2-rail-foot">
          <span className="m2-rail-av" title={chrome.userName}>
            {initials(chrome.userName)}
          </span>
        </div>
      </nav>

      {/* section nav (desktop) / drawer (mobile) */}
      <aside className="m2-nav" aria-label="Primary">
        <button
          className="m2-nav-close"
          onClick={() => setDrawer(false)}
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
        <span className="m2-nav-word">OwnTheAgenda</span>
        <div className="m2-nav-grp-label">Platform</div>
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              className={`m2-nav-item${active(n.href) ? " active" : ""}`}
              href={n.href}
            >
              <span className="m2-nav-dot" />
              <Icon />
              {n.label}
            </Link>
          );
        })}
        <div className="m2-nav-foot">
          <span className="av">{initials(chrome.userName)}</span>
          <div className="who">
            <b>{chrome.userName}</b>
            <span>
              {roleLabel(chrome.role)}
              {chrome.teamName ? ` · ${chrome.teamName}` : ""}
            </span>
          </div>
        </div>
      </aside>

      {/* scrim for the drawer */}
      <div
        className="m2-scrim"
        onClick={() => setDrawer(false)}
        aria-hidden={!drawer}
      />

      {/* main */}
      <main className="m2-main">
        {/* desktop appbar */}
        <div className="m2-appbar">
          <div className="m2-crumb">
            {current ? (
              <>
                <span>OwnTheAgenda</span>
                <ChevronRight />
                <b>{current.label}</b>
              </>
            ) : (
              <b>OwnTheAgenda</b>
            )}
          </div>
          <div className="m2-appbar-right">
            <div className="m2-rel">
              <button
                className="m2-ws-chip"
                onClick={() => canSwitch && setWsOpen((o) => !o)}
                style={{ cursor: canSwitch ? "pointer" : "default" }}
                aria-haspopup={canSwitch}
                aria-expanded={wsOpen}
              >
                <Building2 />
                <b>{chrome.workspaceName}</b>
                {canSwitch ? <span style={{ color: "var(--faint)" }}>▾</span> : null}
              </button>
              {canSwitch && wsOpen ? (
                <div className="m2-menu">
                  {chrome.workspaces.map((w) => (
                    <button
                      key={w.id}
                      className={`m2-menu-item${w.id === chrome.workspaceId ? " active" : ""}`}
                      onClick={() => setActiveWorkspaceM2(w.id)}
                    >
                      <span className="m2-menu-sq">{initials(w.name).slice(0, 2)}</span>
                      {w.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <NotifButton
              chrome={chrome}
              unread={unread}
              open={notifOpen}
              setOpen={setNotifOpen}
              onNavigate={(link) => router.push(link)}
            />
            <form action={signout}>
              <button className="m2-btn ghost sm" type="submit" title="Sign out">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* mobile top bar */}
        <div className="m2-topbar">
          <button
            className="m2-burger"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="m2-topbar-brand">{current?.label ?? "OwnTheAgenda"}</span>
          <div className="m2-topbar-right">
            <NotifButton
              chrome={chrome}
              unread={unread}
              open={notifOpen}
              setOpen={setNotifOpen}
              onNavigate={(link) => router.push(link)}
            />
          </div>
        </div>

        <div className="m2-content">{children}</div>
      </main>

      {/* mobile bottom tabs */}
      <nav className="m2-tabbar" aria-label="Primary (mobile)">
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`m2-tab${active(n.href) ? " active" : ""}`}
            >
              <Icon strokeWidth={active(n.href) ? 2.2 : 1.8} />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NotifButton({
  chrome,
  unread,
  open,
  setOpen,
  onNavigate,
}: {
  chrome: M2Chrome;
  unread: number;
  open: boolean;
  setOpen: (fn: (o: boolean) => boolean) => void;
  onNavigate: (link: string) => void;
}) {
  return (
    <div className="m2-rel">
      <button
        className="m2-iconbtn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell />
        {unread > 0 ? <span className="m2-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div className="m2-menu">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 10px 8px",
            }}
          >
            <b style={{ fontSize: 13 }}>Notifications</b>
            {unread > 0 ? (
              <button className="m2-link" onClick={() => markNotificationsRead()}>
                Mark all read
              </button>
            ) : null}
          </div>
          {chrome.notifications.length === 0 ? (
            <div style={{ padding: "10px", color: "var(--muted)", fontSize: 12.5 }}>
              You&rsquo;re all caught up.
            </div>
          ) : (
            chrome.notifications.map((n) => (
              <button
                key={n.id}
                className="m2-menu-item"
                style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}
                onClick={() => {
                  if (!n.read) markNotificationsRead(n.id);
                  setOpen(() => false);
                  if (n.link) onNavigate(n.link);
                }}
              >
                <span style={{ fontWeight: n.read ? 500 : 700, fontSize: 12.5 }}>{n.title}</span>
                {n.body ? (
                  <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{n.body}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
