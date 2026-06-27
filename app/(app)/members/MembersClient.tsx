"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { useTableControls } from "@/components/TableControls";
import { initials, roleLabel, ROLE_OPTIONS } from "@/lib/util";
import { MemberImport } from "./MemberImport";
import type { Enums } from "@/types/database.types";
import {
  inviteMember,
  updateMemberRole,
  removeMember,
  revokeInvite,
  approveMember,
  denyMember,
  exportMemberData,
  eraseMember,
} from "./actions";

type Role = Enums<"workspace_role">;

export type MemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  role: Role;
  isSelf: boolean;
};
export type InviteRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};
export type RequestRow = {
  membershipId: string;
  name: string;
  email: string | null;
  role: Role;
};
export type TeamOpt = { id: string; name: string };

export function MembersClient({
  workspaceId,
  canManage,
  members,
  invites,
  requests,
  teams,
  joinCode,
}: {
  workspaceId: string;
  canManage: boolean;
  members: MemberRow[];
  invites: InviteRow[];
  requests: RequestRow[];
  teams: TeamOpt[];
  joinCode: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  // invite side-window state
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [teamId, setTeamId] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  function resetInvite() {
    setEmail("");
    setRole("member");
    setTeamId("");
    setRoleTitle("");
    setError(null);
    setLink(null);
  }

  async function submitInvite() {
    setError(null);
    const res = await inviteMember({
      workspaceId,
      email,
      role,
      teamId: teamId || null,
      roleTitle: roleTitle || null,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    const url = `${window.location.origin}/invite/${res.token}`;
    setLink(url);
    flash("Invitation created");
    router.refresh();
  }

  function changeRole(membershipId: string, next: Role) {
    startTransition(async () => {
      const res = await updateMemberRole(membershipId, next);
      if (res.error) flash(res.error);
      else {
        flash("Role updated");
        router.refresh();
      }
    });
  }

  function remove(m: MemberRow) {
    if (!confirm(`Remove ${m.name} from this workspace?`)) return;
    startTransition(async () => {
      const res = await removeMember(m.membershipId);
      if (res.error) flash(res.error);
      else {
        flash("Member removed");
        router.refresh();
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const res = await revokeInvite(id);
      if (res.error) flash(res.error);
      else {
        flash("Invitation revoked");
        router.refresh();
      }
    });
  }

  function approve(id: string) {
    startTransition(async () => {
      const res = await approveMember(id);
      if (res.error) flash(res.error);
      else {
        flash("Member approved");
        router.refresh();
      }
    });
  }

  function deny(id: string) {
    startTransition(async () => {
      const res = await denyMember(id);
      if (res.error) flash(res.error);
      else {
        flash("Request declined");
        router.refresh();
      }
    });
  }

  function exportData(m: MemberRow) {
    startTransition(async () => {
      const res = await exportMemberData(workspaceId, m.userId);
      if (res.error) {
        flash(res.error);
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(m.name || "member").replace(/\s+/g, "_")}-data.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash("Data exported");
    });
  }

  function erase(m: MemberRow) {
    if (!confirm(`Permanently erase ${m.name}'s personal data and remove them from this company? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await eraseMember(workspaceId, m.userId);
      if (res.error) flash(res.error);
      else {
        flash("Member erased");
        router.refresh();
      }
    });
  }

  const mc = useTableControls<MemberRow>(members, {
    search: { placeholder: "Search members…", text: (m) => `${m.name} ${m.email ?? ""}` },
    sorts: [
      { key: "name", label: "Name (A–Z)", cmp: (a, b) => a.name.localeCompare(b.name) },
      { key: "role", label: "Role", cmp: (a, b) => a.role.localeCompare(b.role) },
    ],
    facets: [
      { key: "role", label: "Role", multi: true, options: (["owner", "admin", "manager", "facilitator", "member"] as Role[]).map((r) => ({
        value: r, label: roleLabel(r), test: (m) => m.role === r,
      })) },
    ],
  });
  const memberView = members.length >= 6 ? mc.view : members;

  return (
    <>
      <div className="summary">
        <div className="stat">
          <div className="num">{members.length}</div>
          <div className="lab">Members</div>
        </div>
        <div className="vr" />
        <div className="stat">
          <div className="num">{invites.length}</div>
          <div className="lab">Pending invites</div>
        </div>
        {canManage ? (
          <div className="actions">
            <MemberImport workspaceId={workspaceId} teams={teams} />
            <button
              className="btn-prim"
              onClick={() => {
                resetInvite();
                setOpen(true);
              }}
            >
              Invite member
            </button>
          </div>
        ) : null}
      </div>

      {canManage && joinCode ? (
        <div className="joincode">
          <span className="jc-l">Company ID</span>
          <code className="jc-v">{joinCode}</code>
          <button
            className="linkbtn xs"
            onClick={() => {
              navigator.clipboard?.writeText(joinCode);
              flash("Company ID copied");
            }}
          >
            Copy
          </button>
          <span className="jc-h">Share this so colleagues can self-join at signup</span>
        </div>
      ) : null}

      {canManage && requests.length ? (
        <>
          <div className="eyebrow" style={{ margin: "22px 0 10px" }}>
            Join requests <span className="n">{requests.length}</span>
          </div>
          <div className="tbl-card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Person</th>
                  <th style={{ width: 150 }}>Requested role</th>
                  <th style={{ width: 180 }} />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.membershipId}>
                    <td>
                      <div className="person">
                        <span className="av">{initials(r.name)}</span>
                        <span>{r.name}<small>{r.email}</small></span>
                      </div>
                    </td>
                    <td>
                      <span className={`pill sm role-${r.role}`}>{roleLabel(r.role)}</span>
                    </td>
                    <td className="r">
                      <button className="btn-sec sm" disabled={pending} onClick={() => deny(r.membershipId)}>
                        Decline
                      </button>
                      <button className="btn-prim sm" disabled={pending} onClick={() => approve(r.membershipId)} style={{ marginLeft: 8 }}>
                        Approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {members.length >= 6 ? mc.controls : null}
      <div className="tbl-card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th style={{ width: 160 }}>Role</th>
              {canManage ? <th style={{ width: 185 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {memberView.map((m) => (
              <tr key={m.membershipId}>
                <td>
                  <Link className="person" href={`/members/${m.userId}`} style={{ color: "inherit", textDecoration: "none" }}>
                    <span className="av">{initials(m.name)}</span>
                    <span>
                      {m.name}
                      {m.isSelf ? " (you)" : ""}
                      <small>{m.email}</small>
                    </span>
                  </Link>
                </td>
                <td>
                  {canManage && !m.isSelf ? (
                    <select
                      className="inp"
                      defaultValue={m.role}
                      disabled={pending}
                      onChange={(e) =>
                        changeRole(m.membershipId, e.target.value as Role)
                      }
                    >
                      <option value="owner">Owner</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`pill sm role-${m.role}`}>
                      {roleLabel(m.role)}
                    </span>
                  )}
                </td>
                {canManage ? (
                  <td className="r">
                    <div className="row-acts">
                      <button className="linkbtn xs" disabled={pending} onClick={() => exportData(m)} title="Export this person's data (GDPR)">
                        Export
                      </button>
                      {!m.isSelf ? (
                        <button className="linkbtn xs danger" disabled={pending} onClick={() => erase(m)} title="Erase personal data (GDPR)">
                          Erase
                        </button>
                      ) : null}
                      {!m.isSelf ? (
                        <button
                          className="icon-btn danger"
                          title="Remove from company"
                          disabled={pending}
                          onClick={() => remove(m)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invites.length > 0 ? (
        <>
          <div className="eyebrow" style={{ margin: "26px 0 10px" }}>
            Pending invitations
          </div>
          <div className="tbl-card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Email</th>
                  <th style={{ width: 120 }}>Role</th>
                  <th style={{ width: 160 }}>Expires</th>
                  {canManage ? <th style={{ width: 90 }} /> : null}
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>
                      <span className={`pill sm role-${i.role}`}>
                        {roleLabel(i.role as Role)}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)" }}>
                      {new Date(i.expiresAt).toLocaleDateString()}
                    </td>
                    {canManage ? (
                      <td className="r">
                        <button
                          className="linkbtn"
                          disabled={pending}
                          onClick={() => revoke(i.id)}
                        >
                          Revoke
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <SideWindow
        open={open}
        onClose={() => setOpen(false)}
        title="Invite member"
        subtitle="They’ll join this workspace once they accept"
        size="compact"
        footer={
          link ? (
            <div className="right">
              <button className="btn-prim" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          ) : (
            <>
              <button className="btn-sec" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <div className="right">
                <button
                  className="btn-prim"
                  disabled={!email}
                  onClick={submitInvite}
                >
                  Create invite
                </button>
              </div>
            </>
          )
        }
      >
        {error ? <div className="form-err">{error}</div> : null}

        {link ? (
          <div>
            <div className="field">
              <label>Invite link</label>
              <div className="copybox">
                <span style={{ flex: 1 }}>{link}</span>
                <button
                  className="btn-sec"
                  onClick={() => {
                    navigator.clipboard?.writeText(link);
                    flash("Link copied");
                  }}
                >
                  Copy
                </button>
              </div>
              <div className="form-note">
                Email delivery isn’t wired yet — share this link so they can
                accept. It expires in 7 days.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="inv-email">Email</label>
              <input
                className="inp"
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <div className="field">
              <label htmlFor="inv-role">Workspace role</label>
              <select
                className="inp"
                id="inv-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <div className="form-note">{ROLE_OPTIONS.find((r) => r.value === role)?.blurb}</div>
            </div>
            {teams.length > 0 ? (
              <div className="field">
                <label htmlFor="inv-team">
                  Add to team <span className="opt">(optional)</span>
                </label>
                <select
                  className="inp"
                  id="inv-team"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="">— none —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {teamId ? (
              <div className="field">
                <label htmlFor="inv-title">
                  Role title <span className="opt">(optional)</span>
                </label>
                <input
                  className="inp"
                  id="inv-title"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="e.g. CFO"
                />
              </div>
            ) : null}
          </>
        )}
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
