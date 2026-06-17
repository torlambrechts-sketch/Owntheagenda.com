"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { initials } from "@/lib/util";
import {
  addTeamMember,
  removeTeamMember,
  setTeamLead,
  updateTeam,
  deleteTeam,
  setConsent,
} from "./actions";

export type TMRow = {
  teamMemberId: string;
  userId: string;
  name: string;
  email: string | null;
  roleTitle: string | null;
  isLead: boolean;
  consentShare: boolean;
  isSelf: boolean;
};
export type Addable = { userId: string; name: string; email: string | null };

export function TeamDetailClient({
  teamId,
  canManage,
  isAdmin,
  team,
  members,
  addable,
}: {
  teamId: string;
  canManage: boolean;
  isAdmin: boolean;
  team: { name: string; description: string | null };
  members: TMRow[];
  addable: Addable[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addUser, setAddUser] = useState("");
  const [addTitle, setAddTitle] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");

  const [error, setError] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }
  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) flash(res.error);
      else {
        flash(ok);
        router.refresh();
      }
    });
  }

  async function submitAdd() {
    setError(null);
    if (!addUser) return;
    const res = await addTeamMember({
      teamId,
      userId: addUser,
      roleTitle: addTitle || null,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setAddOpen(false);
    setAddUser("");
    setAddTitle("");
    flash("Member added");
    router.refresh();
  }

  async function submitEdit() {
    setError(null);
    const res = await updateTeam({ teamId, name, description });
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditOpen(false);
    flash("Team updated");
    router.refresh();
  }

  return (
    <>
      <div className="summary">
        <div className="stat">
          <div className="num">{members.length}</div>
          <div className="lab">Members</div>
        </div>
        {canManage ? (
          <div className="actions">
            <button className="btn-sec" onClick={() => setEditOpen(true)}>
              Edit team
            </button>
            <button
              className="btn-prim"
              onClick={() => {
                setAddUser("");
                setAddTitle("");
                setError(null);
                setAddOpen(true);
              }}
              disabled={addable.length === 0}
            >
              Add member
            </button>
          </div>
        ) : null}
      </div>

      <div className="tbl-card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th style={{ width: 150 }}>Role title</th>
              <th style={{ width: 120 }}>Consent</th>
              <th style={{ width: 200 }} />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.teamMemberId}>
                <td>
                  <div className="person">
                    <span className={`av${m.isLead ? " green" : ""}`}>
                      {initials(m.name)}
                    </span>
                    <span>
                      {m.name}
                      {m.isSelf ? " (you)" : ""}
                      <small>{m.email}</small>
                    </span>
                  </div>
                </td>
                <td style={{ color: "var(--muted)" }}>{m.roleTitle ?? "—"}</td>
                <td>
                  <span
                    className={`pill sm ${m.consentShare ? "open" : "draft"}`}
                  >
                    {m.consentShare ? "Shared" : "Private"}
                  </span>
                </td>
                <td className="r">
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      justifyContent: "flex-end",
                      alignItems: "center",
                    }}
                  >
                    {m.isLead ? (
                      <span className="pill sm interview">Lead</span>
                    ) : canManage ? (
                      <button
                        className="linkbtn"
                        disabled={pending}
                        onClick={() =>
                          run(() => setTeamLead(teamId, m.userId), "Lead set")
                        }
                      >
                        Make lead
                      </button>
                    ) : null}
                    {m.isSelf ? (
                      <button
                        className="btn-sec"
                        style={{ padding: "5px 10px" }}
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              setConsent(
                                teamId,
                                m.teamMemberId,
                                !m.consentShare,
                              ),
                            "Consent updated",
                          )
                        }
                      >
                        {m.consentShare ? "Make private" : "Share"}
                      </button>
                    ) : null}
                    {canManage && !m.isLead ? (
                      <button
                        className="icon-btn danger"
                        title="Remove from team"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Remove ${m.name} from this team?`))
                            run(
                              () => removeTeamMember(teamId, m.teamMemberId),
                              "Member removed",
                            );
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <div style={{ marginTop: 16 }}>
          <button
            className="btn-sec danger"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  "Delete this team? Its membership records will be removed.",
                )
              )
                run(() => deleteTeam(teamId), "Team deleted");
            }}
          >
            Delete team
          </button>
        </div>
      ) : null}

      {/* add member */}
      <SideWindow
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add member"
        subtitle="Choose someone already in this workspace"
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <div className="right">
              <button className="btn-prim" disabled={!addUser} onClick={submitAdd}>
                Add to team
              </button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        <div className="field">
          <label htmlFor="add-user">Person</label>
          <select
            className="inp"
            id="add-user"
            value={addUser}
            onChange={(e) => setAddUser(e.target.value)}
          >
            <option value="">— select —</option>
            {addable.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name} {a.email ? `· ${a.email}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-title">
            Role title <span className="opt">(optional)</span>
          </label>
          <input
            className="inp"
            id="add-title"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            placeholder="e.g. CFO"
          />
        </div>
      </SideWindow>

      {/* edit team */}
      <SideWindow
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit team"
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <div className="right">
              <button className="btn-prim" disabled={!name} onClick={submitEdit}>
                Save changes
              </button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        <div className="field">
          <label htmlFor="e-name">Team name</label>
          <input
            className="inp"
            id="e-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="e-desc">
            Description <span className="opt">(optional)</span>
          </label>
          <textarea
            className="inp"
            id="e-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
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
