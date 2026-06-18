"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { useTableControls } from "@/components/TableControls";
import { initials } from "@/lib/util";
import { createTeam } from "./actions";

export type TeamCard = {
  id: string;
  name: string;
  description: string | null;
  leadName: string | null;
  memberCount: number;
  parentName: string | null;
};
export type ParentOpt = { id: string; name: string };

export function TeamsClient({
  workspaceId,
  canManage,
  teams,
  parents,
}: {
  workspaceId: string;
  canManage: boolean;
  teams: TeamCard[];
  parents: ParentOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentTeamId, setParentTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function submit() {
    setError(null);
    const res = await createTeam({
      workspaceId,
      name,
      description: description || null,
      parentTeamId: parentTeamId || null,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setName("");
    setDescription("");
    setParentTeamId("");
    flash("Team created");
    router.refresh();
  }

  const tc = useTableControls<TeamCard>(teams, {
    search: { placeholder: "Search teams…", text: (t) => `${t.name} ${t.leadName ?? ""} ${t.description ?? ""}` },
    sorts: [
      { key: "name", label: "Name (A–Z)", cmp: (a, b) => a.name.localeCompare(b.name) },
      { key: "members", label: "Most members", cmp: (a, b) => b.memberCount - a.memberCount },
      { key: "lead", label: "Lead (A–Z)", cmp: (a, b) => (a.leadName ?? "~").localeCompare(b.leadName ?? "~") },
    ],
    facets: [
      { key: "lead", label: "Lead", options: [
        { value: "has", label: "Has lead", test: (t) => !!t.leadName },
        { value: "no", label: "No lead", test: (t) => !t.leadName },
      ] },
      { key: "level", label: "Level", options: [
        { value: "top", label: "Top level", test: (t) => !t.parentName },
        { value: "sub", label: "Sub-team", test: (t) => !!t.parentName },
      ] },
    ],
  });

  return (
    <>
      <div className="summary">
        <div className="stat">
          <div className="num">{teams.length}</div>
          <div className="lab">Teams</div>
        </div>
        {canManage ? (
          <div className="actions">
            <button className="btn-prim" onClick={() => setOpen(true)}>
              New team
            </button>
          </div>
        ) : null}
      </div>

      {teams.length === 0 ? (
        <div className="card empty">No teams yet.</div>
      ) : (
        <>
        {teams.length >= 4 ? tc.controls : null}
        {tc.view.length === 0 ? (
          <div className="card empty">No teams match these filters.</div>
        ) : (
        <div className="tbl-card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Team</th>
                <th style={{ width: 210 }}>Lead</th>
                <th style={{ width: 150 }}>Level</th>
                <th style={{ width: 100 }} className="r">Members</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {tc.view.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link className="tname" href={`/teams/${t.id}`}>
                      <b>{t.name}</b>
                      {t.description ? <small>{t.description}</small> : null}
                    </Link>
                  </td>
                  <td>
                    {t.leadName ? (
                      <div className="person">
                        <span className="av sm green">{initials(t.leadName)}</span>
                        <span>{t.leadName}</span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--faint)" }}>No lead</span>
                    )}
                  </td>
                  <td>
                    {t.parentName ? (
                      <span className="pill sm draft">↳ {t.parentName}</span>
                    ) : (
                      <span className="pill sm open">Top level</span>
                    )}
                  </td>
                  <td className="r">{t.memberCount}</td>
                  <td className="r">
                    <Link className="linkbtn xs" href={`/teams/${t.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        </>
      )}

      <SideWindow
        open={open}
        onClose={() => setOpen(false)}
        title="New team"
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <div className="right">
              <button className="btn-prim" disabled={!name} onClick={submit}>
                Create team
              </button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        <div className="field">
          <label htmlFor="t-name">Team name</label>
          <input
            className="inp"
            id="t-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leadership team"
          />
        </div>
        <div className="field">
          <label htmlFor="t-desc">
            Description <span className="opt">(optional)</span>
          </label>
          <textarea
            className="inp"
            id="t-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {parents.length > 0 ? (
          <div className="field">
            <label htmlFor="t-parent">
              Parent team <span className="opt">(optional)</span>
            </label>
            <select
              className="inp"
              id="t-parent"
              value={parentTeamId}
              onChange={(e) => setParentTeamId(e.target.value)}
            >
              <option value="">— none (top level) —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
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
